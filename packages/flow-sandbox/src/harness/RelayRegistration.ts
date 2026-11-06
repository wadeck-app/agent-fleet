import { SandboxError } from '../SandboxError';
import { type JsonObject, WORKER_FEATURES } from './HarnessMessages';

export interface RelayRegistrationOptions {
	/** Registry ids of the projects the harness serves; the daemon routes steps by them. */
	attachedProjectIds: readonly string[];
	/** Folders of those projects, for `flow worker list` only. */
	attachedProjects?: readonly string[];
	/** Always includes `sandbox`; the flow's `labels: [sandbox]` routes steps here. */
	labels: readonly string[];
	/** The one-shot credential the source minted for this launch (`FLOW_WORKER_TOKEN`). */
	authToken: string;
	sourceId: string;
	/** Process id of the wrapper (the daemon only displays it). */
	pid: number;
	version: string;
}

/**
 * The `ready` the daemon sees. It is built ENTIRELY by the wrapper: nothing the inner worker said about itself
 * (pid, labels, projects, shells, credential) is used, because the daemon routes by these fields and a sandbox
 * must not choose them. The VM is Linux with bash, so `bash` is the only shell declared.
 */
export class RelayRegistration {
	constructor(private readonly options: RelayRegistrationOptions) {
		if (!options.labels.includes('sandbox')) {
			throw new SandboxError('invalid-options', 'The harness labels must include "sandbox".');
		}
		if (options.attachedProjectIds.length === 0) {
			throw new SandboxError(
				'invalid-options',
				'The harness needs at least one project id (--project-id <id>, see `project list`): the daemon only routes a step to a worker attached to its project, and without the "project-id" data it refuses the worker.'
			);
		}
		if (options.authToken === '' || options.sourceId === '') {
			throw new SandboxError(
				'invalid-options',
				'The harness needs FLOW_WORKER_SOURCE_ID and FLOW_WORKER_TOKEN: it must be started by a built-in:command source (flow worker source add ... --provider built-in:command).'
			);
		}
	}

	ready(): JsonObject {
		const { options } = this;
		return {
			type: 'ready',
			pid: options.pid,
			version: options.version,
			authToken: options.authToken,
			sourceId: options.sourceId,
			labels: [...options.labels],
			shellCapabilities: ['bash'],
			features: [...WORKER_FEATURES],
			attachedProjectIds: [...options.attachedProjectIds],
			attachedProjects: [...(options.attachedProjects ?? [])],
			hasUserInterface: false,
		};
	}
}
