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
import { StepQueue } from './StepQueue';
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
		// Top-level hooks: key holds flow lifecycle hooks (onFlowStart, onStepStart, etc.)
		// tasks.hooks holds task hooks — handled separately in TaskIndex.ts
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
		// Allow flow files to be loaded from absolute paths outside cwd and home directory.
		// Disabled by default — enables path restriction guard when false.
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

	const stepQueue = new StepQueue();
	let workerPool: WorkerPool;
	let wsServer: WebSocketServer;
	let commandHandler: CommandHandler;
	let executionStore: ExecutionStore;
	let logWriter: LogWriter;
	let daemonHandle: DaemonHandle;

	fs.mkdirSync(resolvedDaemonDir, { recursive: true, mode: 0o700 });

	daemonHandle = await createDaemon({
		configDir: resolvedDaemonDir,
		idleTimeout: null,
		commands: {
			run: async (payload: unknown): Promise<unknown> => {
				const cmd = payload as Extract<ClientCommand, { type: 'run' }>;
				const flowHooks = loadFlowHooks(cmd.cwd);
				// Pass dispatcher directly into handleRun so each execution holds its own reference.
				// This prevents concurrent run commands from overwriting each other's hook config.
				return commandHandler.handleRun(cmd, new HookDispatcher(flowHooks));
			},
		},
		hooks: {
			onStart: (port: number) => {
				// Create required directories with owner-only permissions (0o700).
				// Without an explicit mode, permissions depend on the process umask and may
				// be world-readable (0755 on Linux with umask 022).
				fs.mkdirSync(executionsDir, { recursive: true, mode: 0o700 });
				fs.mkdirSync(logsDir, { recursive: true, mode: 0o700 });

				const wsPort = config.worker.wsPort ?? port + 1;
				executionStore = new ExecutionStore(executionsDir, config.logs.retainDays);
				logWriter = new LogWriter(logsDir, config.logs.retainDays);
				executionStore.pruneOldExecutions();
				const claudePath = resolveClaudePath();
				workerPool = new WorkerPool(config.queue.concurrency, port, wsPort, claudePath);
				// Pass the same ExecutionStore and LogWriter instances to CommandHandler so that
				// Daemon and CommandHandler share a single store, avoiding split-write races.
				commandHandler = new CommandHandler(
					resolvedDaemonDir,
					stepQueue,
					workerPool,
					undefined,
					executionStore,
					logWriter,
					config.security.allowAbsolutePaths
				);

				wsServer = new WebSocketServer(wsPort, handleWorkerMessage, handleWorkerClose);
			},
		},
	});

	function handleWorkerMessage(ws: WebSocket, message: WorkerToDaemon): void {
		switch (message.type) {
			case 'ready': {
				// Register the worker as idle (idempotent — works for both new connections and post-step ready).
				// Pass pid so WorkerPool can cancel the connect timeout on first registration.
				workerPool.registerWorker(ws, message.pid);
				// Try to assign a step
				commandHandler.tryDispatch();
				// If nothing to dispatch and no active executions, check for shutdown
				checkShutdown();
				break;
			}
			case 'step_completed': {
				try {
					const { executionId, stepId, output } = message;
					executionStore.markStepCompleted(executionId, stepId);
					stepQueue.onStepCompleted(executionId, stepId, output);
					logWriter.writeExecution(executionId, `Step ${stepId} completed`);
					commandHandler.dispatchHook(executionId, 'onStepEnd', { executionId, stepId });

					// Check if execution is now done
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

					// Worker signals ready after completing a step — handled in 'ready' above
					// (Worker sends ready after step_completed)
				} catch (err) {
					process.stderr.write(`[daemon] step_completed handler error: ${String(err)}\n`);
				}
				break;
			}
			case 'step_failed': {
				try {
					const { executionId, stepId, error } = message;
					executionStore.markStepFailed(executionId, stepId);
					stepQueue.onStepFailed(executionId, stepId);
					executionStore.markExecutionFailed(executionId);
					logWriter.writeExecution(executionId, `Step ${stepId} failed: ${error}`, 'error');
					commandHandler.dispatchHook(executionId, 'onStepFailed', { executionId, stepId, error });
					commandHandler.removeExecutionHooks(executionId);
					// Worker will send ready next
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
					stepQueue.injectSteps(executionId, steps);
					// H1: also register injected step IDs in ExecutionStore so the allDone check is accurate
					const current = executionStore.read(executionId);
					const newSteps = { ...current.steps };
					for (const s of steps) {
						newSteps[s.id] = { status: 'pending' };
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
		if (stepQueue.isEmpty() && !stepQueue.hasActiveExecutions() && !workerPool.hasActiveWorkers()) {
			workerPool.broadcastDone();
			wsServer.close();
			void daemonHandle.stop('idle');
		}
	}

	return daemonHandle;
}
