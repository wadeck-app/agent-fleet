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
 * Get colors that are not yet used by the given workspaces
 * @param projectWorkspaces - Workspaces to check for used colors
 * @returns Array of unused color hex codes
 */
export function getUnusedColors(projectWorkspaces: Workspace[]): string[] {
	// Safety check for undefined/null workspaces
	if (!projectWorkspaces || projectWorkspaces.length === 0) {
		return [...COLORS];
	}

	// Get colors used by workspaces
	const usedColors = new Set(projectWorkspaces.filter(w => w.color).map(w => w.color!.toUpperCase()));

	// Return colors not yet used
	return COLORS.filter(color => !usedColors.has(color.toUpperCase()));
}

/**
 * Suggest a color for a new/edited workspace
 * - Suggest an unused color from the provided workspaces
 * - If all colors are used, return a random color
 * @param projectWorkspaces - Workspaces to check for used colors
 * @returns Suggested color hex code
 */
export function suggestWorkspaceColor(projectWorkspaces: Workspace[]): string {
	// Safety check for undefined/null workspaces
	if (!projectWorkspaces) {
		return COLORS[Math.floor(Math.random() * COLORS.length)];
	}

	const unusedColors = getUnusedColors(projectWorkspaces);

	if (unusedColors.length === 0) {
		// All colors used, return random color from palette
		return COLORS[Math.floor(Math.random() * COLORS.length)];
	}

	// Return random unused color
	return unusedColors[Math.floor(Math.random() * unusedColors.length)];
}
