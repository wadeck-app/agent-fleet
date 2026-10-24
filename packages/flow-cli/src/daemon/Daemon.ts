import { type DaemonHandle, createDaemon } from '@wadeck-app/singleton-daemon-kit';
import { executionsDirOf, logsDirOf } from 'flow-core';
import * as fs from 'node:fs';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import { VERSION } from '../cli/version.js';
import { type FlowConfig, FlowConfigLoader } from '../config/FlowConfig';
import { flowConfigDir } from '../config/FlowConfigDir.js';
import { PluginResolver } from '../config/PluginResolver.js';
import { FlowEventMapper } from '../events/FlowEventMapper.js';
import type { FlowEventPublisher } from '../events/FlowEventPublisher.js';
import { flowEventsStatusLine } from '../events/FlowEventsStatusLine.js';
import { NullFlowEventPublisher } from '../events/NullFlowEventPublisher.js';
import { ExecutionMasks } from '../secrets/ExecutionMasks';
import { ExecutionStore } from '../storage/ExecutionStore';
import { LogWriter } from '../storage/LogWriter';
import { CommandHandler } from './CommandHandler';
import { buildDaemonHealth } from './DaemonHealth';
import { DaemonIdleShutdown } from './DaemonIdleShutdown.js';
import { writeDaemonLog } from './DaemonLog.js';
import type { DaemonRuntime } from './DaemonRuntime.js';
import { DaemonSecrets } from './DaemonSecrets.js';
import { DaemonSourceContact } from './DaemonSourceContact.js';
import { DaemonWorkerMessageHandler } from './DaemonWorkerMessageHandler.js';
import { ForkWorkerSource } from './ForkWorkerSource.js';
import { LaunchTokenIssuer } from './LaunchTokenIssuer.js';
import { RelayRegistry } from './RelayRegistry.js';
import { SharedTokenAuthenticator } from './SharedTokenAuthenticator.js';
import { WebSocketServer } from './WebSocketServer';
import { WorkerProvisioner } from './WorkerProvisioner.js';
import { WorkerRegistry } from './WorkerRegistry.js';
import { WorkerSourceRegistry } from './WorkerSourceRegistry.js';
import { createDaemonCommands } from './createDaemonCommands.js';
import { publishWorkerPort } from './publishWorkerPort.js';
import { registerAppCoreModules } from './registerAppCoreModules.js';
import { resolveClaudePath } from './resolveClaudePath.js';
import { startPeriodicUpdateCheck } from './startPeriodicUpdateCheck.js';
import { tryResolvePlugins } from './tryResolvePlugins.js';

/** How often the daemon looks for a step whose worker went quiet. */
const STALLED_SWEEP_INTERVAL_MS = 60_000;

export interface StartDaemonOptions {
	/**
	 * Port for the daemon's command server. Omitted means the standard one, which is how a
	 * user's daemon becomes discoverable.
	 *
	 * Zero asks the OS for a free port, which is what tests need: the standard port is a
	 * fixed number shared with the user's own running daemon and with every other test
	 * daemon, so they collide and the loser writes a port file nothing is listening on.
	 */
	port?: number;
	/**
	 * Whether the daemon stops itself once it has nothing left to do. Omitted means yes, which is what a user's
	 * daemon does: the next `flow run` starts a new one. Tests pass false, because their client never restarts a
	 * daemon, so a second run sent after the first ended raced the idle timer and met a dead server.
	 */
	stopWhenIdle?: boolean;
	/**
	 * The packaged app-module to register with app-core on start. Omitted means the daemon does not
	 * talk to app-core at all (tests and embedders); the CLI entry always passes it.
	 */
	appCoreModules?: { id: string; manifestPath: string }[];
	/**
	 * Where the lifecycle events (flow.execution.*, flow.step.*) go. Omitted means none are published,
	 * which is what tests and embedders want; the CLI entry passes the queue-backed one.
	 */
	eventPublisher?: FlowEventPublisher;
}

async function startDaemon(
	config: FlowConfig = FlowConfigLoader.DEFAULT,
	daemonDir?: string,
	options: StartDaemonOptions = {}
): Promise<DaemonHandle> {
	const resolvedDaemonDir = daemonDir ?? flowConfigDir();
	const executionsDir = executionsDirOf(resolvedDaemonDir);
	const logsDir = logsDirOf(resolvedDaemonDir);
	const eventPublisher =
		options.eventPublisher ??
		new NullFlowEventPublisher('this daemon was started without an event publisher (embedded or test run)');
	/** The flush started at shutdown, kept so the handle's stop() can wait for it. */
	let shutdownFlush: Promise<void> = Promise.resolve();

	// Resolve plugins before createDaemon - onStart is synchronous so async must happen here
	const pluginProviders = await tryResolvePlugins();
	const perFlowWorkspaceResolver = await PluginResolver.create().createPerFlowWorkspaceResolver();

	/** Built by onStart; the commands, message handler and idle shutdown below only run after it. */
	let runtime: DaemonRuntime | undefined;
	const getRuntime = (): DaemonRuntime => {
		if (runtime === undefined) {
			throw new Error('The daemon used its components before its start hook built them.');
		}
		return runtime;
	};
	/** The port workers must dial, known only once the listener has bound. */
	let workerListenerPort: number | undefined;
	/** Held so shutdown can stop it: an unref'd timer still fires while the daemon tears down. */
	let stalledSweep: ReturnType<typeof setInterval> | undefined;
	/**
	 * Held so shutdown can stop it. Keeps this daemon's own updater cache fresh, see
	 * `startPeriodicUpdateCheck`.
	 */
	let updateCheckTimer: ReturnType<typeof setInterval> | undefined;

	const idleShutdown = new DaemonIdleShutdown(
		logsDir,
		getRuntime,
		() => {
			if (stalledSweep !== undefined) {
				clearInterval(stalledSweep);
			}
		},
		() => daemonHandle.stop('idle')
	);
	const stopWhenIdle = options.stopWhenIdle ?? true;
	const workerMessages = new DaemonWorkerMessageHandler(logsDir, getRuntime, () => {
		if (stopWhenIdle) {
			idleShutdown.checkShutdown();
		}
	});

	fs.mkdirSync(resolvedDaemonDir, { recursive: true, mode: 0o700 });

	const daemonHandle: DaemonHandle = await createDaemon({
		configDir: resolvedDaemonDir,
		appVersion: VERSION,
		...(options.port !== undefined ? { port: options.port } : {}),
		idleTimeout: null,
		commands: createDaemonCommands(config, getRuntime),
		health: () =>
			buildDaemonHealth({
				isIdle: () => idleShutdown.isIdle(),
				isDraining: () => getRuntime().commandHandler.isDraining(),
			}),
		hooks: {
			// Fires on every stop() path (idle, signal, command, error, update -- see
			// singleton-daemon-kit's `handle.stop()`), unlike the idle-only teardown inside
			// `DaemonIdleShutdown`. The update-check timer is unref'd, so leaking it past
			// shutdown costs nothing once the process actually exits -- but a daemon stopped
			// in-process (tests, or `flow daemon stop` reusing the same process) must not keep
			// firing it against a torn-down daemon.
			onShutdown: () => {
				if (updateCheckTimer !== undefined) {
					clearInterval(updateCheckTimer);
				}
				// The hook is synchronous: the flush runs on, and stop() below waits for it. Pushes in flight
				// also keep the process alive until they settle.
				shutdownFlush = eventPublisher.flush().catch((err: unknown) => {
					writeDaemonLog(logsDir, 'error', `Queue events: flush at shutdown failed: ${getErrorMessage(err)}`);
				});
			},
			onStart: (port: number) => {
				fs.mkdirSync(executionsDir, { recursive: true, mode: 0o700 });
				fs.mkdirSync(logsDir, { recursive: true, mode: 0o700 });
				writeDaemonLog(logsDir, 'info', 'Daemon started');
				// One line, once: whether events will reach the queue, whether the queue documents them, and how to
				// fix it if not. The events are declared only when the queue is reachable.
				void (async () => {
					const status = await eventPublisher.status();
					const declaration = status.state === 'enabled' ? await eventPublisher.declareEvents() : undefined;
					const line = flowEventsStatusLine(status, declaration);
					writeDaemonLog(logsDir, line.level, line.message);
				})();

				// Fire-and-forget: app-core being absent or slow (the SDK waits up to 3 s) must not delay or break the
				// daemon start. Whatever app-core answers lands in the daemon log, `flow logs` shows it.
				if (options.appCoreModules && options.appCoreModules.length > 0) {
					void registerAppCoreModules(options.appCoreModules, logsDir);
				}

				const wsPort = config.worker.wsPort ?? port + 1;
				// One set of masks for everything that writes execution data: the stores below, the
				// command handler and the ingress of worker messages.
				const daemonSecrets = new DaemonSecrets(
					new ExecutionMasks((executionId, error) => {
						// Neither the text nor a secret is in the message: only the execution and the cause.
						writeDaemonLog(
							logsDir,
							'error',
							`[warn] secret masking failed for execution ${executionId}, text replaced by a placeholder: ${getErrorMessage(error)}`
						);
					})
				);
				const executionStore = new ExecutionStore(
					executionsDir,
					config.logs.retainDays,
					daemonSecrets.masks,
					new FlowEventMapper(eventPublisher, err =>
						writeDaemonLog(logsDir, 'error', `Queue events: publishing failed: ${getErrorMessage(err)}`)
					)
				);
				const logWriter = new LogWriter(logsDir, config.logs.retainDays, daemonSecrets.masks);
				executionStore.pruneOldExecutions();
				// Nothing can be live yet: a record still queued/running belongs to a previous daemon.
				const interrupted = executionStore.reconcileInterruptedExecutions();
				writeDaemonLog(
					logsDir,
					'info',
					`Reconciled ${String(interrupted)} execution(s) interrupted by a previous daemon stop (marked failed; re-run with flow run)`
				);
				// Workspace pruning is per-project and so runs per request, not here:
				// this daemon is shared across projects and its launch directory says
				// nothing about whose workspaces should be pruned.
				const claudePath = resolveClaudePath();
				if (!claudePath) {
					writeDaemonLog(logsDir, 'error', 'claude binary not found on PATH - model steps may fail');
				}
				const wsServer = new WebSocketServer(
					wsPort,
					(ws, message) => {
						workerMessages.handleMessage(ws, message);
					},
					ws => {
						workerMessages.handleClose(ws);
					},
					{
						bindAddress: config.worker.bindAddress,
						tls: config.worker.tls,
					}
				);
				// Fire-and-forget: start() retries on EADDRINUSE (TIME_WAIT). Workers read port
				// lazily via getter -- they are only spawned after tryDispatch(), which happens
				// after handleRun(), which happens after this onStart returns. By then start()
				// has resolved.
				wsServer
					.start()
					.then(boundPort => {
						// Recorded so nothing has to read the port before it means anything: the
						// getter reports the *requested* port until the listener binds, and the
						// retry above means that request is often wrong.
						workerListenerPort = boundPort;
						// Published because the retry means the bound port is not always
						// `httpPort + 1`. A client that assumed the offset would dial whatever
						// else holds that port, so the real one is written down for them.
						publishWorkerPort(resolvedDaemonDir, boundPort);
						// Sources are contacted when a step needs capacity (D#66), not here.
						//
						// The startup contact used to be unconditional, which asked every source for a
						// worker even when the daemon had nothing to do -- and a daemon with nothing to
						// do stops in about a second, so the worker it just created was disconnected
						// 20ms after connecting. "Contact at startup only if there is work" is the
						// on-demand path with extra steps, so there is only the on-demand path.
						sourceContact.pruneDeadSources();
					})
					.catch((err: Error) => {
						process.stderr.write(`[daemon] WebSocket server failed to start: ${String(err)}\n`);
					});
				const workerRegistry = new WorkerRegistry();
				// Reads the bound port, not the requested one, for the same reason as above: a
				// forked worker handed a port the listener moved away from can never register.
				// It falls back to the getter only if a fork somehow precedes the bind, where
				// the old behaviour is still the best guess available.
				const forkSource = new ForkWorkerSource(port, () => workerListenerPort ?? wsServer.port, claudePath);
				const sourceRegistry = new WorkerSourceRegistry(resolvedDaemonDir);
				// Relays are tracked apart from workers because the two roles carry different
				// credentials and neither may stand in for the other (T-04, T-11).
				const relayRegistry = new RelayRegistry(sourceRegistry);
				// One issuer, shared: the credential a launched worker presents has to be the one
				// this daemon minted for it, and it is only ever valid here, once (T-09).
				const launchTokens = new LaunchTokenIssuer();
				const sourceContact = new DaemonSourceContact(logsDir, sourceRegistry, relayRegistry, launchTokens);
				const workerProvisioner = new WorkerProvisioner(
					config.queue.concurrency,
					workerRegistry,
					forkSource,
					new SharedTokenAuthenticator(resolvedDaemonDir, sourceRegistry, launchTokens),
					sourceRegistry,
					undefined,
					// To the log, not to stderr: this process is detached with stdio ignored, so a
					// refusal written there is lost -- and a refused worker is exactly what someone
					// debugging "why is nothing connected" needs to see.
					message => {
						writeDaemonLog(logsDir, 'error', message);
					}
				);
				const commandHandler = new CommandHandler(
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
					perFlowWorkspaceResolver,
					// D#66: asked again whenever demand appears, not only at startup.
					//
					// Skipped while the listener is still binding, rather than falling back to
					// the port the listener *asked* for: a source handed that number would
					// create a worker that dials nothing, or worse something else. The startup
					// contact fires the moment the bind completes, so nothing is lost.
					() => {
						if (workerListenerPort === undefined) {
							writeDaemonLog(
								logsDir,
								'info',
								'demand arrived before the worker listener was bound; sources will be contacted when it is'
							);
							return;
						}
						sourceContact.contactSources(workerListenerPort);
					},
					undefined,
					config.queue.stepSilenceLimitSeconds * 1000,
					daemonSecrets
				);
				runtime = {
					commandHandler,
					workerRegistry,
					relayRegistry,
					workerProvisioner,
					wsServer,
					executionStore,
					logWriter,
					daemonSecrets,
				};

				// Nothing else would notice a wedged worker: it keeps its socket open and answers
				// pings, so only the absence of output over time says anything. Swept rather than
				// timed per step, since one timer for the daemon is enough and a minute of lateness
				// on a 30-minute limit costs nothing.
				stalledSweep = setInterval(() => {
					commandHandler.failStalledSteps();
				}, STALLED_SWEEP_INTERVAL_MS);
				stalledSweep.unref();

				updateCheckTimer = startPeriodicUpdateCheck(resolvedDaemonDir);
			},
		},
	});

	return {
		get port(): number {
			return daemonHandle.port;
		},
		stop: async reason => {
			await daemonHandle.stop(reason);
			await shutdownFlush;
		},
	};
}

export class Daemon {
	static async start(
		config: FlowConfig = FlowConfigLoader.DEFAULT,
		daemonDir?: string,
		options?: StartDaemonOptions
	): Promise<DaemonHandle> {
		return startDaemon(config, daemonDir, options);
	}
}
