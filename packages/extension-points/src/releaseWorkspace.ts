import type { WorkspaceHandle, WorkspaceProvider } from './workspace/v1.js';

/**
 * Implements the release() dual-error contract from the workspace-provider spec:
 * - No prior error: propagate the release error as the run error.
 * - Prior error present: log release error as warning, re-throw the original error.
 */
export async function releaseWorkspace(
	provider: WorkspaceProvider,
	handle: WorkspaceHandle,
	priorError?: unknown
): Promise<void> {
	try {
		await provider.release(handle);
	} catch (releaseErr: unknown) {
		const releaseMsg = releaseErr instanceof Error ? releaseErr.message : String(releaseErr);
		if (priorError !== undefined) {
			console.warn(
				`[workspace] Failed to release workspace "${handle.id}": ${releaseMsg}. Original error is propagated.`
			);
			throw priorError;
		}
		throw releaseErr;
	}
}
