/**
 * ===========================================================================================
 * DUAL LIST EMPTY STATE COMPONENT
 * ===========================================================================================
 *
 * Reusable empty state component for DualListView panels.
 * Displays a simple centered message when a panel has no items.
 *
 * Usage:
 *   <DualListEmptyState message="No items available" />
 *
 * ===========================================================================================
 */

export interface DualListEmptyStateProps {
	/** Message to display */
	message: string;
}

export function DualListEmptyState({ message }: DualListEmptyStateProps) {
	return (
		<div className="flex flex-col items-center justify-center py-8 text-center">
			<p className="text-sm text-muted-foreground">{message}</p>
		</div>
	);
}
