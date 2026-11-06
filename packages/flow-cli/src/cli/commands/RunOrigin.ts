import {
	ProjectError,
	buildOrigin,
	defaultRegistryDir,
	findProjectForPath,
	loadRegistry,
	resolveScope,
} from '@wadeck-app/project-sdk';
import type { Origin } from '@wadeck-app/project-sdk';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { FLOW_PROJECT_ENV } from '../../config/ProjectScopeResolver';

export interface RunOriginInput {
	cwd: string;
	/** `-p/--project` as typed. */
	projectRef: string | undefined;
	env: NodeJS.ProcessEnv;
	/** Time of the run request (tests pin it). */
	now?: Date;
}

/**
 * Where a `flow run` comes from, when that is worth recording: the project was chosen explicitly (`-p` or FLOW_PROJECT)
 * AND the cwd is not that project's own folder (another project's, or outside every project). A run started inside its
 * project has no origin to report, and neither has one with no explicit project.
 *
 * A project that does not resolve yields no origin: the daemon resolves the same reference on the same registry and
 * refuses the run with the full actionable message, so nothing is hidden by answering undefined here.
 */
export function resolveRunOrigin(input: RunOriginInput): Origin | undefined {
	const fromEnv = input.env[FLOW_PROJECT_ENV];
	try {
		const registry = loadRegistry(defaultRegistryDir(input.env));
		const scope = resolveScope(registry, {
			cwd: input.cwd,
			envName: FLOW_PROJECT_ENV,
			...(input.projectRef === undefined ? {} : { flag: input.projectRef }),
			...(fromEnv === undefined || fromEnv.trim() === '' ? {} : { env: fromEnv }),
		});
		if (scope.source === 'cwd') {
			return undefined;
		}
		const cwdProject = findProjectForPath(registry, input.cwd)?.project;
		if (scope.pathVia === 'cwd' && cwdProject?.id === scope.project.id) {
			return undefined;
		}
		return buildOrigin('flow', scope, input.now);
	} catch (err) {
		if (!(err instanceof ProjectError)) {
			throw err;
		}
		return undefined;
	}
}
