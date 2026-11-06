import type { RunEndEvent, WorkerTypeInstance } from 'extension-points';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { FlowPlugin } from '../config/FlowPlugin.js';
import type { PluginLoader } from '../config/PluginLoader.js';
import { raceWithTimeout } from './BoundedWait.js';
import { findBuiltinWorkerType } from './BuiltinWorkerTypes.js';
import type { ForkWorkerInputs } from './ForkWorkerTypePlugin.js';
import { INBOUND_PLUGIN_REF, entryNudgeUrlToCopy } from './InboundNudgeOption.js';
import { LaunchCredentialSource } from './LaunchCredentialSource.js';
import type { RegisteredRelay } from './RelayRegistry.js';
import { PLUGIN_REF } from './WorkerSourcePluginReference.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';
import { WORKER_TYPE_POINT, failureOf, noDirectory, wiringMistake } from './WorkerTypeFailures.js';
import { describeDuration, resolveEnvVars } from './WorkerTypeOptions.js';

const DEFAULT_BUILD_TIMEOUT_MS = 30_000;
export const DEFAULT_DISPOSE_TIMEOUT_MS = 30_000;

/** How long the daemon waits on a plugin. Both are bounds: a plugin is third-party code and may hang. */
export interface WorkerTypeTimeouts {
	/** Loading the plugin and running its factory. */
	buildTimeoutMs?: number;
	/** Disposing one instance, including waiting for its build if that is still running. */
	disposeTimeoutMs?: number;
}

/**
 * What the daemon lends to a BUILT-IN worker type, and only to that: a plugin loaded from a plugins directory is
 * third-party code and never receives these services (a relay handle is a live socket, and the token service mints
 * credentials). What a disk plugin does get is one launch credential per ask, in request.authToken, minted by the daemon
 * around its source (LaunchCredentialSource).
 */
export interface WorkerTypeHost {
	/** The live connection of a relay source; only the relay worker type uses it. */
	findRelay?: (sourceId: string) => RegisteredRelay | undefined;
	/** Mints the one-shot credential a launched worker registers with; only the command worker type uses it. */
	issueLaunchToken?: (sourceId: string) => string;
	/** Gives a credential back when the launch it was minted for failed. */
	revokeLaunchToken?: (sourceId: string, token: string) => void;
	/**
	 * What the fork worker type is built from. CURRENTLY UNUSED IN PRODUCTION: the daemon builds its fork fallback with
	 * buildForkWorkerType directly (DaemonForkWorkers), so nothing sets this; the registered plugin only refuses a declared
	 * source, because a declared entry never carries it.
	 */
	fork?: ForkWorkerInputs;
}

interface CachedInstance {
	/** What the instance was built from: a source declared differently gets a new one. */
	fingerprint: string;
	instance: Promise<WorkerTypeInstance>;
}

/**
 * One {@link WorkerTypeInstance} per plugin source, built on first use and kept until the source is removed or the
 * daemon stops.
 *
 * The instance is cached because it owns resources (the point's `dispose` exists for them) and has to see the end of
 * every run its workers served; rebuilding it at each contact would leak the previous one and lose that state.
 *
 * Every wait on plugin code is bounded (build, dispose): a hung plugin costs one logged error, never the daemon. A
 * build that fails or times out is not cached, but Node keeps a module that failed to import as it was, so a load
 * error is only fixed by restarting the daemon.
 */
export class WorkerTypeInstances {
	private readonly cache = new Map<string, CachedInstance>();
	/** Sources whose instance was disposed, so a run that ends later can be told why nobody answers. */
	private readonly disposed = new Set<string>();
	/** Instances already handed to dispose(), so the two ways one can be reached (cache, late build) dispose it once. */
	private readonly disposedInstances = new WeakSet<WorkerTypeInstance>();
	/** Set by {@link disposeAll}: a daemon that is stopping must not start building instances nobody will dispose. */
	private closed = false;
	private readonly buildTimeoutMs: number;
	private readonly disposeTimeoutMs: number;

	constructor(
		private readonly loader: Pick<PluginLoader, 'loadProvider'>,
		private readonly log: (level: 'info' | 'error', message: string) => void,
		timeouts: WorkerTypeTimeouts = {},
		/**
		 * Looks up a built-in by type reference ("plugins.<id>.<impl>"). Asked BEFORE the plugins directory: a built-in
		 * carries the daemon's host services and is the code shipped with this daemon, so a same-named copy left in a
		 * plugins directory (stale, or planted) must not replace it. Which of the two answered is logged on every build.
		 */
		private readonly lookupBuiltin: (typeRef: string) => FlowPlugin | undefined = findBuiltinWorkerType
	) {
		this.buildTimeoutMs = timeouts.buildTimeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS;
		this.disposeTimeoutMs = timeouts.disposeTimeoutMs ?? DEFAULT_DISPOSE_TIMEOUT_MS;
	}

	/**
	 * The instance of a plugin source, built if it is the first request.
	 *
	 * @throws an error naming the source, the plugin, the cause and the fix when the plugin cannot be loaded
	 */
	async get(entry: WorkerSourceEntry, host: WorkerTypeHost = {}): Promise<WorkerTypeInstance> {
		const { plugin, pluginsDir, sourceId } = entry;
		if (plugin === undefined) {
			throw wiringMistake(sourceId, 'has no plugin, so there is no worker-type instance to build');
		}
		if (!PLUGIN_REF.test(plugin)) {
			// A hand-edited registry file: the ref is a file name below pluginsDir, so it must not be able to leave it.
			throw new Error(
				`worker source "${sourceId}": plugin must be "<pluginId>.<implName>" (letters, digits, "_" and "-"), got ${JSON.stringify(plugin)}. ` +
					`Fix: flow worker source remove ${sourceId}, then declare it again.`
			);
		}
		// A built-in needs no directory; anything else is loaded from one, so one without it cannot be built.
		const registered = this.lookupBuiltin(`plugins.${plugin}`);
		if (registered === undefined && pluginsDir === undefined) {
			throw noDirectory(sourceId, plugin);
		}

		// The inbound worker type reads its URL from the options; the entry's own nudgeUrl is copied in first, so the
		// fingerprint and the plugin both see it. Built-in path only: a plugin from disk never sees more than before.
		const entryNudgeUrl =
			registered !== undefined && plugin === INBOUND_PLUGIN_REF ? entryNudgeUrlToCopy(entry) : undefined;

		// `host` is deliberately not part of the fingerprint: the first caller's findRelay is kept; harmless while there is one relay lookup per daemon.
		const fingerprint = JSON.stringify([plugin, pluginsDir, entry.options ?? null, entryNudgeUrl ?? null]);
		// Re-read after every wait: another contact may have replaced the entry while this one was disposing it, and
		// overwriting theirs would leave their instance alive and unreferenced.
		for (;;) {
			if (this.closed) {
				throw new Error(
					`worker source "${sourceId}": the daemon is stopping, no worker-type instance is built any more.`
				);
			}
			const cached = this.cache.get(sourceId);
			if (cached?.fingerprint === fingerprint) {
				return cached.instance;
			}
			if (cached === undefined) {
				break;
			}
			// Declared again with other settings (the file was edited): the old instance is not the one asked for.
			await this.dispose(sourceId);
		}

		const created: CachedInstance = {
			fingerprint,
			instance: this.build(entry, plugin, pluginsDir, host, registered, entryNudgeUrl),
		};
		this.cache.set(sourceId, created);
		this.disposed.delete(sourceId);
		created.instance.catch(() => {
			// Not remembered, so the next contact builds again. The caller sees the error.
			if (this.cache.get(sourceId) === created) {
				this.cache.delete(sourceId);
			}
		});
		return created.instance;
	}

	/**
	 * Tells the instance that owns `sourceId` a run its workers served has ended. Nothing happens for a source that
	 * has no instance (every built-in one) or whose instance has no per-run hook.
	 *
	 * @throws what the plugin's hook threw: the caller knows the execution and logs it.
	 */
	async notifyRunEnded(sourceId: string, event: RunEndEvent): Promise<void> {
		const cached = this.cache.get(sourceId);
		if (cached === undefined) {
			if (this.disposed.has(sourceId)) {
				this.log(
					'error',
					`warning: worker source "${sourceId}" was removed (or the daemon is stopping) while execution ${event.executionId} was running: ` +
						'its worker type was disposed before the run ended, so it could not clean up after it. ' +
						'Check for leftovers of that execution (for example sandboxes) and remove them by hand.'
				);
			}
			return;
		}
		const instance = await this.settled(cached);
		await instance?.run?.onRunEnded(event);
	}

	/** Disposes the instance of one source and forgets it. Idempotent; a failing or hanging dispose is logged, never thrown. */
	async dispose(sourceId: string): Promise<void> {
		const cached = this.cache.get(sourceId);
		if (cached === undefined) {
			return;
		}
		this.cache.delete(sourceId);
		this.disposed.add(sourceId);
		await this.disposeBounded(sourceId, this.settled(cached));
	}

	/** Disposes the instances of the sources not in `declared` (removed from another process since). */
	async retainOnly(declared: Iterable<string>): Promise<void> {
		const keep = new Set(declared);
		await Promise.all([...this.cache.keys()].filter(sourceId => !keep.has(sourceId)).map(id => this.dispose(id)));
	}

	/** Disposes every instance, once; builds none afterwards. For the daemon stop. */
	async disposeAll(): Promise<void> {
		this.closed = true;
		await Promise.all([...this.cache.keys()].map(sourceId => this.dispose(sourceId)));
	}

	/**
	 * Waits for the instance (a build still running included) and disposes it, all within the dispose bound. The work
	 * goes on after the bound, so an instance that appears late is still disposed; its late failure is logged too.
	 */
	private async disposeBounded(sourceId: string, instance: Promise<WorkerTypeInstance | undefined>): Promise<void> {
		const disposing = (async () => {
			try {
				const target = await instance;
				if (target === undefined || this.disposedInstances.has(target)) {
					return;
				}
				this.disposedInstances.add(target);
				await target.dispose();
			} catch (err) {
				this.log(
					'error',
					`worker source "${sourceId}": disposing its worker-type instance failed: ${getErrorMessage(err)}. ` +
						'Whatever the plugin still holds for this source (for example sandboxes) may be left behind: remove it by hand.'
				);
			}
		})();
		if ((await raceWithTimeout(disposing, this.disposeTimeoutMs)) === 'timeout') {
			this.log(
				'error',
				`worker source "${sourceId}": its worker-type instance did not finish disposing within ${describeDuration(this.disposeTimeoutMs)}; moving on. ` +
					'Whatever the plugin still holds for this source (for example sandboxes) may be left behind: remove it by hand.'
			);
		}
	}

	/** The instance behind a cache entry, or undefined when its build failed (already reported to whoever asked). */
	private async settled(cached: CachedInstance): Promise<WorkerTypeInstance | undefined> {
		try {
			return await cached.instance;
		} catch {
			return undefined;
		}
	}

	private async build(
		entry: WorkerSourceEntry,
		plugin: string,
		pluginsDir: string | undefined,
		host: WorkerTypeHost,
		registered: FlowPlugin | undefined,
		entryNudgeUrl: string | undefined
	): Promise<WorkerTypeInstance> {
		// Outside the load error below: an unset variable is the user's to fix, and says which one.
		const expanded = resolveEnvVars(entry.sourceId, entry.options);
		// Copied after the expansion on purpose: entry data is never expanded (see entryNudgeUrlToCopy).
		const options =
			entryNudgeUrl === undefined
				? expanded
				: { ...(expanded as Record<string, unknown> | undefined), nudgeUrl: entryNudgeUrl };
		const loading = this.load(entry, plugin, pluginsDir, options, host, registered);
		let built: WorkerTypeInstance | undefined;
		const outcome = await raceWithTimeout(
			loading.then(instance => {
				built = instance;
			}),
			this.buildTimeoutMs
		);
		if (outcome === 'timeout' || built === undefined) {
			// The build goes on in the background: whatever it yields must not be left running with nobody to dispose it.
			void this.disposeBounded(
				entry.sourceId,
				loading.then(
					instance => instance,
					() => undefined
				)
			);
			throw failureOf(
				entry,
				plugin,
				pluginsDir,
				registered !== undefined,
				`did not finish loading within ${describeDuration(this.buildTimeoutMs)}`
			);
		}
		return built;
	}

	private async createBuiltin(
		registered: FlowPlugin,
		typeRef: string,
		sourceId: string,
		options: unknown,
		host: WorkerTypeHost
	): Promise<unknown> {
		if (registered.extensionPoint !== WORKER_TYPE_POINT) {
			throw new Error(
				`built-in "${typeRef}" serves the extension point "${registered.extensionPoint}", not "${WORKER_TYPE_POINT}", so source "${sourceId}" cannot use it`
			);
		}
		return registered.create({ sourceId, options, host });
	}

	private async load(
		entry: WorkerSourceEntry,
		plugin: string,
		pluginsDir: string | undefined,
		options: unknown,
		host: WorkerTypeHost,
		registered: FlowPlugin | undefined
	): Promise<WorkerTypeInstance> {
		try {
			const typeRef = `plugins.${plugin}`;
			if (registered !== undefined) {
				this.log(
					'info',
					`worker source "${entry.sourceId}": plugin "${plugin}" answered by the built-in registry` +
						(pluginsDir === undefined
							? '.'
							: `; the plugins directory "${pluginsDir}" is ignored for it. To use a copy from that directory, give it another plugin id.`)
				);
				const built = await this.createBuiltin(registered, typeRef, entry.sourceId, options, host);
				assertWorkerTypeInstance(built);
				return built;
			}
			if (pluginsDir === undefined) {
				// Unreachable through get(), which refuses it; kept so a future caller fails here, loudly.
				throw wiringMistake(entry.sourceId, 'reached the plugins directory load without a pluginsDir');
			}
			this.log(
				'info',
				`worker source "${entry.sourceId}": plugin "${plugin}" answered by the plugins directory "${pluginsDir}" (not a built-in).`
			);
			const built = await this.loader.loadProvider(
				typeRef,
				WORKER_TYPE_POINT,
				{ sourceId: entry.sourceId, options },
				pluginsDir
			);
			assertWorkerTypeInstance(built);
			// A plugin from a directory is given a launch credential per ask by the daemon, never the minting service.
			return withLaunchCredential(built, host);
		} catch (err) {
			throw failureOf(entry, plugin, pluginsDir, registered !== undefined, getErrorMessage(err), err);
		}
	}
}

function withLaunchCredential(instance: WorkerTypeInstance, host: WorkerTypeHost): WorkerTypeInstance {
	return {
		source: new LaunchCredentialSource(instance.source, host.issueLaunchToken, host.revokeLaunchToken),
		...(instance.run === undefined ? {} : { run: instance.run }),
		dispose: () => instance.dispose(),
	};
}

function assertWorkerTypeInstance(candidate: unknown): asserts candidate is WorkerTypeInstance {
	const instance = candidate as Partial<WorkerTypeInstance> | null | undefined;
	if (typeof instance?.source?.obtainWorker !== 'function' || typeof instance.dispose !== 'function') {
		throw new Error(
			'its factory must resolve to { source: { obtainWorker() }, dispose() } (and optionally run: { onRunEnded() })'
		);
	}
	if (instance.run !== undefined && typeof instance.run.onRunEnded !== 'function') {
		throw new Error('its instance has a "run" without an onRunEnded() function');
	}
}
