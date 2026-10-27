import type { RunEndEvent, WorkerTypeInstance } from 'extension-points';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { PluginLoader } from '../config/PluginLoader.js';
import { raceWithTimeout } from './BoundedWait.js';
import { PLUGIN_REF, type WorkerSourceEntry } from './WorkerSourceRegistry.js';

/** The extension point a worker-type plugin implements. */
const WORKER_TYPE_POINT = 'worker-type';

const DEFAULT_BUILD_TIMEOUT_MS = 30_000;
export const DEFAULT_DISPOSE_TIMEOUT_MS = 30_000;

/** How long the daemon waits on a plugin. Both are bounds: a plugin is third-party code and may hang. */
export interface WorkerTypeTimeouts {
	/** Loading the plugin and running its factory. */
	buildTimeoutMs?: number;
	/** Disposing one instance, including waiting for its build if that is still running. */
	disposeTimeoutMs?: number;
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
		timeouts: WorkerTypeTimeouts = {}
	) {
		this.buildTimeoutMs = timeouts.buildTimeoutMs ?? DEFAULT_BUILD_TIMEOUT_MS;
		this.disposeTimeoutMs = timeouts.disposeTimeoutMs ?? DEFAULT_DISPOSE_TIMEOUT_MS;
	}

	/**
	 * The instance of a plugin source, built if it is the first request.
	 *
	 * @throws an error naming the source, the plugin, the cause and the fix when the plugin cannot be loaded
	 */
	async get(entry: WorkerSourceEntry): Promise<WorkerTypeInstance> {
		const { plugin, pluginsDir, sourceId } = entry;
		if (plugin === undefined || pluginsDir === undefined) {
			throw new Error(
				`worker source "${sourceId}" has no plugin or no pluginsDir, so there is no worker-type instance to build. This is a wiring mistake in the daemon, not a configuration error -- please report it.`
			);
		}
		if (!PLUGIN_REF.test(plugin)) {
			// A hand-edited registry file: the ref is a file name below pluginsDir, so it must not be able to leave it.
			throw new Error(
				`worker source "${sourceId}": plugin must be "<pluginId>.<implName>" (letters, digits, "_" and "-"), got ${JSON.stringify(plugin)}. ` +
					`Fix: flow worker source remove ${sourceId}, then declare it again.`
			);
		}

		const fingerprint = JSON.stringify([plugin, pluginsDir, entry.options ?? null]);
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

		const created: CachedInstance = { fingerprint, instance: this.build(entry, plugin, pluginsDir) };
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

	private async build(entry: WorkerSourceEntry, plugin: string, pluginsDir: string): Promise<WorkerTypeInstance> {
		// Outside the load error below: an unset variable is the user's to fix, and says which one.
		const options = resolveEnvVars(entry.sourceId, entry.options);
		const loading = this.load(entry, plugin, pluginsDir, options);
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
			throw loadFailure(
				entry,
				plugin,
				pluginsDir,
				`did not finish loading within ${describeDuration(this.buildTimeoutMs)}`
			);
		}
		return built;
	}

	private async load(
		entry: WorkerSourceEntry,
		plugin: string,
		pluginsDir: string,
		options: unknown
	): Promise<WorkerTypeInstance> {
		try {
			const built = await this.loader.loadProvider(
				`plugins.${plugin}`,
				WORKER_TYPE_POINT,
				{ sourceId: entry.sourceId, options },
				pluginsDir
			);
			assertWorkerTypeInstance(built);
			return built;
		} catch (err) {
			throw loadFailure(entry, plugin, pluginsDir, getErrorMessage(err), err);
		}
	}
}

/** The error for a plugin that could not be loaded: source, plugin, cause, and the fix that really works. */
function loadFailure(
	entry: WorkerSourceEntry,
	plugin: string,
	pluginsDir: string,
	cause: string,
	original?: unknown
): Error {
	const [pluginId = plugin] = plugin.split('.');
	return new Error(
		`Cannot load worker source "${entry.sourceId}": worker-type plugin "${plugin}" from "${pluginsDir}" failed: ${cause}. ` +
			`Fix: make sure "${pluginsDir}" holds plugin-${pluginId}/plugin.config.js (plain self-contained JS, no node_modules beside it) ` +
			`that declares implementation "${plugin.slice(pluginId.length + 1)}" for "${WORKER_TYPE_POINT}" and whose factory resolves, ` +
			'then restart the daemon: Node keeps a module that failed to import (or was edited) as it first loaded it. ' +
			`To drop the source: flow worker source remove ${entry.sourceId}.`,
		original === undefined ? undefined : { cause: original }
	);
}

/** Replaces `${NAME}` in every string of the options with the daemon's environment; an unset NAME is an error. */
function resolveEnvVars(sourceId: string, value: unknown, keyPath = ''): unknown {
	if (typeof value === 'string') {
		return value.replace(/\$\{([^}]+)\}/g, (_reference, name: string) => {
			const resolved = process.env[name];
			if (resolved === undefined) {
				throw new Error(
					`worker source "${sourceId}": option "${keyPath}" references environment variable "${name}", which is not set in the daemon's environment. ` +
						'Set it where the daemon is started and restart the daemon, or declare the source again without it.'
				);
			}
			return resolved;
		});
	}
	if (Array.isArray(value)) {
		return value.map((item: unknown, index) => resolveEnvVars(sourceId, item, `${keyPath}[${String(index)}]`));
	}
	if (typeof value === 'object' && value !== null) {
		return Object.fromEntries(
			Object.entries(value).map(([key, item]) => [
				key,
				resolveEnvVars(sourceId, item, keyPath === '' ? key : `${keyPath}.${key}`),
			])
		);
	}
	return value;
}

function describeDuration(ms: number): string {
	return ms < 1000 ? `${String(ms)}ms` : `${String(Math.round(ms / 1000))}s`;
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
