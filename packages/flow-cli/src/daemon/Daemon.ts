import { type DaemonHandle, createDaemon } from '@wadeck-app/singleton-daemon-kit';
import { executionsDirOf, logsDirOf } from 'flow-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import { VERSION } from '../cli/version.js';
import { type FlowConfig, FlowConfigLoader } from '../config/FlowConfig';
import { flowConfigDir } from '../config/FlowConfigDir.js';
import { PluginLoader } from '../config/PluginLoader.js';
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
import { DaemonIdleShutdown, IDLE_WATCHDOG_INTERVAL_MS } from './DaemonIdleShutdown.js';
import { writeDaemonLog } from './DaemonLog.js';
import type { DaemonRuntime } from './DaemonRuntime.js';
import { DaemonSecrets } from './DaemonSecrets.js';
import { DaemonSourceContact } from './DaemonSourceContact.js';
import { DaemonWorkerMessageHandler } from './DaemonWorkerMessageHandler.js';
import { awaitShutdownWork, shutDownWorkers } from './DaemonWorkerShutdown.js';
import { ExclusiveFileLock } from './ExclusiveFileLock.js';
import { ForkWorkerSource } from './ForkWorkerSource.js';
import { LaunchTokenIssuer } from './LaunchTokenIssuer.js';
import { findLiveDaemon } from './LiveDaemonProbe.js';
import { RelayRegistry } from './RelayRegistry.js';
import { runEndSettingsOf } from './RunEndCoordinator.js';
import { SharedTokenAuthenticator } from './SharedTokenAuthenticator.js';
import { removeStaleDaemonFiles } from './StaleDaemonFiles.js';
import { guardRunAgainstStop } from './StoppingDaemonRunGuard.js';
import { WebSocketServer, WebSocketServerClosedError } from './WebSocketServer';
import { WorkerProvisioner } from './WorkerProvisioner.js';
import { WorkerRegistry } from './WorkerRegistry.js';
import { WorkerSourceRegistry } from './WorkerSourceRegistry.js';
import { WorkerTypeCatalog } from './WorkerTypeCatalog.js';
import { DEFAULT_DISPOSE_TIMEOUT_MS, WorkerTypeInstances } from './WorkerTypeInstances.js';
import { createDaemonCommands } from './createDaemonCommands.js';
import { publishWorkerPort, removeWorkerPort } from './publishWorkerPort.js';
import { registerAppCoreModules } from './registerAppCoreModules.js';
import { resolveClaudePath } from './resolveClaudePath.js';
import { startPeriodicUpdateCheck } from './startPeriodicUpdateCheck.js';
import { tryResolvePlugins } from './tryResolvePlugins.js';

/**
 * How long forked workers get to exit after the daemon told them to (and closed their sockets) before being killed.
 * Longer than the grace WebSocketServer gives its peers, so a worker that merely closes slowly is not killed.
 */
const FORKED_WORKER_EXIT_GRACE_MS = 5_000;

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
	 * How often an idle-stopping daemon checks, on its own, whether it has nothing left to do (milliseconds). Omitted
	 * means {@link IDLE_WATCHDOG_INTERVAL_MS}. Ignored when `stopWhenIdle` is false. Tests lower it.
	 */
	idleCheckIntervalMs?: number;
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
	/**
	 * What to do when another daemon already owns the config dir. Omitted means `takeover`: the kit evicts it and this
	 * one replaces it, which is what a deliberate restart wants.
	 *
	 * `yield` is for daemons nobody asked to replace anything (every `flow run` auto-starts one, so concurrent runs
	 * start several): the late one logs a single line and leaves, WITHOUT touching state. A takeover there evicted
	 * the live daemon and its start-up reconciliation then marked the executions that daemon had just accepted as
	 * interrupted.
	 */
	existingDaemon?: 'takeover' | 'yield';
}

/** How long a starting daemon waits for another one that is mid-start before giving up. */
const START_LOCK_TIMEOUT_MS = 60_000;

/**
 * Decides, before any side effect (plugins, reconciliation, listeners, log line, registration), whether this
 * process may become the daemon. The check and the start run under one lock, so two starting daemons cannot both
 * see "nobody is up".
 */
async function startDaemon(
	config: FlowConfig = FlowConfigLoader.DEFAULT,
	daemonDir?: string,
	options: StartDaemonOptions = {}
): Promise<DaemonHandle> {
	const resolvedDaemonDir = daemonDir ?? flowConfigDir();
	// Before the lock and any side effect: a zero or NaN interval would silently mean "never check".
	if (
		options.idleCheckIntervalMs !== undefined &&
		!(Number.isFinite(options.idleCheckIntervalMs) && options.idleCheckIntervalMs > 0)
	) {
		throw new Error(
			`idleCheckIntervalMs must be a positive number of milliseconds, got ${String(options.idleCheckIntervalMs)}.`
		);
	}
	fs.mkdirSync(resolvedDaemonDir, { recursive: true, mode: 0o700 });
	const release = await ExclusiveFileLock.acquire(path.join(resolvedDaemonDir, 'daemon-start.lock'), {
		timeoutMs: START_LOCK_TIMEOUT_MS,
		purpose: 'start the flow daemon (another daemon is starting)',
	});
	try {
		if ((options.existingDaemon ?? 'takeover') === 'yield') {
			const incumbent = await findLiveDaemon(resolvedDaemonDir);
			if (incumbent !== null) {
				writeDaemonLog(
					logsDirOf(resolvedDaemonDir),
					'info',
					`Daemon (pid ${String(process.pid)}) not started: another daemon (pid ${String(incumbent.pid)}, port ${String(incumbent.port)}) already owns ${resolvedDaemonDir}; exiting without touching its state`
				);
				return { port: incumbent.port, stop: () => Promise.resolve() };
			}
		}
		// Under the same lock as the decision to start: what a dead daemon left must not be mistaken for ours.
		const stale = await removeStaleDaemonFiles(resolvedDaemonDir);
		if (stale.length > 0) {
			writeDaemonLog(
				logsDirOf(resolvedDaemonDir),
				'info',
				`Removed ${stale.join(', ')} left in ${resolvedDaemonDir} by a previous daemon that did not clean up`
			);
		}
		return await startOwningDaemon(config, resolvedDaemonDir, options);
	} finally {
		release();
	}
}

async function startOwningDaemon(
	config: FlowConfig,
	resolvedDaemonDir: string,
	options: StartDaemonOptions
): Promise<DaemonHandle> {
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

	/** One worker-type instance per plugin source for the life of this daemon; disposed at stop (shutDownWorkers). */
	const workerTypes = new WorkerTypeInstances(new PluginLoader(), (level, message) => {
		writeDaemonLog(logsDir, level, message);
	});

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
	/** Ends forked workers that ignored the request to exit; set once the fork source exists. */
	let terminateForkedWorkers: ((graceMs: number) => void) | undefined;
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
		commands: guardRunAgainstStop(createDaemonCommands(config, getRuntime), idleShutdown),
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
			onShutdown: reason => {
				// Idle stops log their own line (with a snapshot); the others used to leave no trace of who stopped what.
				if (reason !== 'idle') {
					writeDaemonLog(logsDir, 'info', `Daemon stopped (${reason}) (pid ${String(process.pid)})`);
				}
				if (updateCheckTimer !== undefined) {
					clearInterval(updateCheckTimer);
				}
				// Every stop path, not only the idle one: a pending debounced stop, the watchdog and the background
				// work must not outlive the decision to stop (they would run against a torn-down daemon).
				idleShutdown.dispose();
				if (stalledSweep !== undefined) {
					clearInterval(stalledSweep);
				}
				runtime?.commandHandler.stopBackgroundWork();
				// Every stop path releases the worker listener, not only the idle one. An open listener and
				// connected workers keep the process alive after its command server is gone: an orphan holding a
				// worker port that the next daemon then has to scan past, until none is left.
				// The runs in progress are told first (run_end), then the workers are closed; see shutDownWorkers.
				// Capped in total: two ack timeouts (the acks, then the plugins' run hooks) plus the plugin dispose bound.
				const stopCapMs = 2 * config.worker.ackTimeoutSeconds * 1000 + DEFAULT_DISPOSE_TIMEOUT_MS;
				const workersAnswered =
					runtime === undefined
						? Promise.resolve()
						: shutDownWorkers(runtime, stopCapMs, maxWaitMs => {
								writeDaemonLog(
									logsDir,
									'error',
									`Stopping: the workers and worker types did not finish within ${String(Math.round(maxWaitMs / 1000))}s; the daemon stops anyway. ` +
										'Whatever a plugin still holds (for example sandboxes) may be left behind: remove it by hand.'
								);
							});
				// After the polite request above (done + closed sockets): one that still runs after the grace is wedged.
				terminateForkedWorkers?.(FORKED_WORKER_EXIT_GRACE_MS);
				// The file tells workers where to dial; left behind it names a port nobody serves (or, later,
				// something unrelated). Only removed if it still names OURS: a daemon that replaced this one may
				// already have published its own.
				if (workerListenerPort !== undefined) {
					removeWorkerPort(resolvedDaemonDir, workerListenerPort);
				}
				// The hook is synchronous: the flush runs on, and stop() below waits for it. Pushes in flight
				// also keep the process alive until they settle.
				const eventsFlushed = eventPublisher.flush().catch((err: unknown) => {
					writeDaemonLog(logsDir, 'error', `Queue events: flush at shutdown failed: ${getErrorMessage(err)}`);
				});
				// The hook can run twice (idle path, then stop()); the run_end wait is the same one both times.
				shutdownFlush = awaitShutdownWork(eventsFlushed, workersAnswered);
			},
			onStart: (port: number) => {
				fs.mkdirSync(executionsDir, { recursive: true, mode: 0o700 });
				fs.mkdirSync(logsDir, { recursive: true, mode: 0o700 });
				writeDaemonLog(logsDir, 'info', `Daemon started (pid ${String(process.pid)})`);
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
				// Off the critical path: retention pruning opens every record, which delayed the first answer by seconds.
				// It yields the event loop between chunks and only deletes expired records, so it can run alongside work.
				void executionStore.pruneOldExecutionsInBackground().catch((err: unknown) => {
					writeDaemonLog(logsDir, 'error', `[warn] execution pruning failed: ${getErrorMessage(err)}`);
				});
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
					(ws, code, reason) => {
						workerMessages.handleClose(ws, code, reason);
					},
					{
						// Closes and errors of worker connections: stderr is ignored for a detached daemon.
						log: (level, message) => {
							writeDaemonLog(logsDir, level, message);
						},
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
						if (boundPort !== wsPort) {
							writeDaemonLog(
								logsDir,
								'info',
								`Worker listener bound on port ${String(boundPort)} instead of ${String(wsPort)}: the requested port and the ones above it were in use (orphaned flow daemons keep theirs; look for stray node processes running flow.cjs). Workers read the real port from worker.port.`
							);
						}
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
						if (err instanceof WebSocketServerClosedError) {
							// Stopped while still scanning for a port: nothing was bound, nothing to publish.
							writeDaemonLog(logsDir, 'info', 'Worker listener not bound: the daemon stopped first');
							return;
						}
						process.stderr.write(`[daemon] WebSocket server failed to start: ${String(err)}\n`);
					});
				const workerRegistry = new WorkerRegistry();
				// Reads the bound port, not the requested one, for the same reason as above: a
				// forked worker handed a port the listener moved away from can never register.
				// It falls back to the getter only if a fork somehow precedes the bind, where
				// the old behaviour is still the best guess available.
				const forkSource = new ForkWorkerSource(port, () => workerListenerPort ?? wsServer.port, claudePath, {
					// A forked worker's exit and last stderr lines: the only trace of why it died.
					log: (level, message) => {
						writeDaemonLog(logsDir, level, message);
					},
					maskText: text => daemonSecrets.masks.maskAll(text),
				});
				terminateForkedWorkers = graceMs => forkSource.terminateRemaining(graceMs);
				// A source dropped by this process (pruneDead) lets go of its plugin instance at once; one removed by
				// `flow worker source remove` (another process) is noticed at the next contact.
				const sourceRegistry = new WorkerSourceRegistry(resolvedDaemonDir, sourceId => {
					void workerTypes.dispose(sourceId);
				});
				// Relays are tracked apart from workers because the two roles carry different
				// credentials and neither may stand in for the other (T-04, T-11).
				const relayRegistry = new RelayRegistry(sourceRegistry);
				// One issuer, shared: the credential a launched worker presents has to be the one
				// this daemon minted for it, and it is only ever valid here, once (T-09).
				const launchTokens = new LaunchTokenIssuer();
				const sourceContact = new DaemonSourceContact(
					logsDir,
					sourceRegistry,
					relayRegistry,
					launchTokens,
					workerTypes
				);
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
					requestedTypes => {
						if (workerListenerPort === undefined) {
							writeDaemonLog(
								logsDir,
								'info',
								'demand arrived before the worker listener was bound; sources will be contacted when it is'
							);
							return;
						}
						sourceContact.contactSources(workerListenerPort, requestedTypes);
					},
					undefined,
					config.queue.stepSilenceLimitSeconds * 1000,
					daemonSecrets,
					undefined,
					runEndSettingsOf(config.worker),
					workerTypes,
					{
						workerTypes: new WorkerTypeCatalog(sourceRegistry),
						boundStepWaitMs: config.worker.boundStepWaitSeconds * 1000,
					}
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
					workerTypes,
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

				// Worker messages are not the only moment a daemon can become idle (see IDLE_WATCHDOG_INTERVAL_MS).
				if (stopWhenIdle) {
					idleShutdown.startWatchdog(options.idleCheckIntervalMs ?? IDLE_WATCHDOG_INTERVAL_MS);
				}
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
