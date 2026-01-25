import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import { DualListEmptyState } from '@framework/components/overlays/DualListEmptyState';
import { DualListItem } from '@framework/components/overlays/DualListItem';
import { OptimisticDualListDialog } from '@framework/components/overlays/OptimisticDualListDialog';
import type { Project } from '@shared/api/projects.contract';
import { ArrowLeft, ArrowRight } from 'lucide-react';

/**
 * ===========================================================================================
 * MANAGE PINNED PROJECTS DIALOG - REFACTORED
 * ===========================================================================================
 *
 * Dialog for managing pinned projects with drag & drop reordering.
 * Now uses OptimisticDualListDialog for all state management.
 *
 * Reduced from 232 lines → ~80 lines (65% reduction!)
 *
 * All optimistic update logic is handled by OptimisticDualListDialog:
 * - Optimistic pin/unpin with immediate visual feedback
 * - Optimistic reordering
 * - Loading states during API calls
 * - Reordering states with visual feedback (opacity-50)
 * - Automatic rollback on errors
 * - Clear states on dialog close
 *
 * This component only:
 * - Passes data and handlers to OptimisticDualListDialog
 * - Customizes rendering (icons, labels, badges)
 *
 * ===========================================================================================
 */

export interface ManagePinnedProjectsDialogProps {
	/** Whether the dialog is open */
	open: boolean;
	/** Callback when dialog open state changes */
	onOpenChange: (open: boolean) => void;
	/** All projects */
	projects: Project[];
	/** Pinned projects (already sorted by order) */
	pinnedProjects: Project[];
	/** Callback to pin a project */
	onPin: (projectId: string) => Promise<void>;
	/** Callback to unpin a project */
	onUnpin: (projectId: string) => Promise<void>;
	/** Callback to reorder pinned projects */
	onReorder: (activeId: string, overId: string) => Promise<void>;
}

export function ManagePinnedProjectsDialog({
	open,
	onOpenChange,
	projects,
	pinnedProjects,
	onPin,
	onUnpin,
	onReorder,
}: ManagePinnedProjectsDialogProps) {
	// Get IDs of currently pinned projects
	const pinnedIds = new Set(pinnedProjects.map(p => p.id));

	return (
		<OptimisticDualListDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Customize Project Tabs"
			maxWidth="4xl"
			// Data
			allItems={projects}
			associatedIds={pinnedIds}
			itemKey={project => project.id}
			// Rendering
			leftTitle="Pinned Projects"
			rightTitle="Available Projects"
			renderItem={(project, side, actions) => (
				<DualListItem
					itemId={project.id}
					variant={side === 'left' ? 'sortable' : 'available'}
					icon={
						project.icon && (
							<DynamicLucideIcon
								name={project.icon}
								color={project.iconColor || '#6366F1'}
								className="h-4 w-4"
							/>
						)
					}
					label={project.name}
					onAction={side === 'left' ? actions.onDissociate : actions.onAssociate}
					actionIcon={side === 'left' ? ArrowRight : ArrowLeft}
					actionLabel={side === 'left' ? `Unpin ${project.name}` : `Pin ${project.name}`}
					isLoading={actions.isLoading}
					isReordering={actions.isReordering}
				/>
			)}
			leftEmptyState={<DualListEmptyState message="No pinned projects" />}
			rightEmptyState={<DualListEmptyState message="All projects are pinned" />}
			leftHelpText="Drag to reorder, click → to unpin"
			rightHelpText="Click ← to pin"
			// Search
			searchPlaceholder="Search projects..."
			searchFilter={(project, query) =>
				project.name.toLowerCase().includes(query.toLowerCase()) ||
				(project.description?.toLowerCase().includes(query.toLowerCase()) ?? false)
			}
			// Actions (OptimisticDualListDialog handles the optimistic logic)
			onAssociate={onPin}
			onDissociate={onUnpin}
			onReorder={onReorder}
		/>
	);
}
