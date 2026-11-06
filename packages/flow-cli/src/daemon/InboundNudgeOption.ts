import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

/** The plain plugin ref of the built-in inbound worker type. */
export const INBOUND_PLUGIN_REF = 'inbound.default';

/** The one message for two different `nudgeUrl` values, at declaration and when the instance is built. */
export function nudgeUrlConflict(sourceId: string, entryUrl: string, optionsUrl: string): Error {
	return new Error(
		`Worker source "${sourceId}": nudgeUrl is set twice with different values (entry "${entryUrl}", options "${optionsUrl}"). ` +
			`Keep one: flow worker source remove ${sourceId}, then declare it again.`
	);
}

/**
 * The entry's own top-level `nudgeUrl` (workers write it about themselves), when it must be copied into
 * `options.nudgeUrl`: the options have none. Only that field is copied; the plugin never receives the rest of the entry.
 *
 * It is copied AFTER the daemon expanded the options, never before: entry data is not the user's declaration of
 * `${NAME}`, and expanding it would let whoever wrote the entry read the daemon's environment.
 *
 * @throws when both are set to different values
 */
export function entryNudgeUrlToCopy(entry: WorkerSourceEntry): string | undefined {
	const entryUrl = entry.nudgeUrl;
	if (entryUrl === undefined) {
		return undefined;
	}
	const optionsUrl: unknown = entry.options?.['nudgeUrl'];
	if (optionsUrl === undefined) {
		return entryUrl;
	}
	if (optionsUrl !== entryUrl) {
		throw nudgeUrlConflict(entry.sourceId, entryUrl, String(optionsUrl));
	}
	return undefined;
}
