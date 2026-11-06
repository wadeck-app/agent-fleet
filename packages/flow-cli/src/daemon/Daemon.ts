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
import { DaemonShutdownSequence } from './DaemonShutdownSequence.js';
import { DaemonSourceContact } from './DaemonSourceContact.js';
import { DaemonStartupTasks } from './DaemonStartupTasks.js';
import { DaemonWorkerListener } from './DaemonWorkerListener.js';
import { DaemonWorkerMessageHandler } from './DaemonWorkerMessageHandler.js';
import { ExclusiveFileLock } from './ExclusiveFileLock.js';
import { ForkWorkerSource } from './ForkWorkerSource.js';
import { LaunchTokenIssuer } from './LaunchTokenIssuer.js';
import { findLiveDaemon } from './LiveDaemonProbe.js';
import { RelayRegistry } from './RelayRegistry.js';
import { runEndSettingsOf } from './RunEndCoordinator.js';
import { SharedTokenAuthenticator } from './SharedTokenAuthenticator.js';
import { removeStaleDaemonFiles } from './StaleDaemonFiles.js';
import { type StartDaemonOptions, assertValidStartDaemonOptions } from './StartDaemonOptions.js';
import { guardRunAgainstStop } from './StoppingDaemonRunGuard.js';
import { WorkerProvisioner } from './WorkerProvisioner.js';
import { WorkerRegistry } from './WorkerRegistry.js';
import { WorkerSourceRegistry } from './WorkerSourceRegistry.js';
import { WorkerTypeCatalog } from './WorkerTypeCatalog.js';
import { WorkerTypeInstances } from './WorkerTypeInstances.js';
import { createDaemonCommands } from './createDaemonCommands.js';
import { resolveClaudePath } from './resolveClaudePath.js';
import { startPeriodicUpdateCheck } from './startPeriodicUpdateCheck.js';
import { tryResolvePlugins } from './tryResolvePlugins.js';

/** How often the daemon looks for a step whose worker went quiet. */
const STALLED_SWEEP_INTERVAL_MS = 60_000;

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
	// Before the lock and any side effect.
	assertValidStartDaemonOptions(options);
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
	/** Its bound port is what workers must dial, known only once the listener has bound. */
	let workerListener: DaemonWorkerListener | undefined;
	/** Ends forked workers that ignored the request to exit; set once the fork source exists. */
	let terminateForkedWorkers: ((graceMs: number) => void) | undefined;
	/** Held so shutdown can stop it: an unref'd timer still fires while the daemon tears down. */
	let stalledSweep: ReturnType<typeof setInterval> | undefined;
	/**
	 * Held so shutdown can stop it. Keeps this daemon's own updater cache fresh, see
	 * `startPeriodicUpdateCheck`.
	 */
	let updateCheckTimer: ReturnType<typeof setInterval> | undefined;

	const startupTasks = new DaemonStartupTasks(logsDir, eventPublisher);
	const shutdown = new DaemonShutdownSequence({
		logsDir,
		daemonDir: resolvedDaemonDir,
		workerAckTimeoutSeconds: config.worker.ackTimeoutSeconds,
		eventPublisher,
		getRuntimeIfStarted: () => runtime,
		stopUpdateCheck: () => {
			if (updateCheckTimer !== undefined) {
				clearInterval(updateCheckTimer);
			}
		},
		disposeIdleShutdown: () => {
			idleShutdown.dispose();
		},
		stopStalledSweep: () => {
			if (stalledSweep !== undefined) {
				clearInterval(stalledSweep);
			}
		},
		terminateForkedWorkers: graceMs => terminateForkedWorkers?.(graceMs),
		getWorkerListenerPort: () => workerListener?.boundPort,
	});
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
				shutdown.run(reason);
			},
			onStart: (port: number) => {
				fs.mkdirSync(executionsDir, { recursive: true, mode: 0o700 });
				fs.mkdirSync(logsDir, { recursive: true, mode: 0o700 });
				writeDaemonLog(logsDir, 'info', `Daemon started (pid ${String(process.pid)})`);
				startupTasks.logEventsStatus();
				startupTasks.registerWithAppCore(options.appCoreModules);

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
				startupTasks.pruneAndReconcile(executionStore);
				// Workspace pruning is per-project and so runs per request, not here:
				// this daemon is shared across projects and its launch directory says
				// nothing about whose workspaces should be pruned.
				const claudePath = resolveClaudePath();
				if (!claudePath) {
					writeDaemonLog(logsDir, 'error', 'claude binary not found on PATH - model steps may fail');
				}
				const listener = new DaemonWorkerListener(wsPort, logsDir, resolvedDaemonDir, config.worker, {
					onMessage: (ws, message) => {
						workerMessages.handleMessage(ws, message);
					},
					onClose: (ws, code, reason) => {
						workerMessages.handleClose(ws, code, reason);
					},
					// Sources are contacted when a step needs capacity (D#66), not here.
					//
					// The startup contact used to be unconditional, which asked every source for a
					// worker even when the daemon had nothing to do -- and a daemon with nothing to
					// do stops in about a second, so the worker it just created was disconnected
					// 20ms after connecting. "Contact at startup only if there is work" is the
					// on-demand path with extra steps, so there is only the on-demand path.
					onBound: () => {
						sourceContact.pruneDeadSources();
					},
				});
				workerListener = listener;
				const wsServer = listener.server;
				listener.start();
				const workerRegistry = new WorkerRegistry();
				// Reads the bound port, not the requested one, for the same reason as above: a
				// forked worker handed a port the listener moved away from can never register.
				// It falls back to the getter only if a fork somehow precedes the bind, where
				// the old behaviour is still the best guess available.
				const forkSource = new ForkWorkerSource(port, () => listener.boundPort ?? wsServer.port, claudePath, {
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
						const boundWorkerPort = listener.boundPort;
						if (boundWorkerPort === undefined) {
							writeDaemonLog(
								logsDir,
								'info',
								'demand arrived before the worker listener was bound; sources will be contacted when it is'
							);
							return;
						}
						sourceContact.contactSources(boundWorkerPort, requestedTypes);
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
			await shutdown.whenSettled();
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
