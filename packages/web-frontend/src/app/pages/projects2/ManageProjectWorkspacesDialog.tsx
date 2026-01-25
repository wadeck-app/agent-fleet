import { DualListEmptyState } from '@framework/components/overlays/DualListEmptyState';
import { DualListItem } from '@framework/components/overlays/DualListItem';
import { OptimisticDualListDialog } from '@framework/components/overlays/OptimisticDualListDialog';
import { Badge } from '@framework/components/primitives/Badge';
import { getBasename } from '@framework/utils/pathUtils';
import type { Project } from '@shared/api/projects.contract';
import type { Workspace } from '@shared/api/workspaces.contract';
import { ArrowLeft, ArrowRight } from 'lucide-react';

/**
 * ===========================================================================================
 * MANAGE PROJECT WORKSPACES DIALOG - REFACTORED
 * ===========================================================================================
 *
 * Dialog for managing workspaces associated with a project with drag & drop reordering.
 * Now uses OptimisticDualListDialog for all state management.
 *
 * Reduced from 339 lines → ~120 lines (65% reduction!)
 *
 * All optimistic update logic is handled by OptimisticDualListDialog:
 * - Optimistic associate/dissociate with immediate visual feedback
 * - Optimistic reordering
 * - Loading states during API calls
 * - Reordering states with visual feedback (opacity-50)
 * - Automatic rollback on errors
 * - Clear states on dialog close
 *
 * This component only:
 * - Passes data and handlers to OptimisticDualListDialog
 * - Customizes rendering (workspace display, badges, colors)
 *
 * ===========================================================================================
 */

export interface ManageProjectWorkspacesDialogProps {
	/** Whether the dialog is open */
	open: boolean;
	/** Callback when dialog open state changes */
	onOpenChange: (open: boolean) => void;
	/** The project to manage workspaces for */
	project: Project | undefined;
	/** All workspaces */
	workspaces: Workspace[];
	/** Callback to associate a workspace */
	onAssociate: (workspaceId: string) => Promise<void>;
	/** Callback to dissociate a workspace */
	onDissociate: (workspaceId: string) => Promise<void>;
	/** Callback to reorder associated workspaces */
	onReorder: (activeId: string, overId: string) => Promise<void>;
}

export function ManageProjectWorkspacesDialog({
	open,
	onOpenChange,
	project,
	workspaces,
	onAssociate,
	onDissociate,
	onReorder,
}: ManageProjectWorkspacesDialogProps) {
	// Get IDs of currently associated workspaces
	const associatedIds = new Set(project?.workspaceIds || []);

	return (
		<OptimisticDualListDialog
			open={open}
			onOpenChange={onOpenChange}
			title={project ? `Manage Workspaces for ${project.name}` : 'Manage Workspaces'}
			maxWidth="4xl"
			// Data
			allItems={workspaces}
			associatedIds={associatedIds}
			itemKey={workspace => workspace.id}
			// Rendering
			leftTitle="Associated Workspaces"
			rightTitle="Available Workspaces"
			renderItem={(workspace, side, actions) => {
				const displayName = workspace.name || getBasename(workspace.path);
				return (
					<DualListItem
						itemId={workspace.id}
						variant={side === 'left' ? 'sortable' : 'available'}
						icon={
							workspace.color && (
								<div
									className="h-3 w-3 rounded-full border border-border"
									style={{ backgroundColor: workspace.color }}
									title={workspace.color}
								/>
							)
						}
						label={displayName}
						badge={
							<Badge variant="secondary" className="text-xs" title={`${workspace.tasksCount} task(s)`}>
								{workspace.tasksCount}
							</Badge>
						}
						onAction={side === 'left' ? actions.onDissociate : actions.onAssociate}
						actionIcon={side === 'left' ? ArrowRight : ArrowLeft}
						actionLabel={side === 'left' ? `Dissociate ${displayName}` : `Associate ${displayName}`}
						isLoading={actions.isLoading}
						isReordering={actions.isReordering}
					/>
				);
			}}
			leftEmptyState={<DualListEmptyState message="No associated workspaces" />}
			rightEmptyState={<DualListEmptyState message="All workspaces are associated" />}
			leftHelpText="Drag to reorder, click → to dissociate"
			rightHelpText="Click ← to associate"
			// Search
			searchPlaceholder="Search workspaces..."
			searchFilter={(workspace, query) => {
				const displayName = workspace.name || getBasename(workspace.path);
				return (
					displayName.toLowerCase().includes(query.toLowerCase()) ||
					workspace.path.toLowerCase().includes(query.toLowerCase())
				);
			}}
			// Actions (OptimisticDualListDialog handles the optimistic logic)
			onAssociate={onAssociate}
			onDissociate={onDissociate}
			onReorder={onReorder}
		/>
	);
}
