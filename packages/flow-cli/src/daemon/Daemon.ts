import { type DaemonHandle, createDaemon } from '@wadeck/singleton-daemon-kit';
import type { ApprovalProvider, WorkspaceProvider } from 'extension-points';
import { WorkspaceManager } from 'flow-engine';
import * as yaml from 'js-yaml';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import type { WebSocket } from 'ws';

import { FlowConfigLoader, type FlowConfig } from '../config/FlowConfig';
import { PluginResolver } from '../config/PluginResolver.js';
import { type HookConfig, HookDispatcher } from 'shared-cli/HookDispatcher';
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

/**
 * Attempts to load plugin config. Returns empty providers when no config files are present
 * (backward-compatible). Re-throws on config parse errors or plugin load failures.
 */
async function tryResolvePlugins(): Promise<{
	workspaceProvider?: WorkspaceProvider;
	approvalProvider?: ApprovalProvider;
}> {
	const globalConfigPath = path.join(os.homedir(), '.flow', 'config.yml');
	const projectConfigPath = path.join(process.cwd(), '.flow', 'config.yml');
	const envOverride = process.env['FLOW_CONFIG'];

	if (!envOverride && !fs.existsSync(globalConfigPath) && !fs.existsSync(projectConfigPath)) {
		return {};
	}

	return PluginResolver.create().resolveAll();
}

async function startDaemon(config: FlowConfig = FlowConfigLoader.DEFAULT, daemonDir?: string): Promise<DaemonHandle> {
	const resolvedDaemonDir = daemonDir ?? path.join(os.homedir(), '.flow-daemon');
	const executionsDir = path.join(resolvedDaemonDir, 'executions');
	const logsDir = path.join(resolvedDaemonDir, 'logs');

	// Resolve plugins before createDaemon - onStart is synchronous so async must happen here
	const pluginProviders = await tryResolvePlugins();
	const perFlowWorkspaceResolver = await PluginResolver.create().createPerFlowWorkspaceResolver();

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
				WorkspaceManager.pruneOldWorkspaceDir(
					path.join(process.cwd(), '.agent-fleet', 'workspaces'),
					config.workspace.retainDays,
					config.workspace.maxWorkspaces
				);
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
					config.security.allowAbsolutePaths,
					config.limits.maxInjectedSteps,
					config.limits.maxStepsPerExecution,
					pluginProviders.workspaceProvider,
					pluginProviders.approvalProvider,
					perFlowWorkspaceResolver
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
					executionStore.markStepFailed(executionId, stepId, error);
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

export class Daemon {
	static async start(config: FlowConfig = FlowConfigLoader.DEFAULT, daemonDir?: string): Promise<DaemonHandle> {
		return startDaemon(config, daemonDir);
	}
}
