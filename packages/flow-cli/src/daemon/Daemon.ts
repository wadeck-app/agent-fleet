import { type DaemonHandle, createDaemon } from '@wadeck/singleton-daemon-kit';
import * as yaml from 'js-yaml';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WebSocket } from 'ws';

import { type HookConfig, HookDispatcher } from '../hooks/HookDispatcher';
import type { ClientCommand, WorkerToDaemon } from '../ipc/Protocol';
import { ExecutionStore } from '../storage/ExecutionStore';
import { LogWriter } from '../storage/LogWriter';
import { CommandHandler } from './CommandHandler';
import { WebSocketServer } from './WebSocketServer';
import { WorkerPool } from './WorkerPool';

function resolveClaudePath(): string {
	try {
		const cmd = process.platform === 'win32' ? 'where.exe claude' : 'which claude';
		const result = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
		return result.trim().split('\n')[0]?.trim() ?? '';
	} catch {
		// Claude not found on PATH — workers will need to locate it themselves
		process.stderr.write('[daemon] Warning: claude binary not found on PATH. Model steps may fail.\n');
		return '';
	}
}

function loadFlowHooks(cwd: string): Record<string, HookConfig[]> {
	const configPath = path.join(cwd, '.flows', 'config.yml');
	if (!fs.existsSync(configPath)) return {};
	try {
		const raw = yaml.load(fs.readFileSync(configPath, 'utf8'), { schema: yaml.JSON_SCHEMA }) as Record<
			string,
			unknown
		>;
		return (raw['hooks'] as Record<string, HookConfig[]> | undefined) ?? {};
	} catch (err) {
		process.stderr.write(`[daemon] Failed to parse .flows/config.yml: ${String(err)}\n`);
		return {};
	}
}

export interface FlowConfig {
	queue: { concurrency: number };
	logs: { retainDays: number };
	worker: { wsPort: number | null };
	security: {
		allowAbsolutePaths: boolean;
	};
}

export const DEFAULT_CONFIG: FlowConfig = {
	queue: { concurrency: 1 },
	logs: { retainDays: 30 },
	worker: { wsPort: null },
	security: {
		allowAbsolutePaths: false,
	},
};

export async function startDaemon(config: FlowConfig = DEFAULT_CONFIG, daemonDir?: string): Promise<DaemonHandle> {
	const resolvedDaemonDir = daemonDir ?? path.join(os.homedir(), '.flow-daemon');
	const executionsDir = path.join(resolvedDaemonDir, 'executions');
	const logsDir = path.join(resolvedDaemonDir, 'logs');

	let workerPool: WorkerPool;
	let wsServer: WebSocketServer;
	let commandHandler: CommandHandler;
	let executionStore: ExecutionStore;
	let logWriter: LogWriter;

	fs.mkdirSync(resolvedDaemonDir, { recursive: true, mode: 0o700 });

	const daemonHandle = await createDaemon({
		configDir: resolvedDaemonDir,
		idleTimeout: null,
		commands: {
			run: async (payload: unknown): Promise<unknown> => {
				const cmd = payload as Extract<ClientCommand, { type: 'run' }>;
				const flowHooks = loadFlowHooks(cmd.cwd);
				return commandHandler.handleRun(cmd, new HookDispatcher(flowHooks));
			},
		},
		hooks: {
			onStart: (port: number) => {
				fs.mkdirSync(executionsDir, { recursive: true, mode: 0o700 });
				fs.mkdirSync(logsDir, { recursive: true, mode: 0o700 });

				const wsPort = config.worker.wsPort ?? port + 1;
				executionStore = new ExecutionStore(executionsDir, config.logs.retainDays);
				logWriter = new LogWriter(logsDir, config.logs.retainDays);
				executionStore.pruneOldExecutions();
				const claudePath = resolveClaudePath();
				wsServer = new WebSocketServer(wsPort, handleWorkerMessage, handleWorkerClose);
				// Fire-and-forget: start() retries on EADDRINUSE (TIME_WAIT). Workers read port
				// lazily via getter — they are only spawned after tryDispatch(), which happens
				// after handleRun(), which happens after this onStart returns. By then start()
				// has resolved.
				wsServer.start().catch((err: Error) => {
					process.stderr.write(`[daemon] WebSocket server failed to start: ${err.message}\n`);
				});
				workerPool = new WorkerPool(config.queue.concurrency, port, () => wsServer.port, claudePath);
				commandHandler = new CommandHandler(
					resolvedDaemonDir,
					workerPool,
					undefined,
					executionStore,
					logWriter,
					config.security.allowAbsolutePaths
				);
			},
		},
	});

	function handleWorkerMessage(ws: WebSocket, message: WorkerToDaemon): void {
		switch (message.type) {
			case 'ready': {
				workerPool.registerWorker(ws, message.pid);
				commandHandler.tryDispatch();
				checkShutdown();
				break;
			}
			case 'step_completed': {
				try {
					const { executionId, stepId, output, meta } = message;
					executionStore.markStepCompleted(executionId, stepId);
					commandHandler.onStepCompleted(executionId, stepId, output, meta);
					logWriter.writeExecution(executionId, `Step ${stepId} completed`);
					commandHandler.dispatchHook(executionId, 'onStepEnd', { executionId, stepId });

					const state = executionStore.read(executionId);
					const allDone = Object.values(state.steps).every(
						s => s.status === 'completed' || s.status === 'failed'
					);
					if (allDone) {
						if (Object.values(state.steps).every(s => s.status === 'completed')) {
							executionStore.markExecutionCompleted(executionId);
							logWriter.writeExecution(executionId, `Execution completed`);
							commandHandler.dispatchHook(executionId, 'onFlowEnd', { executionId });
						} else {
							executionStore.markExecutionFailed(executionId);
							logWriter.writeExecution(executionId, `Execution failed`, 'error');
							commandHandler.dispatchHook(executionId, 'onFlowError', { executionId });
						}
						commandHandler.removeExecutionHooks(executionId);
					}

					// Try to dispatch newly ready steps
					commandHandler.tryDispatch();
				} catch (err) {
					process.stderr.write(`[daemon] step_completed handler error: ${String(err)}\n`);
				}
				break;
			}
			case 'step_failed': {
				try {
					const { executionId, stepId, error } = message;
					executionStore.markStepFailed(executionId, stepId);
					commandHandler.onStepFailed(executionId, stepId, error);
					// markExecutionFailed is now called inside onStepFailed only when the failure is terminal
					logWriter.writeExecution(executionId, `Step ${stepId} failed: ${error}`, 'error');
					commandHandler.dispatchHook(executionId, 'onStepFailed', { executionId, stepId, error });
				} catch (err) {
					process.stderr.write(`[daemon] step_failed handler error: ${String(err)}\n`);
				}
				break;
			}
			case 'log': {
				try {
					const { executionId, stepId, entry } = message;
					logWriter.write(executionId, stepId, entry);
				} catch (err) {
					process.stderr.write(`[daemon] log handler error: ${String(err)}\n`);
				}
				break;
			}
			case 'inject_steps': {
				const { executionId, steps } = message;
				try {
					commandHandler.injectSteps(executionId, steps);
					// H1: also register injected step IDs in ExecutionStore so the allDone check is accurate
					const current = executionStore.read(executionId);
					const newSteps = { ...current.steps };
					for (const s of steps) {
						newSteps[s.id] = { status: 'pending', injected: true };
					}
					executionStore.update(executionId, { steps: newSteps });
					commandHandler.tryDispatch();
				} catch (err) {
					logWriter.writeExecution(executionId, `Failed to inject steps: ${String(err)}`, 'error');
				}
				break;
			}
			default: {
				const _exhaustive: never = message;
				throw new Error(`Unknown worker message type: ${JSON.stringify(_exhaustive)}`);
			}
		}
	}

	function handleWorkerClose(ws: WebSocket): void {
		workerPool.removeWorker(ws);
		checkShutdown();
	}

	function checkShutdown(): void {
		if (commandHandler.isQueueEmpty() && !commandHandler.hasActiveExecutions() && !workerPool.hasActiveWorkers()) {
			workerPool.broadcastDone();
			wsServer.close();
			void daemonHandle.stop('idle');
		}
	}

	return daemonHandle;
}
