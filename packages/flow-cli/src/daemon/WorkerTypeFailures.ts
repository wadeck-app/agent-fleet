import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

/** The extension point a worker-type plugin implements. */
export const WORKER_TYPE_POINT = 'worker-type';

/** A state the daemon's own code should have made impossible: not the user's to fix. */
export function wiringMistake(sourceId: string, what: string): Error {
	return new Error(
		`worker source "${sourceId}" ${what}. This is a wiring mistake in the daemon, not a configuration error -- please report it.`
	);
}

/** An entry of the registry file that `flow worker source add` would have refused: the user fixes it by declaring it again. */
export function noDirectory(sourceId: string, plugin: string): Error {
	return new Error(
		`worker source "${sourceId}": plugin "${plugin}" is not a built-in worker type of flow and has no pluginsDir, so the daemon would not know where to load it from. ` +
			`"flow worker source add" would have refused this entry. Fix: flow worker source remove ${sourceId}, then declare it again with --plugins-dir <absolute directory that contains plugin-<pluginId>/>.`
	);
}

/** The load error matching what answered: a built-in is flow's own code, so the on-disk advice would send the user to fix nothing. */
export function failureOf(
	entry: WorkerSourceEntry,
	plugin: string,
	pluginsDir: string | undefined,
	isBuiltin: boolean,
	cause: string,
	original?: unknown
): Error {
	if (!isBuiltin && pluginsDir !== undefined) {
		return loadFailure(entry, plugin, pluginsDir, cause, original);
	}
	return new Error(
		`Cannot load worker source "${entry.sourceId}": "${plugin}" is a built-in worker type of flow and failed: ${cause}. ` +
			'This is a bug in flow, not in your configuration: please report this error.',
		original === undefined ? undefined : { cause: original }
	);
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
