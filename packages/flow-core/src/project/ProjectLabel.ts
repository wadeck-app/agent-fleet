import { defaultRegistryDir, findProjectIncludingDeleted } from '@wadeck-app/project-sdk';

import { errorMessage } from '../errors.js';

/** What the registry says about a project id recorded on an execution. */
export type ProjectLookupResult = { kind: 'known'; name: string } | { kind: 'removed' } | { kind: 'unavailable' };

/** Answers for a project id; must not throw (a lookup failure may never break a listing). */
export type ProjectLookup = (projectId: string) => ProjectLookupResult;

/**
 * The text that names the project of an execution: `name (id)` when the registry knows the id (live or soft-deleted),
 * `id (removed)` when it is gone, the bare id when the registry cannot be read or no lookup is given, and
 * `<projectRoot> (-)` for a record written before project ids existed. Undefined when the record has neither.
 */
export function projectLabelOf(
	record: { projectId?: string; projectRoot?: string },
	lookup?: ProjectLookup
): string | undefined {
	const { projectId, projectRoot } = record;
	if (projectId === undefined) {
		return projectRoot === undefined ? undefined : `${projectRoot} (-)`;
	}
	const found = lookup?.(projectId);
	switch (found?.kind) {
		case 'known':
			return `${found.name} (${projectId})`;
		case 'removed':
			return `${projectId} (removed)`;
		case 'unavailable':
		case undefined:
			return projectId;
		default: {
			const unreachable: never = found;
			throw new Error(`Unknown project lookup result: ${JSON.stringify(unreachable)}`);
		}
	}
}

/**
 * A lookup over the project registry in `registryDir`, read on every call (a project added since is seen at once).
 * An unreadable registry yields `unavailable` and is reported once, on stderr, with the directory and the cause.
 */
export function createRegistryProjectLookup(registryDir: string): ProjectLookup {
	let reported = false;
	return projectId => {
		try {
			const found = findProjectIncludingDeleted(registryDir, projectId.trim().toLowerCase());
			return found === undefined ? { kind: 'removed' } : { kind: 'known', name: found.project.name };
		} catch (error) {
			if (!reported) {
				reported = true;
				const reason = errorMessage(error);
				process.stderr.write(
					`[flow] project names are not shown: the project registry in "${registryDir}" cannot be read (${reason}). Check it with: project list\n`
				);
			}
			return { kind: 'unavailable' };
		}
	};
}

/** {@link createRegistryProjectLookup} over the registry the project CLI uses for `env` (`$XDG_CONFIG_HOME/project`, else `~/.config/project`). */
export function createRegistryProjectLookupFromEnv(env: NodeJS.ProcessEnv): ProjectLookup {
	return createRegistryProjectLookup(defaultRegistryDir(env));
}
