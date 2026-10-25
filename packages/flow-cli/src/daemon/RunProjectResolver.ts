import { defaultRegistryDir } from '@wadeck-app/project-sdk';
import * as path from 'node:path';

import { FLOW_PROJECT_ENV, ProjectScopeError, ProjectScopeResolver } from '../config/ProjectScopeResolver.js';
import type { ResolvedProject } from '../config/ProjectScopeResolver.js';
import type { ClientCommand, DaemonResponse } from '../ipc/Protocol.js';
import { ProjectResolutionRefusal } from './ProjectResolutionRefusal.js';

type RunCommand = Extract<ClientCommand, { type: 'run' }>;

/** The project a run belongs to, and where it runs. */
export interface RunProject {
	project: ResolvedProject;
	/** Folder of the project (its `.flow/` lives there). Always set: a project with no folder cannot run flows. */
	projectPath: string;
	/**
	 * Working directory of the run: the client's cwd when it lies inside the project, else the project folder (the user
	 * named the project from elsewhere with `--project`, and the run must not write its workspace into that other folder).
	 */
	runCwd: string;
}

export type RunProjectOutcome = ({ ok: true } & RunProject) | { ok: false; response: DaemonResponse };

function sameDirectory(a: string, b: string): boolean {
	const normalise = (value: string): string => path.resolve(value).replace(/[\\/]+$/, '');
	return process.platform === 'win32'
		? normalise(a).toLowerCase() === normalise(b).toLowerCase()
		: normalise(a) === normalise(b);
}

/**
 * Resolves the project of a `run` request, per request, from what the client sent (its cwd, `--project`, `FLOW_PROJECT`).
 * The daemon serves every project, so nothing about the project is taken from the daemon's own cwd or `FLOW_PROJECT`;
 * only the registry location comes from the daemon's environment, and a client that read another one is refused.
 * The registry is read on every call: a `project add` is seen by the next run.
 */
export class RunProjectResolver {
	constructor(
		private readonly resolver: ProjectScopeResolver = new ProjectScopeResolver(),
		private readonly daemonEnv: () => NodeJS.ProcessEnv = () => process.env
	) {}

	resolve(cmd: Pick<RunCommand, 'cwd' | 'projectRef' | 'envProject' | 'registryDir'>): RunProjectOutcome {
		const env: NodeJS.ProcessEnv = { ...this.daemonEnv() };
		delete env[FLOW_PROJECT_ENV];
		if (cmd.envProject !== undefined) {
			env[FLOW_PROJECT_ENV] = cmd.envProject;
		}
		const daemonRegistryDir = defaultRegistryDir(env);
		if (cmd.registryDir !== undefined && !sameDirectory(cmd.registryDir, daemonRegistryDir)) {
			return {
				ok: false,
				response: ProjectResolutionRefusal.registryMismatch(cmd.registryDir, daemonRegistryDir),
			};
		}
		try {
			const project = this.resolver.resolve({
				cwd: cmd.cwd,
				...(cmd.projectRef === undefined ? {} : { projectRef: cmd.projectRef }),
				env,
			});
			const projectPath = this.resolver.requirePath(project);
			return {
				ok: true,
				project,
				projectPath,
				runCwd: project.pathVia === 'main' ? projectPath : cmd.cwd,
			};
		} catch (err) {
			if (!(err instanceof ProjectScopeError)) {
				throw err;
			}
			return { ok: false, response: ProjectResolutionRefusal.toResponse(cmd.cwd, err) };
		}
	}
}
