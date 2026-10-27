import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { FlowCoreError } from '../errors.js';

/** File of the worker source registry, inside the flow config directory. */
export const WORKER_SOURCE_REGISTRY_FILE = 'worker-sources.json';

/**
 * The provider name `built-in:relay` used to carry, before the concept was renamed.
 *
 * No alias is accepted for it: the old name never had a counterpart process to talk to, so
 * nothing could have worked under it, and silently rewriting it would hide a config the user
 * still believes in.
 */
export const RETIRED_RELAY_PROVIDER = 'built-in:host';
export const RELAY_PROVIDER = 'built-in:relay';

/** A declared source of workers. Persisted; never proof that a worker exists. */
export interface WorkerSourceEntry {
	sourceId: string;
	/** The S1 implementation that obtains workers for this source. */
	provider: string;
	/** Options handed to that implementation. */
	options?: Record<string, unknown>;
	/** Labels every worker from this source inherits (D#30). */
	labels: string[];
	/** Upper bound on workers this source may supply, so one cannot absorb every step (D#64). */
	maxWorkers: number;
	/** sha256 of the token a *worker* from this source presents. Never the secret (T-09). */
	tokenHash: string;
	/**
	 * sha256 of the token the *source itself* presents when it registers (T-04, T-11).
	 *
	 * Deliberately a second secret rather than a reuse of `tokenHash`. A fake worker absorbs
	 * one step; a fake source manufactures capacity wholesale across every project, so a
	 * stolen worker credential must not be promotable into that role.
	 *
	 * Optional only because an entry written before the split has none. Absent means "cannot
	 * register as a source" -- never "any token matches".
	 */
	sourceTokenHash?: string;
	createdAt: string;
	/**
	 * Process of a worker that declared *itself* -- D#5's first kind of entry, "a worker already
	 * alive and waiting to be contacted".
	 *
	 * Present only for such an entry, and it is what makes one safely prunable: a worker killed
	 * without a chance to clean up would otherwise leave declared capacity behind forever. Absent
	 * means the entry describes a machine or a command, where no local pid could speak for it.
	 */
	pid?: number;
	/**
	 * HTTP endpoint the daemon POSTs to when its WebSocket listener is ready.
	 *
	 * Format: `http://<host>:<port>/nudge`. The daemon sends `{ wsUrl }` so the worker
	 * can connect immediately instead of waiting for its backoff timer. Optional: workers
	 * that do not expose one still reconnect via backoff.
	 */
	nudgeUrl?: string;
	/**
	 * Worker-type plugin implementing this source, as `<pluginId>.<implName>`.
	 *
	 * Present only for a plugin source; then `pluginsDir` is required and `provider` is a free label
	 * (never a `built-in:` provider). Absent in every entry written before worker-type plugins existed.
	 */
	plugin?: string;
	/**
	 * Absolute directory holding `plugin-<pluginId>/` (self-contained plain JS), set together with `plugin`.
	 */
	pluginsDir?: string;
}

/**
 * What a reader may show of a declared source: never the credential hashes, and neither `options` nor `pluginsDir`
 * (options are configuration for the daemon's implementation, and a directory is not for display).
 */
export type DeclaredWorkerSource = Pick<WorkerSourceEntry, 'sourceId' | 'provider' | 'labels' | 'maxWorkers'>;

export interface WorkerSourceRegistryFile {
	sources: WorkerSourceEntry[];
}

/** The registry file cannot be read, or holds a source that can no longer work. */
export class WorkerSourceRegistryError extends FlowCoreError {
	constructor(message: string) {
		super(message, 'worker-source-registry');
	}
}

/**
 * Reads the registry file, treating a damaged file as an error.
 *
 * A corrupt file is never read as "nothing declared": that would silently discard
 * every source the user set up and look like a configuration that never existed.
 * A missing file is a registry with no source.
 */
export function parseWorkerSourceFile(filePath: string): WorkerSourceEntry[] {
	if (!existsSync(filePath)) {
		return [];
	}

	let parsed: unknown;
	try {
		parsed = JSON.parse(readFileSync(filePath, 'utf8'));
	} catch (err) {
		throw new WorkerSourceRegistryError(
			`Failed to parse worker source registry at "${filePath}": ${String(err)}. ` +
				'Run "flow worker source repair" to back up the broken file and reset the registry to empty.'
		);
	}

	const sources = (parsed as Partial<WorkerSourceRegistryFile> | null)?.sources;
	if (!Array.isArray(sources)) {
		throw new WorkerSourceRegistryError(
			`Worker source registry at "${filePath}" is malformed: expected a "sources" list, got ${typeof sources}. ` +
				'Run "flow worker source repair" to back up the broken file and reset the registry to empty.'
		);
	}
	return sources;
}

/**
 * Refuses the pre-rename provider name, here rather than at each call site.
 *
 * Deliberately not aliased to the new name: an alias would make a source the user must
 * re-declare look like one that already works.
 */
export function assertProviderNotRetired(sourceId: string, provider: string, filePath: string): void {
	if (provider !== RETIRED_RELAY_PROVIDER) {
		return;
	}

	throw new WorkerSourceRegistryError(
		`Worker source "${sourceId}" uses provider "${RETIRED_RELAY_PROVIDER}", which no longer exists: the concept is now called a relay. ` +
			`Re-declare the source: "flow worker source remove ${sourceId}" then ` +
			`"flow worker source add ${sourceId} --provider ${RELAY_PROVIDER}". ` +
			`Its entry is in "${filePath}". ` +
			'This is not a silent upgrade because a new source token is issued, and the old name never had a relay to talk to.'
	);
}

/**
 * Declared sources of the registry in `daemonDir`, without their credential hashes.
 * Throws {@link WorkerSourceRegistryError} when the registry is damaged or holds a retired provider.
 */
export function readDeclaredWorkerSources(daemonDir: string): DeclaredWorkerSource[] {
	const filePath = join(daemonDir, WORKER_SOURCE_REGISTRY_FILE);
	return parseWorkerSourceFile(filePath).map(source => {
		assertProviderNotRetired(source.sourceId, source.provider, filePath);
		return {
			sourceId: source.sourceId,
			provider: source.provider,
			labels: source.labels,
			maxWorkers: source.maxWorkers,
		};
	});
}
