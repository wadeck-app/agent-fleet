import { type DaemonHandle, createDaemon } from '@wadeck/singleton-daemon-kit';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WebSocket } from 'ws';
import * as yaml from 'js-yaml';

import { HookDispatcher, type HookConfig } from '../hooks/HookDispatcher.js';
import type { ClientCommand, WorkerToDaemon } from '../ipc/Protocol.js';
import { ExecutionStore } from '../storage/ExecutionStore.js';
import { LogWriter } from '../storage/LogWriter.js';
import { CommandHandler } from './CommandHandler.js';
import { StepQueue } from './StepQueue.js';
import { WebSocketServer } from './WebSocketServer.js';
import { WorkerPool } from './WorkerPool.js';

function loadFlowHooks(cwd: string): Record<string, HookConfig[]> {
	const configPath = path.join(cwd, '.flows', 'config.yml');
	if (!fs.existsSync(configPath)) return {};
	try {
		const raw = yaml.load(fs.readFileSync(configPath, 'utf8')) as Record<string, unknown>;
		// Top-level hooks: key holds flow lifecycle hooks (onFlowStart, onStepStart, etc.)
		// tasks.hooks holds task hooks — handled separately in TaskIndex.ts
		return (raw['hooks'] as Record<string, HookConfig[]> | undefined) ?? {};
	} catch {
		return {};
	}
}

export interface FlowConfig {
	queue: { concurrency: number };
	logs: { retainDays: number };
	worker: { wsPort: number | null };
}

export const DEFAULT_CONFIG: FlowConfig = {
	queue: { concurrency: 1 },
	logs: { retainDays: 30 },
	worker: { wsPort: null },
};

export async function startDaemon(config: FlowConfig = DEFAULT_CONFIG): Promise<DaemonHandle> {
	const daemonDir = path.join(os.homedir(), '.flow-daemon');
	const executionsDir = path.join(daemonDir, 'executions');
	const logsDir = path.join(daemonDir, 'logs');

	const stepQueue = new StepQueue();
	let workerPool: WorkerPool;
	let wsServer: WebSocketServer;
	let commandHandler: CommandHandler;
	let executionStore: ExecutionStore;
	let logWriter: LogWriter;
	let daemonHandle: DaemonHandle;

	daemonHandle = await createDaemon({
		configDir: daemonDir,
		idleTimeout: null,
		commands: {
			run: async (payload: unknown): Promise<unknown> => {
				const cmd = payload as Extract<ClientCommand, { type: 'run' }>;
				const flowHooks = loadFlowHooks(cmd.cwd);
				commandHandler.setHookDispatcher(new HookDispatcher(flowHooks));
				return commandHandler.handleRun(cmd);
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
				workerPool = new WorkerPool(config.queue.concurrency, port, wsPort);
				commandHandler = new CommandHandler(daemonDir, stepQueue, workerPool, undefined);

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
					commandHandler.dispatchHook('onStepEnd', { executionId, stepId });

					// Check if execution is now done
					const state = executionStore.read(executionId);
					const allDone = Object.values(state.steps).every(
						s => s.status === 'completed' || s.status === 'failed'
					);
					if (allDone) {
						if (Object.values(state.steps).every(s => s.status === 'completed')) {
							executionStore.markExecutionCompleted(executionId);
							logWriter.writeExecution(executionId, `Execution completed`);
							commandHandler.dispatchHook('onFlowEnd', { executionId });
						} else {
							executionStore.markExecutionFailed(executionId);
							logWriter.writeExecution(executionId, `Execution failed`, 'error');
							commandHandler.dispatchHook('onFlowError', { executionId });
						}
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
					commandHandler.dispatchHook('onStepFailed', { executionId, stepId, error });
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
