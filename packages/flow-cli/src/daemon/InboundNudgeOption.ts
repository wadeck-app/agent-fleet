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
 * The entry as the inbound worker type must see it: the entry's top-level `nudgeUrl` (workers write it about
 * themselves, so it stays where it is) copied into `options.nudgeUrl` when the options have none. Only that field is
 * copied; the plugin never receives the rest of the entry.
 *
 * @throws when both are set to different values
 */
export function withEntryNudgeUrl(entry: WorkerSourceEntry): WorkerSourceEntry {
	const entryUrl = entry.nudgeUrl;
	if (entryUrl === undefined) {
		return entry;
	}
	const options = entry.options ?? {};
	const optionsUrl: unknown = options['nudgeUrl'];
	if (optionsUrl === undefined) {
		return { ...entry, options: { ...options, nudgeUrl: entryUrl } };
	}
	if (optionsUrl !== entryUrl) {
		throw nudgeUrlConflict(entry.sourceId, entryUrl, String(optionsUrl));
	}
	return entry;
}
