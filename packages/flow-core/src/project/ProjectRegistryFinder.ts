import { defaultRegistryDir, findProjectIncludingDeleted, isVirtual } from '@wadeck-app/project-sdk';

import { errorMessage } from '../errors.js';

/** What the project registry says about one exact project id. */
export type ProjectFinding =
	| { kind: 'live'; name: string; virtual: boolean }
	| { kind: 'removed'; name: string; virtual: boolean }
	| { kind: 'unknown' }
	| { kind: 'unavailable'; reason: string };

/** Answers for an exact project id, read from the registry on every call; must not throw. */
export type ProjectFinder = (projectId: string) => ProjectFinding;

/**
 * A finder over the registry in `registryDir`. Unlike the ProjectLookup of a listing it tells a removed (soft-deleted)
 * project from an id the registry never had, and flags a virtual project (no path: only shared configuration and data).
 * An unreadable registry yields `unavailable` with the directory and the cause.
 */
export function createRegistryProjectFinder(registryDir: string): ProjectFinder {
	return projectId => {
		try {
			const found = findProjectIncludingDeleted(registryDir, projectId);
			if (found === undefined) {
				return { kind: 'unknown' };
			}
			return {
				kind: found.deleted ? 'removed' : 'live',
				name: found.project.name,
				virtual: isVirtual(found.project),
			};
		} catch (error) {
			return {
				kind: 'unavailable',
				reason: `the project registry in "${registryDir}" cannot be read (${errorMessage(error)})`,
			};
		}
	};
}

/** {@link createRegistryProjectFinder} over the registry the project CLI uses for `env`. */
export function createRegistryProjectFinderFromEnv(env: NodeJS.ProcessEnv): ProjectFinder {
	return createRegistryProjectFinder(defaultRegistryDir(env));
}
