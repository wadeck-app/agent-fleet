import { type DaemonHandle, createDaemon, createDaemonClient } from '@wadeck/singleton-daemon-kit';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WebSocket } from 'ws';

import { CommandHandler } from '../daemon/CommandHandler.js';
import { DEFAULT_CONFIG, type FlowConfig } from '../daemon/Daemon.js';
import { StepQueue } from '../daemon/StepQueue.js';
import { WebSocketServer } from '../daemon/WebSocketServer.js';
import { WorkerPool } from '../daemon/WorkerPool.js';
import type { ClientCommand, DaemonResponse, ExecutionState } from '../ipc/Protocol.js';
import type { WorkerToDaemon } from '../ipc/Protocol.js';
import { ExecutionStore } from '../storage/ExecutionStore.js';
import { LogWriter } from '../storage/LogWriter.js';

type FlowCommands = { run: (payload: unknown) => Promise<DaemonResponse> };

export interface TestDaemonContext {
	daemonDir: string;
	daemonHandle: DaemonHandle;
	client: ReturnType<typeof createDaemonClient<FlowCommands>>;
	[Symbol.asyncDispose](): Promise<void>;
}

export async function startTestDaemon(config: FlowConfig = DEFAULT_CONFIG): Promise<TestDaemonContext> {
	const daemonDir = path.join(os.tmpdir(), `flow-test-${crypto.randomUUID()}`);
	const executionsDir = path.join(daemonDir, 'executions');
	const logsDir = path.join(daemonDir, 'logs');
	fs.mkdirSync(executionsDir, { recursive: true });
	fs.mkdirSync(logsDir, { recursive: true });

	const stepQueue = new StepQueue();
	let workerPool: WorkerPool;
	let wsServer: WebSocketServer;
	let commandHandler: CommandHandler;
	let daemonHandle: DaemonHandle;

	daemonHandle = await createDaemon<FlowCommands>({
		configDir: daemonDir,
		idleTimeout: null,
		commands: {
			run: async (payload: unknown): Promise<DaemonResponse> => {
				const cmd = payload as Extract<ClientCommand, { type: 'run' }>;
				return commandHandler.handleRun(cmd);
			},
		},
		hooks: {
			onStart: (port: number) => {
				const wsPort = config.worker.wsPort ?? port + 1;
				workerPool = new WorkerPool(config.queue.concurrency, port, wsPort);
				commandHandler = new CommandHandler(daemonDir, stepQueue, workerPool);
				wsServer = new WebSocketServer(wsPort, handleWorkerMessage, handleWorkerClose);
			},
		},
	});

	function handleWorkerMessage(ws: WebSocket, message: WorkerToDaemon): void {
		const executionStore = new ExecutionStore(executionsDir);
		const logWriter = new LogWriter(logsDir, config.logs.retainDays);

		switch (message.type) {
			case 'ready': {
				// Register as idle (idempotent — new connection or post-step ready)
				workerPool.registerWorker(ws, message.pid);
				commandHandler.tryDispatch();
				checkShutdown();
				break;
			}
			case 'step_completed': {
				const { executionId, stepId, output } = message;
				executionStore.markStepCompleted(executionId, stepId);
				stepQueue.onStepCompleted(executionId, stepId, output);
				logWriter.writeExecution(executionId, `Step ${stepId} completed`);

				const state = executionStore.read(executionId);
				const allDone = Object.values(state.steps).every(
					s => s.status === 'completed' || s.status === 'failed'
				);
				if (allDone) {
					if (Object.values(state.steps).every(s => s.status === 'completed')) {
						executionStore.markExecutionCompleted(executionId);
					} else {
						executionStore.markExecutionFailed(executionId);
					}
				}
				break;
			}
			case 'step_failed': {
				const { executionId, stepId, error } = message;
				executionStore.markStepFailed(executionId, stepId);
				stepQueue.onStepFailed(executionId, stepId);
				executionStore.markExecutionFailed(executionId);
				logWriter.writeExecution(executionId, `Step ${stepId} failed: ${error}`, 'error');
				break;
			}
			case 'log': {
				logWriter.write(message.executionId, message.stepId, message.entry);
				break;
			}
			case 'inject_steps': {
				const { executionId, steps } = message;
				try {
					stepQueue.injectSteps(executionId, steps);
					commandHandler.tryDispatch();
				} catch {
					// Ignore injection errors in test helper
				}
				break;
			}
			default: {
				const _exhaustive: never = message;
				throw new Error(`Unknown message type: ${JSON.stringify(_exhaustive)}`);
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

	const client = createDaemonClient<FlowCommands>({
		configDir: daemonDir,
		commands: {
			run: async p => {
				return p as DaemonResponse;
			},
		},
	});

	return {
		daemonDir,
		daemonHandle,
		client,
		async [Symbol.asyncDispose]() {
			await daemonHandle.stop('command');
			fs.rmSync(daemonDir, { recursive: true, force: true });
		},
	};
}

export function readExecutionFile(daemonDir: string, executionId: string): ExecutionState {
	const filePath = path.join(daemonDir, 'executions', `${executionId}.json`);
	return JSON.parse(fs.readFileSync(filePath, 'utf8')) as ExecutionState;
}

export function waitForExecution(daemonDir: string, executionId: string, timeoutMs = 10000): Promise<ExecutionState> {
	return new Promise((resolve, reject) => {
		const start = Date.now();
		const interval = setInterval(() => {
			try {
				const state = readExecutionFile(daemonDir, executionId);
				if (state.status === 'completed' || state.status === 'failed') {
					clearInterval(interval);
					resolve(state);
				} else if (Date.now() - start > timeoutMs) {
					clearInterval(interval);
					reject(new Error(`Execution ${executionId} did not complete within ${timeoutMs}ms`));
				}
			} catch {
				if (Date.now() - start > timeoutMs) {
					clearInterval(interval);
					reject(new Error(`Execution file not found within ${timeoutMs}ms`));
				}
			}
		}, 100);
	});
}
