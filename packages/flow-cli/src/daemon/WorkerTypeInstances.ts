import type { RunEndEvent, WorkerTypeInstance } from 'extension-points';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { PluginLoader } from '../config/PluginLoader.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

/** The extension point a worker-type plugin implements. */
const WORKER_TYPE_POINT = 'worker-type';

const DEFAULT_DISPOSE_TIMEOUT_MS = 30_000;

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
 * Built lazily by {@link get}, from the plugins directory the source entry names. A build that fails is not cached, so
 * the next contact tries again once the user fixed the plugin.
 */
export class WorkerTypeInstances {
	private readonly cache = new Map<string, CachedInstance>();
	/** Set by {@link disposeAll}: a daemon that is stopping must not start building instances nobody will dispose. */
	private closed = false;

	constructor(
		private readonly loader: Pick<PluginLoader, 'loadProvider'>,
		private readonly log: (level: 'info' | 'error', message: string) => void,
		/** How long a dispose may take before the daemon moves on (a stop must not hang on a plugin). */
		private readonly disposeTimeoutMs: number = DEFAULT_DISPOSE_TIMEOUT_MS
	) {}

	/**
	 * The instance of a plugin source, built if it is the first request.
	 *
	 * @throws an error naming the source, the plugin, the cause and the fix when the plugin cannot be loaded
	 */
	async get(entry: WorkerSourceEntry): Promise<WorkerTypeInstance> {
		const { plugin, pluginsDir } = entry;
		if (plugin === undefined || pluginsDir === undefined) {
			throw new Error(
				`worker source "${entry.sourceId}" has no plugin or no pluginsDir, so there is no worker-type instance to build. This is a wiring mistake in the daemon, not a configuration error -- please report it.`
			);
		}
		if (this.closed) {
			throw new Error(
				`worker source "${entry.sourceId}": the daemon is stopping, no worker-type instance is built any more.`
			);
		}

		const fingerprint = JSON.stringify([plugin, pluginsDir, entry.options ?? null]);
		const cached = this.cache.get(entry.sourceId);
		if (cached?.fingerprint === fingerprint) {
			return cached.instance;
		}
		if (cached !== undefined) {
			// Declared again with other settings (the file was edited): the old instance is not the one asked for.
			await this.dispose(entry.sourceId);
		}

		const created: CachedInstance = {
			fingerprint,
			instance: this.build(entry, plugin, pluginsDir),
		};
		this.cache.set(entry.sourceId, created);
		created.instance.catch(() => {
			// Not remembered, so a fixed plugin is picked up by the next contact. The caller sees the error.
			if (this.cache.get(entry.sourceId) === created) {
				this.cache.delete(entry.sourceId);
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
		const instance = await this.settled(this.cache.get(sourceId));
		await instance?.run?.onRunEnded(event);
	}

	/** Disposes the instance of one source and forgets it. Idempotent; a failing dispose is logged, never thrown. */
	async dispose(sourceId: string): Promise<void> {
		const cached = this.cache.get(sourceId);
		if (cached === undefined) {
			return;
		}
		this.cache.delete(sourceId);
		const instance = await this.settled(cached);
		if (instance === undefined) {
			return;
		}
		let timer: ReturnType<typeof setTimeout> | undefined;
		try {
			const outcome = await Promise.race([
				instance.dispose().then(() => 'done' as const),
				new Promise<'timeout'>(resolve => {
					timer = setTimeout(() => resolve('timeout'), this.disposeTimeoutMs);
				}),
			]);
			if (outcome === 'timeout') {
				this.log(
					'error',
					`worker source "${sourceId}": its worker-type instance did not finish disposing within ${String(Math.round(this.disposeTimeoutMs / 1000))}s; moving on. ` +
						'Whatever the plugin still holds for this source (for example sandboxes) may be left behind: remove it by hand.'
				);
			}
		} catch (err) {
			this.log(
				'error',
				`worker source "${sourceId}": disposing its worker-type instance failed: ${getErrorMessage(err)}. ` +
					'Whatever the plugin still holds for this source (for example sandboxes) may be left behind: remove it by hand.'
			);
		} finally {
			clearTimeout(timer);
		}
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

	/** The instance behind a cache entry, or undefined when its build failed (already reported to whoever asked). */
	private async settled(cached: CachedInstance | undefined): Promise<WorkerTypeInstance | undefined> {
		if (cached === undefined) {
			return undefined;
		}
		try {
			return await cached.instance;
		} catch {
			return undefined;
		}
	}

	private async build(entry: WorkerSourceEntry, plugin: string, pluginsDir: string): Promise<WorkerTypeInstance> {
		try {
			const built = await this.loader.loadProvider(
				`plugins.${plugin}`,
				WORKER_TYPE_POINT,
				{ sourceId: entry.sourceId, options: entry.options },
				pluginsDir
			);
			assertWorkerTypeInstance(built);
			return built;
		} catch (err) {
			const [pluginId = plugin] = plugin.split('.');
			throw new Error(
				`Cannot load worker source "${entry.sourceId}": worker-type plugin "${plugin}" from "${pluginsDir}" failed: ${getErrorMessage(err)}. ` +
					`Fix: make sure "${pluginsDir}" holds plugin-${pluginId}/plugin.config.js (plain self-contained JS, no node_modules beside it) ` +
					`that declares implementation "${plugin.slice(pluginId.length + 1)}" for "${WORKER_TYPE_POINT}" and whose factory resolves; ` +
					`the next worker request tries again. To drop the source: flow worker source remove ${entry.sourceId}.`,
				{ cause: err }
			);
		}
	}
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
