import type { Workspace } from '@shared/api/workspaces.contract';

// Color palette matching ColorPicker component
const COLORS = [
	'#6366F1', // Indigo
	'#A855F7', // Violet
	'#EC4899', // Pink
	'#EF4444', // Red
	'#F97316', // Orange
	'#F59E0B', // Amber
	'#EAB308', // Yellow
	'#84CC16', // Lime
	'#22C55E', // Green
	'#10B981', // Emerald
	'#14B8A6', // Teal
	'#06B6D4', // Cyan
	'#0EA5E9', // Sky
	'#3B82F6', // Blue
	'#64748B', // Slate
	'#6B7280', // Gray
];

/**
 * Get colors that are not yet used by workspaces in the same project
 * @param workspaces - All workspaces
 * @param projectId - Project ID to filter by
 * @returns Array of unused color hex codes
 */
export function getUnusedColors(workspaces: Workspace[], projectId?: string): string[] {
	// Safety check for undefined/null workspaces
	if (!workspaces) {
		return [...COLORS];
	}

	if (!projectId) {
		// If no project, return all colors
		return [...COLORS];
	}

	// Get colors used by workspaces in this project
	const usedColors = new Set(
		workspaces
			.filter(w => w.projectId === projectId && w.color)
			.map(w => w.color!.toUpperCase())
	);

	// Return colors not yet used
	return COLORS.filter(color => !usedColors.has(color.toUpperCase()));
}

/**
 * Suggest a color for a new/edited workspace
 * - If workspace is in a project, suggest an unused color from that project
 * - If all colors are used, return a random color
 * - If no project, return a random color
 * @param workspaces - All workspaces
 * @param projectId - Project ID to filter by (optional)
 * @returns Suggested color hex code
 */
export function suggestWorkspaceColor(workspaces: Workspace[], projectId?: string): string {
	// Safety check for undefined/null workspaces
	if (!workspaces) {
		return COLORS[Math.floor(Math.random() * COLORS.length)];
	}

	const unusedColors = getUnusedColors(workspaces, projectId);

	if (unusedColors.length === 0) {
		// All colors used, return random color from palette
		return COLORS[Math.floor(Math.random() * COLORS.length)];
	}

	// Return random unused color
	return unusedColors[Math.floor(Math.random() * unusedColors.length)];
}
