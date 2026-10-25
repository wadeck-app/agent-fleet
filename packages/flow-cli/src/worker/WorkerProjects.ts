import { ProjectScopeError, ProjectScopeResolver } from '../config/ProjectScopeResolver.js';
import type { ResolvedProject } from '../config/ProjectScopeResolver.js';

/** A `--project` value (or `FLOW_WORKER_PROJECTS` entry) a worker cannot use. `message` is final and actionable. */
export class WorkerProjectError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'WorkerProjectError';
	}
}

/** A folder path rather than a project reference: separators, a drive letter, or a relative marker. */
function looksLikePath(ref: string): boolean {
	return /[\\/]/.test(ref) || /^[A-Za-z]:/.test(ref) || ref === '.' || ref === '..';
}

export interface ResolveWorkerProjectsInput {
	/** `--project` values (or `FLOW_WORKER_PROJECTS`): names, aliases or ids of registered projects. */
	refs: string[];
	cwd: string;
	env: NodeJS.ProcessEnv;
}

/**
 * The projects a worker serves, by registry identity. Its own project comes first (`FLOW_PROJECT`, else the registered
 * project containing the cwd), then the ones named; duplicates are dropped.
 *
 * Naming projects is enough on its own: a worker started from a folder in no project simply serves the named ones. With
 * nothing named, the own project is required and its absence is the usual "register this folder" error.
 *
 * @throws WorkerProjectError for a folder path (workers attach by project id, a path has no identity)
 * @throws ProjectScopeError for a reference or folder the registry does not resolve
 */
export function resolveWorkerProjects(input: ResolveWorkerProjectsInput): ResolvedProject[] {
	const resolver = new ProjectScopeResolver();
	for (const ref of input.refs) {
		if (looksLikePath(ref)) {
			throw new WorkerProjectError(
				`--project "${ref}" is a folder path. A worker is attached to a registered project, by name, alias or id (project list shows them).\n` +
					`Register the folder once with: project add "${ref}", then pass its name.`
			);
		}
	}

	const projects: ResolvedProject[] = [];
	const add = (project: ResolvedProject): void => {
		if (!projects.some(known => known.id === project.id)) {
			projects.push(project);
		}
	};

	try {
		add(resolver.resolve({ cwd: input.cwd, env: input.env }));
	} catch (err) {
		// Only "this folder is in no project" may be skipped, and only when projects were named explicitly.
		const skippable =
			err instanceof ProjectScopeError && err.code === 'NO_PROJECT_IN_SCOPE' && input.refs.length > 0;
		if (!skippable) {
			throw err;
		}
	}
	for (const ref of input.refs) {
		add(resolver.resolve({ cwd: input.cwd, projectRef: ref, env: input.env }));
	}
	return projects;
}
