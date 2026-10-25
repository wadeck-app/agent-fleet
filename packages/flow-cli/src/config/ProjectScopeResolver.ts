import {
	AmbiguousReferenceError,
	NoProjectInScopeError,
	ProjectNotFoundError,
	RegistryCorruptError,
	RegistryInvalidError,
	UnsupportedSchemaVersionError,
	defaultRegistryDir,
	describeResolution,
	loadRegistry,
	mainPath,
	resolveScope,
} from '@wadeck-app/project-sdk';
import type { Scope, ScopeSource } from '@wadeck-app/project-sdk';
import * as path from 'node:path';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

/** Name of the environment variable that selects the project of a flow command. */
export const FLOW_PROJECT_ENV = 'FLOW_PROJECT';

export type ProjectScopeErrorCode =
	'NO_PROJECT_IN_SCOPE' | 'PROJECT_NOT_FOUND' | 'AMBIGUOUS_PROJECT' | 'VIRTUAL_PROJECT' | 'REGISTRY_ERROR';

/** A project could not be determined. `message` is final and actionable: it can be printed as it is. */
export class ProjectScopeError extends Error {
	constructor(
		readonly code: ProjectScopeErrorCode,
		message: string,
		options?: { cause?: unknown }
	) {
		super(message, options);
		this.name = 'ProjectScopeError';
	}
}

export interface ResolveProjectInput {
	cwd: string;
	/** `-p` / `--project`: name, alias or id of a registered project (never a path). */
	projectRef?: string;
	/** Default `process.env`. Read: FLOW_PROJECT, and XDG_CONFIG_HOME for the registry location. */
	env?: NodeJS.ProcessEnv;
}

export interface ResolvedProject {
	/** Registry id (8 hex). */
	id: string;
	/** Registry name. */
	name: string;
	/**
	 * Working folder of the project: the registered path containing the cwd, else its main path. Absent for a virtual
	 * project (no folder): see {@link ProjectScopeResolver.requirePath}.
	 */
	path?: string;
	/** Whether the cwd lies inside `path` (`cwd`) or `path` is the project's main path because it does not (`main`). */
	pathVia?: 'cwd' | 'main';
	source: ScopeSource;
	/** What supplied the selection: `--project`, `FLOW_PROJECT` or `cwd`. */
	via: string;
	registryDir: string;
	/** One line stating how the project was found, for logs. */
	description: string;
}

function nonBlank(value: string | undefined): string | undefined {
	return value !== undefined && value.trim() !== '' ? value : undefined;
}

/** Writes the SDK message with the folder as the user typed it (native separators) instead of the registry's normalised form. */
function nativeText(text: string, normalised: string, typed: string): string {
	return text.split(normalised).join(typed);
}

function registered(scope: Scope, registryDir: string): ResolvedProject {
	const main = mainPath(scope.project);
	const folder = scope.path ?? main;
	return {
		id: scope.project.id,
		name: scope.project.name,
		...(folder === undefined ? {} : { path: path.resolve(folder) }),
		...(scope.pathVia === undefined ? {} : { pathVia: scope.pathVia }),
		source: scope.source,
		via: scope.via,
		registryDir,
		description: describeResolution(scope, { registryDir }),
	};
}

/**
 * Which registered project a flow command works on: `-p/--project` > `FLOW_PROJECT` > the registered folder that contains the
 * cwd (deepest wins), all three through the shared project registry. The registry is the only definition of a project: no
 * `.git`, `.flow/config.yml` or `.flows` walk, and a reference or folder the registry does not know is an error, never a
 * fallback. The registry is read on every call (never cached), so `project add` is seen by the next request.
 */
export class ProjectScopeResolver {
	/** @throws ProjectScopeError with a final, actionable message. Unexpected failures are not translated. */
	resolve(input: ResolveProjectInput): ResolvedProject {
		const env = input.env ?? process.env;
		const registryDir = defaultRegistryDir(env);
		const cwd = path.resolve(input.cwd);
		const fromEnv = nonBlank(env[FLOW_PROJECT_ENV]);
		try {
			const registry = loadRegistry(registryDir);
			const scope = resolveScope(registry, {
				cwd,
				envName: FLOW_PROJECT_ENV,
				...(input.projectRef === undefined ? {} : { flag: input.projectRef }),
				...(fromEnv === undefined ? {} : { env: fromEnv }),
			});
			return registered(scope, registryDir);
		} catch (error) {
			throw this.translate(error, { cwd, projectRef: input.projectRef, fromEnv });
		}
	}

	/** The working folder of the project, or a ProjectScopeError saying how to give a virtual project one. */
	requirePath(project: ResolvedProject): string {
		if (project.path === undefined) {
			throw new ProjectScopeError(
				'VIRTUAL_PROJECT',
				`project ${project.name} has no folder, and this command needs a working directory.
` + `Add one with: project paths add ${project.name} <folder>`
			);
		}
		return project.path;
	}

	private translate(
		error: unknown,
		context: { cwd: string; projectRef: string | undefined; fromEnv: string | undefined }
	): unknown {
		if (error instanceof NoProjectInScopeError) {
			const message = nativeText(getErrorMessage(error), error.cwd, context.cwd);
			const hint = nativeText(error.hint, error.cwd, context.cwd);
			return new ProjectScopeError(
				'NO_PROJECT_IN_SCOPE',
				`${message}\n${hint}\n` +
					`flow no longer detects a project from .git, .flow/config.yml or .flows: register the folder once with: project add "${context.cwd}"`,
				{ cause: error }
			);
		}
		const origin =
			context.projectRef !== undefined
				? `--project "${context.projectRef}": `
				: context.fromEnv !== undefined
					? `${FLOW_PROJECT_ENV}="${context.fromEnv}": `
					: '';
		if (error instanceof ProjectNotFoundError) {
			return new ProjectScopeError('PROJECT_NOT_FOUND', `${origin}${getErrorMessage(error)}`, { cause: error });
		}
		if (error instanceof AmbiguousReferenceError) {
			return new ProjectScopeError('AMBIGUOUS_PROJECT', `${origin}${getErrorMessage(error)}`, { cause: error });
		}
		if (
			error instanceof RegistryCorruptError ||
			error instanceof RegistryInvalidError ||
			error instanceof UnsupportedSchemaVersionError
		) {
			return new ProjectScopeError('REGISTRY_ERROR', getErrorMessage(error), { cause: error });
		}
		return error;
	}
}
