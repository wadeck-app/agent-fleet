import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { cn } from '@framework/lib/utils';
import type { Workspace } from '@shared/api/workspaces.contract';
import { ArrowLeft } from 'lucide-react';

/**
 * ===========================================================================================
 * AVAILABLE WORKSPACE ITEM COMPONENT
 * ===========================================================================================
 *
 * Non-associated workspace item with associate button.
 *
 * Features:
 * - Workspace color dot and name display
 * - Task count badge
 * - Arrow left button (←) to associate the workspace
 * - Hover effect
 * - Loading state during API calls
 *
 * Usage:
 *   <AvailableWorkspaceItem
 *     workspace={workspace}
 *     onAssociate={handleAssociate}
 *     isLoading={false}
 *   />
 *
 * ===========================================================================================
 */

export interface AvailableWorkspaceItemProps {
	/** Workspace to display */
	workspace: Workspace;
	/** Callback when associate button is clicked */
	onAssociate: (workspaceId: string) => void;
	/** Whether this item is in a loading state */
	isLoading?: boolean;
}

// Helper to extract basename from path
function getBasename(path: string): string {
	return path.split(/[/\\]/).pop() || path;
}

export function AvailableWorkspaceItem({ workspace, onAssociate, isLoading = false }: AvailableWorkspaceItemProps) {
	const displayName = workspace.name || getBasename(workspace.path);

	return (
		<div
			className={cn(
				'flex items-center gap-2 rounded-sm px-2 py-1.5 transition-colors',
				'hover:bg-accent',
				isLoading && 'pointer-events-none opacity-50'
			)}
		>
			{/* Associate Button (Arrow Left) - Positioned on the left */}
			<Button
				variant="ghost"
				size="icon-xs"
				onClick={e => {
					e.stopPropagation();
					onAssociate(workspace.id);
				}}
				disabled={isLoading}
				className={`
      opacity-70
      hover:opacity-100
    `}
				aria-label={`Associate ${displayName}`}
				title="Associate workspace"
			>
				<ArrowLeft className="size-5" />
			</Button>

			{/* Workspace Color Dot */}
			{workspace.color && (
				<div
					className="h-3 w-3 rounded-full border border-border"
					style={{ backgroundColor: workspace.color }}
					title={workspace.color}
				/>
			)}

			{/* Workspace Name */}
			<span className="flex-1 text-sm">{displayName}</span>

			{/* Task Count Badge */}
			<Badge variant="secondary" className="text-xs" title={`${workspace.tasksCount} task(s)`}>
				{workspace.tasksCount}
			</Badge>
		</div>
	);
}
