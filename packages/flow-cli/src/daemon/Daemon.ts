import { ConfigDir } from '@wadeck-app/shared-cli';
import { type HookConfig, HookDispatcher } from '@wadeck-app/shared-cli/HookDispatcher';
import { type DaemonHandle, createDaemon } from '@wadeck-app/singleton-daemon-kit';
import type { ApprovalProvider, WorkspaceProvider } from 'extension-points';
import { WorkspaceManager } from 'flow-engine';
import * as yaml from 'js-yaml';
import { execSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';
import type { WebSocket } from 'ws';

import { DefaultProjectResolver } from '../config/DefaultProjectResolver.js';
import { type FlowConfig, FlowConfigLoader } from '../config/FlowConfig';
import { PluginResolver } from '../config/PluginResolver.js';
import type { ClientCommand, WorkerToDaemon } from '../ipc/Protocol';
import { ExecutionStore } from '../storage/ExecutionStore';
import { LogWriter } from '../storage/LogWriter';
import { CommandHandler } from './CommandHandler';
import { ForkWorkerSource } from './ForkWorkerSource.js';
import { SharedTokenAuthenticator } from './SharedTokenAuthenticator.js';
import { WebSocketServer } from './WebSocketServer';
import { WorkerProvisioner } from './WorkerProvisioner.js';
import { WorkerRegistry } from './WorkerRegistry.js';
import { contactDeclaredSources } from './WorkerSourceContact.js';
import { WorkerSourceRegistry } from './WorkerSourceRegistry.js';

// Exported for testing. Writes a single NDJSON daemon lifecycle entry to logsDir.
export function writeDaemonLog(logsDir: string, level: 'info' | 'error', msg: string): void {
	const today = new Date().toISOString().slice(0, 10);
	const line = JSON.stringify({ ts: new Date().toISOString(), level, msg }) + '\n';
	const filePath = path.join(logsDir, `${today}.ndjson`);
	try {
		fs.mkdirSync(logsDir, { recursive: true });
		fs.appendFileSync(filePath, line, 'utf8');
	} catch (err) {
		process.stderr.write(`[daemon] Failed to write daemon log: ${String(err)}\n`);
	}
}

function resolveClaudePath(): string {
	try {
		const cmd = process.platform === 'win32' ? 'where.exe claude' : 'which claude';
		const result = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true });
		return result.trim().split('\n')[0]?.trim() ?? '';
	} catch {
		// Claude not found on PATH -- workers will need to locate it themselves
		process.stderr.write('[daemon] Warning: claude binary not found on PATH. Model steps may fail.\n');
		return '';
	}
}

/**
 * Prunes the workspaces of the project a run belongs to.
 *
 * Keyed on the requesting client's cwd, never on the daemon's own: the daemon is
 * a per-user machine-wide singleton serving every project concurrently, so its
 * launch directory would prune an unrelated project's workspaces (Q#22).
 */
function pruneProjectWorkspaces(cwd: string, config: FlowConfig): void {
	let projectRoot: string;
	try {
		projectRoot = new DefaultProjectResolver().resolve(cwd).projectRoot;
	} catch (err) {
		process.stderr.write(`[daemon] Skipped workspace pruning: ${getErrorMessage(err)}\n`);
		return;
	}
	WorkspaceManager.pruneOldWorkspaceDir(
		path.join(projectRoot, '.flow', 'workspaces'),
		config.workspace.retainDays,
		config.workspace.maxWorkspaces
	);
}

/**
 * Reads the `hooks:` section of the project's `.flow/config.yml`.
 *
 * Resolves the project root from `cwd` rather than reading `<cwd>/.flow/config.yml`
 * directly, so a run started from a subdirectory still picks up the project's hooks.
 */
export function loadFlowHooks(cwd: string): Record<string, HookConfig[]> {
	let projectRoot: string;
	try {
		projectRoot = new DefaultProjectResolver().resolve(cwd).projectRoot;
	} catch (err) {
		process.stderr.write(`[daemon] No flow hooks loaded: ${getErrorMessage(err)}\n`);
		return {};
	}
	const configPath = path.join(projectRoot, '.flow', 'config.yml');
	if (!fs.existsSync(configPath)) return {};
	let raw: Record<string, unknown> | null;
	try {
		raw = yaml.load(fs.readFileSync(configPath, 'utf8'), { schema: yaml.JSON_SCHEMA }) as Record<
			string,
			unknown
		> | null;
	} catch (err) {
		// Fails rather than running the flow with no hooks: silently dropping every
		// hook because of a typo is worse than refusing to start.
		throw new Error(`Failed to parse flow config at "${configPath}": ${String(err)}`);
	}
	return (raw?.['hooks'] as Record<string, HookConfig[]> | undefined) ?? {};
}

/**
 * True when a config file actually declares a `plugins:` section.
 *
 * Tested instead of mere file existence because the global config now lives at
 * `~/.config/flow/config.yml` (D#58) -- the same file that carries daemon
 * settings such as `queue:` and `autoUpdate:`. Keying on existence would make
 * every user who has ever set `queue.concurrency` fail with "No workspace
 * provider configured", since `resolveAll()` requires one by design (P-4).
 */
export function declaresPlugins(configPath: string): boolean {
	if (!fs.existsSync(configPath)) return false;
	let raw: Record<string, unknown> | null;
	try {
		raw = yaml.load(fs.readFileSync(configPath, 'utf8'), { schema: yaml.JSON_SCHEMA }) as Record<
			string,
			unknown
		> | null;
	} catch (err) {
		// A config file that cannot be parsed is a hard error: guessing either way
		// would either hide the typo or blame a missing workspace provider for it.
		throw new Error(`Failed to parse flow config at "${configPath}": ${String(err)}`);
	}
	return raw?.['plugins'] !== undefined;
}

/** True when a config file declares a `plugins.authentication` section. */
function declaresAuthenticationPlugin(configPath: string): boolean {
	if (!fs.existsSync(configPath)) return false;
	let raw: Record<string, unknown> | null;
	try {
		raw = yaml.load(fs.readFileSync(configPath, 'utf8'), { schema: yaml.JSON_SCHEMA }) as Record<
			string,
			unknown
		> | null;
	} catch {
		// declaresPlugins already reports a parse failure with the path; do not double-report.
		return false;
	}
	const plugins = raw?.['plugins'];
	if (typeof plugins !== 'object' || plugins === null) return false;
	// violations-suppress: ts/no-unsafe-type-cast parsed YAML has no static shape; the plugins key is checked before use
	return (plugins as Record<string, unknown>)['authentication'] !== undefined;
}

/**
 * Attempts to load plugin config. Returns empty providers when no config file declares
 * a `plugins:` section (backward-compatible). Re-throws on config parse errors or
 * plugin load failures.
 */
async function tryResolvePlugins(): Promise<{
	workspaceProvider?: WorkspaceProvider;
	approvalProvider?: ApprovalProvider;
}> {
	const globalConfigPath = path.join(ConfigDir.get('flow'), 'config.yml');
	const envOverride = process.env['FLOW_CONFIG'];

	// The daemon is a per-user machine-wide singleton, so it has no single project.
	// Resolve the project from the launching cwd instead of reading `<cwd>/.flow/`
	// literally; absence is not an error here because a global config alone is enough.
	let projectConfigPath: string | null = null;
	try {
		const { projectRoot } = new DefaultProjectResolver().resolve(process.cwd());
		projectConfigPath = path.join(projectRoot, '.flow', 'config.yml');
	} catch {
		// No project at the launch directory -- global config still applies.
	}

	if (
		!envOverride &&
		!declaresPlugins(globalConfigPath) &&
		(projectConfigPath === null || !declaresPlugins(projectConfigPath))
	) {
		return {};
	}

	// The authentication point is declared but has no resolution path yet: the daemon
	// constructs the built-in shared-token implementation directly. Saying so is required
	// -- loading a plugin section and ignoring it would leave the user believing their own
	// authenticator was in force when it never ran.
	for (const configPath of [globalConfigPath, projectConfigPath]) {
		if (configPath !== null && declaresAuthenticationPlugin(configPath)) {
			throw new Error(
				`"${configPath}" configures plugins.authentication, but the daemon does not load an authentication plugin yet -- it uses the built-in shared-token implementation. Remove that section, or track the work to make it pluggable, rather than assuming it is active.`
			);
		}
	}

	return PluginResolver.create().resolveAll();
}

async function startDaemon(config: FlowConfig = FlowConfigLoader.DEFAULT, daemonDir?: string): Promise<DaemonHandle> {
	const resolvedDaemonDir = daemonDir ?? ConfigDir.get('flow');
	const executionsDir = path.join(resolvedDaemonDir, 'executions');
	const logsDir = path.join(resolvedDaemonDir, 'logs');

	// Resolve plugins before createDaemon - onStart is synchronous so async must happen here
	const pluginProviders = await tryResolvePlugins();
	const perFlowWorkspaceResolver = await PluginResolver.create().createPerFlowWorkspaceResolver();

	let workerRegistry: WorkerRegistry;
	let workerProvisioner: WorkerProvisioner;
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
				pruneProjectWorkspaces(cmd.cwd, config);
				const flowHooks = loadFlowHooks(cmd.cwd);
				return commandHandler.handleRun(cmd, new HookDispatcher(flowHooks));
			},
			// Live connections only: a declared source with nothing connected is not
			// capacity, and reporting it as available would suggest a step could reach it (D#4).
			workers: (): unknown => workerRegistry.summarize(),
		},
		health: () => ({
			status: 'ok' as const,
			running_executions: workerRegistry?.liveCount ?? 0,
		}),
		hooks: {
			onStart: (port: number) => {
				fs.mkdirSync(executionsDir, { recursive: true, mode: 0o700 });
				fs.mkdirSync(logsDir, { recursive: true, mode: 0o700 });
				writeDaemonLog(logsDir, 'info', 'Daemon started');

				const wsPort = config.worker.wsPort ?? port + 1;
				executionStore = new ExecutionStore(executionsDir, config.logs.retainDays);
				logWriter = new LogWriter(logsDir, config.logs.retainDays);
				executionStore.pruneOldExecutions();
				// Workspace pruning is per-project and so runs per request, not here:
				// this daemon is shared across projects and its launch directory says
				// nothing about whose workspaces should be pruned.
				const claudePath = resolveClaudePath();
				if (!claudePath) {
					writeDaemonLog(logsDir, 'error', 'claude binary not found on PATH - model steps may fail');
				}
				wsServer = new WebSocketServer(wsPort, handleWorkerMessage, handleWorkerClose);
				// Fire-and-forget: start() retries on EADDRINUSE (TIME_WAIT). Workers read port
				// lazily via getter -- they are only spawned after tryDispatch(), which happens
				// after handleRun(), which happens after this onStart returns. By then start()
				// has resolved.
				wsServer.start().catch((err: Error) => {
					process.stderr.write(`[daemon] WebSocket server failed to start: ${String(err)}\n`);
				});
				workerRegistry = new WorkerRegistry();
				const forkSource = new ForkWorkerSource(port, () => wsServer.port, claudePath);
				const sourceRegistry = new WorkerSourceRegistry(resolvedDaemonDir);
				workerProvisioner = new WorkerProvisioner(
					config.queue.concurrency,
					workerRegistry,
					forkSource,
					new SharedTokenAuthenticator(resolvedDaemonDir, sourceRegistry),
					sourceRegistry
				);
				commandHandler = new CommandHandler(
					resolvedDaemonDir,
					workerRegistry,
					workerProvisioner,
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

				// D#54: ask each declared source to produce a worker. The daemon pushes; a
				// worker never polls. Fire-and-forget on purpose -- nothing waits for a worker
				// to appear (D#51, D#66), and dispatch only ever targets a live connection
				// (D#4), so a source that produces nothing simply has no capacity here.
				void contactDeclaredSources(
					sourceRegistry.list(),
					`ws://127.0.0.1:${String(wsServer.port)}`,
					message => {
						process.stderr.write(`[daemon] ${message}\n`);
						writeDaemonLog(logsDir, 'error', message);
					}
				).catch((err: unknown) => {
					process.stderr.write(`[daemon] contacting worker sources failed: ${getErrorMessage(err)}\n`);
				});
			},
		},
	});

	function handleWorkerMessage(ws: WebSocket, message: WorkerToDaemon): void {
		switch (message.type) {
			case 'ready': {
				// Refused registrations are already reported and the socket terminated;
				// dispatching afterwards would target a worker that was rejected.
				if (!workerProvisioner.registerWorker(ws, message)) break;
				commandHandler.tryDispatch();
				checkShutdown();
				break;
			}
			case 'step_completed': {
				try {
					const { assignmentId, executionId, stepId, output, meta } = message;
					if (!commandHandler.verifyAssignment(ws, assignmentId, executionId, stepId)) break;
					// The outcome is accepted from here on, so the assignment is closed and
					// the same result cannot be replayed.
					commandHandler.settleAssignment(assignmentId);
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
					writeDaemonLog(logsDir, 'error', `step_completed handler error: ${String(err)}`);
				}
				break;
			}
			case 'step_failed': {
				try {
					const { assignmentId, executionId, stepId, error, output } = message;
					if (!commandHandler.verifyAssignment(ws, assignmentId, executionId, stepId)) break;
					commandHandler.settleAssignment(assignmentId);
					executionStore.markStepFailed(executionId, stepId, error);
					commandHandler.onStepFailed(executionId, stepId, error, output);
					// markExecutionFailed is now called inside onStepFailed only when the failure is terminal
					logWriter.writeExecution(executionId, `Step ${stepId} failed: ${error}`, 'error');
					commandHandler.dispatchHook(executionId, 'onStepFailed', { executionId, stepId, error });
				} catch (err) {
					process.stderr.write(`[daemon] step_failed handler error: ${String(err)}\n`);
					writeDaemonLog(logsDir, 'error', `step_failed handler error: ${String(err)}`);
				}
				break;
			}
			case 'log': {
				try {
					const { assignmentId, executionId, stepId, entry } = message;
					// Logs are bound too: they land in another execution's log file otherwise.
					if (!commandHandler.verifyAssignment(ws, assignmentId, executionId, stepId)) break;
					logWriter.write(executionId, stepId, entry);
				} catch (err) {
					process.stderr.write(`[daemon] log handler error: ${String(err)}\n`);
				}
				break;
			}
			case 'inject_steps': {
				const { assignmentId, executionId, steps } = message;
				if (!commandHandler.verifyAssignmentScope(ws, assignmentId, executionId)) break;
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
		// A disconnected worker can no longer report on its assignments; leaving them
		// outstanding would let a reconnecting socket be matched against stale work.
		// Classifying and re-dispatching the interrupted step is Phase 2b (D#65).
		commandHandler.revokeWorkerAssignments(ws);
		workerRegistry.remove(ws);
		checkShutdown();
	}

	function checkShutdown(): void {
		if (
			commandHandler.isQueueEmpty() &&
			!commandHandler.hasActiveExecutions() &&
			!workerRegistry.hasBusyWorkers()
		) {
			// Only the workers this daemon forked are told to exit. A worker the user
			// launched in a terminal must survive an idle period: it is registered, not
			// owned (D#51), and telling it to exit is what made `flow worker` unusable
			// (D#48).
			workerRegistry.broadcastToEphemeral({ type: 'done' });
			// Their sockets are still closed, or the daemon could never exit: an open
			// WebSocket keeps the event loop alive, leaving an orphan process holding no
			// port file. The worker re-registers once a daemon is available again.
			workerRegistry.disconnectExternal();
			wsServer.close();
			writeDaemonLog(logsDir, 'info', 'Daemon stopped (idle)');
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
