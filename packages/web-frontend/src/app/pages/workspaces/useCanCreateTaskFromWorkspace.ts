import type { Workspace } from '@shared/api/workspaces.contract';

/**
 * Hook to determine if a "Create Task" button should be visible/enabled for a workspace
 *
 * Returns:
 * - canCreate: true if the workspace has an active worker
 * - reason: optional string explaining why the button is disabled
 */
export function useCanCreateTaskFromWorkspace(workspace: Workspace): {
	canCreate: boolean;
	reason?: string;
} {
	if (!workspace.activeWorkerId) {
		return { canCreate: false, reason: 'No active worker' };
	}

	return { canCreate: true };
}
