/**
 * Custom hook to get the current WORKSPACE_ID from environment variables
 * Used to display workspace indicator and differentiate between parallel workspaces
 *
 * @returns {number} workspaceId - 0 for main/production, 1+ for sub-workspaces
 */
export function useWorkspaceId(): number {
	// Get WORKSPACE_ID from Vite environment variables (VITE_ prefix required)
	const workspaceId = parseInt(import.meta.env.VITE_WORKSPACE_ID || '0', 10);

	// Validate that it's a valid number (0-9)
	if (isNaN(workspaceId) || workspaceId < 0 || workspaceId > 9) {
		console.warn(`Invalid WORKSPACE_ID: ${import.meta.env.VITE_WORKSPACE_ID}. Defaulting to 0.`);
		return 0;
	}

	return workspaceId;
}
