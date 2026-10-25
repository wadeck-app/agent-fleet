import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import { ProjectScopeError } from '../config/ProjectScopeResolver.js';
import type { DaemonResponse } from '../ipc/Protocol.js';

/** Error code of a run refused because its project could not be resolved. */
export const PROJECT_RESOLUTION_FAILED = 'PROJECT_RESOLUTION_FAILED';

/** Error code of a run refused because the client and the daemon read different project registries. */
export const PROJECT_REGISTRY_MISMATCH = 'PROJECT_REGISTRY_MISMATCH';

/**
 * Builds the responses for a run refused because its project could not be determined.
 *
 * The run is refused before any workspace, record or step exists. The message is the resolver's own,
 * which already says what to do (register the folder, fix the reference, ...).
 */
export class ProjectResolutionRefusal {
	/** `detail` carries the resolver's code (NO_PROJECT_IN_SCOPE, PROJECT_NOT_FOUND, ...) when the failure is a typed one. */
	static toResponse(cwd: string, err: unknown): DaemonResponse {
		return {
			type: 'error',
			code: PROJECT_RESOLUTION_FAILED,
			...(err instanceof ProjectScopeError ? { detail: err.code } : {}),
			message:
				`The run was refused: the project of "${cwd}" could not be resolved, so no step was queued.\n` +
				getErrorMessage(err),
		};
	}

	static registryMismatch(clientRegistryDir: string, daemonRegistryDir: string): DaemonResponse {
		return {
			type: 'error',
			code: PROJECT_REGISTRY_MISMATCH,
			message:
				`The run was refused: this command read the project registry in "${clientRegistryDir}", ` +
				`but the running flow daemon reads "${daemonRegistryDir}", so they could disagree about the project.\n` +
				'The daemon takes XDG_CONFIG_HOME from the shell that started it. Run the command from a shell with the same ' +
				'XDG_CONFIG_HOME, or restart the daemon from this one (flow stop, then run again).',
		};
	}
}
