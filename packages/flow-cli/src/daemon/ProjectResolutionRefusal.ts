import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

import type { DaemonResponse } from '../ipc/Protocol.js';

/** Error code of a run refused because its project could not be resolved. */
export const PROJECT_RESOLUTION_FAILED = 'PROJECT_RESOLUTION_FAILED';

/**
 * Builds the response for a run refused because its working directory is inside a project
 * that cannot be read (typically the legacy layout, D#49).
 *
 * Names the directory the client ran from, then the resolver's own message, which already
 * lists the files to move. The run is refused before any workspace, record or step exists.
 */
export class ProjectResolutionRefusal {
	static toResponse(cwd: string, err: unknown): DaemonResponse {
		return {
			type: 'error',
			code: PROJECT_RESOLUTION_FAILED,
			message:
				`The run was refused: the project of "${cwd}" could not be resolved, so no step was queued.\n` +
				getErrorMessage(err),
		};
	}
}
