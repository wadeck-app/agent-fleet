import { useEffect, useState } from 'react';

import { DualListDialog } from '@framework/components/overlays/DualListDialog';
import { DualListItem } from '@framework/components/overlays/DualListItem';
import { Badge } from '@framework/components/primitives/Badge';
import { getBasename } from '@framework/utils/pathUtils';
import type { Project } from '@shared/api/projects.contract';
import type { Workspace } from '@shared/api/workspaces.contract';
import { ArrowLeft, ArrowRight } from 'lucide-react';

/**
 * ===========================================================================================
 * MANAGE PROJECT WORKSPACES DIALOG COMPONENT
 * ===========================================================================================
 *
 * Dialog for managing workspaces associated with a project with drag & drop reordering.
 * Built using generic DualListDialog and DualListItem components for maximum reusability.
 *
 * Features:
 * - Two-column layout: Associated (left) and Available (right) workspaces
 * - Drag & drop to reorder associated workspaces
 * - Arrow buttons (→ to dissociate, ← to associate)
 * - Real-time search functionality for available workspaces
 * - Auto-save: changes persist immediately to the server
 * - Optimistic UI updates for immediate feedback
 * - Loading states during API calls
 * - Reordering states with visual feedback
 * - Toast notifications for errors only
 *
 * Refactored: Reduced from 344 lines to ~200 lines by using generic components
 * (Note: Still preserves complex optimistic update logic)
 *
 * Usage:
 *   <ManageProjectWorkspacesDialog
 *     open={isOpen}
 *     onOpenChange={setIsOpen}
 *     project={activeProject}
 *     workspaces={allWorkspaces}
 *     onAssociate={handleAssociate}
 *     onDissociate={handleDissociate}
 *     onReorder={handleReorder}
 *   />
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
	const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
	const [reorderingIds, setReorderingIds] = useState<Set<string>>(new Set());

	// Optimistic UI: Track pending associations/dissociations
	// These represent user intent and override server state until confirmed
	const [optimisticAssociations, setOptimisticAssociations] = useState<Set<string>>(new Set());
	const [optimisticDissociations, setOptimisticDissociations] = useState<Set<string>>(new Set());

	// Clear optimistic state when dialog closes
	useEffect(() => {
		if (!open) {
			setOptimisticAssociations(new Set());
			setOptimisticDissociations(new Set());
			setLoadingItems(new Set());
		}
	}, [open]);

	// Get associated workspaces with optimistic updates
	// Hierarchy: User intent (optimistic) > Server state
	const baseAssociatedIds = new Set(project?.workspaceIds || []);

	// Apply optimistic updates to associated IDs
	const effectiveAssociatedIds = new Set(baseAssociatedIds);
	optimisticAssociations.forEach(id => effectiveAssociatedIds.add(id));
	optimisticDissociations.forEach(id => effectiveAssociatedIds.delete(id));

	// Build associated workspaces list (ordered by effectiveAssociatedIds)
	const associatedWorkspaces = Array.from(effectiveAssociatedIds)
		.map((id: string) => workspaces.find((w: Workspace) => w.id === id))
		.filter((w: Workspace | undefined): w is Workspace => w !== undefined);

	// Get available (non-associated) workspaces - everything NOT in effectiveAssociatedIds
	const availableWorkspaces = workspaces.filter((w: Workspace) => !effectiveAssociatedIds.has(w.id));

	// Handle reordering with state management
	const handleReorder = async (activeId: string, overId: string) => {
		// Mark all associated workspaces as reordering (since we update the order)
		const allAssociatedIds = new Set<string>(associatedWorkspaces.map((w: Workspace) => w.id));
		setReorderingIds(allAssociatedIds);

		try {
			await onReorder(activeId, overId);
		} catch (error) {
			console.error('Failed to reorder workspaces:', error);
		} finally {
			setReorderingIds(new Set());
		}
	};

	// Handle associate action with optimistic UI
	const handleAssociate = async (workspaceId: string) => {
		// 1. Optimistic update: Move immediately (user intent is truth)
		setOptimisticAssociations(prev => new Set(prev).add(workspaceId));
		// Clear opposite optimistic state if present (e.g., user clicked dissociate then associate)
		setOptimisticDissociations(prev => {
			if (prev.has(workspaceId)) {
				const next = new Set(prev);
				next.delete(workspaceId);
				return next;
			}
			return prev;
		});
		setLoadingItems(prev => new Set(prev).add(workspaceId));

		try {
			// 2. API call to persist
			await onAssociate(workspaceId);

			// 3. Success: DON'T clear optimistic yet!
			//    Keep it until props sync (WebSocket event) or dialog closes
			//    Otherwise workspace will jump back to Available
		} catch (error) {
			// 4. Error: Rollback optimistic update
			console.error('Failed to associate workspace:', error);
			setOptimisticAssociations(prev => {
				const next = new Set(prev);
				next.delete(workspaceId);
				return next;
			});
			// TODO: Show error toast
		} finally {
			// Clear loading state when API call completes
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(workspaceId);
				return next;
			});
		}
	};

	// Handle dissociate action with optimistic UI
	const handleDissociate = async (workspaceId: string) => {
		// 1. Optimistic update: Remove immediately (user intent is truth)
		setOptimisticDissociations(prev => new Set(prev).add(workspaceId));
		// Clear opposite optimistic state if present (e.g., user clicked associate then dissociate)
		setOptimisticAssociations(prev => {
			if (prev.has(workspaceId)) {
				const next = new Set(prev);
				next.delete(workspaceId);
				return next;
			}
			return prev;
		});
		setLoadingItems(prev => new Set(prev).add(workspaceId));

		try {
			// 2. API call to persist
			await onDissociate(workspaceId);

			// 3. Success: DON'T clear optimistic yet!
			//    Keep it until props sync (WebSocket event) or dialog closes
		} catch (error) {
			// 4. Error: Rollback optimistic update
			console.error('Failed to dissociate workspace:', error);
			setOptimisticDissociations(prev => {
				const next = new Set(prev);
				next.delete(workspaceId);
				return next;
			});
			// TODO: Show error toast
		} finally {
			// Clear loading state when API call completes
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(workspaceId);
				return next;
			});
		}
	};

	return (
		<DualListDialog
			open={open}
			onOpenChange={onOpenChange}
			title={project ? `Manage Workspaces for ${project.name}` : 'Manage Workspaces'}
			maxWidth="4xl"
			// Left panel: Associated workspaces
			leftTitle="Associated Workspaces"
			leftItems={associatedWorkspaces}
			leftItemKey={workspace => workspace.id}
			leftItemRenderer={(workspace, actions) => {
				const displayName = workspace.name || getBasename(workspace.path);
				return (
					<DualListItem
						itemId={workspace.id}
						variant="sortable"
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
						onAction={handleDissociate}
						actionIcon={ArrowRight}
						actionLabel={`Dissociate ${displayName}`}
						isLoading={actions.isLoading}
						isReordering={actions.isReordering}
					/>
				);
			}}
			leftEmptyState={
				<div className="flex flex-col items-center justify-center py-8 text-center">
					<div className="mb-2 text-3xl text-muted-foreground">🔗</div>
					<p className="text-sm text-muted-foreground">No associated workspaces</p>
					<p className="text-xs text-muted-foreground">Associate workspaces from the right panel</p>
				</div>
			}
			leftHelpText="Drag to reorder, click → to dissociate"
			onReorder={handleReorder}
			// Right panel: Available workspaces
			rightTitle="Available Workspaces"
			rightItems={availableWorkspaces}
			rightItemKey={workspace => workspace.id}
			rightItemRenderer={(workspace, actions) => {
				const displayName = workspace.name || getBasename(workspace.path);
				return (
					<DualListItem
						itemId={workspace.id}
						variant="available"
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
						onAction={handleAssociate}
						actionIcon={ArrowLeft}
						actionLabel={`Associate ${displayName}`}
						isLoading={actions.isLoading}
					/>
				);
			}}
			rightEmptyState={
				<div className="flex flex-col items-center justify-center py-8 text-center">
					<div className="mb-2 text-3xl text-muted-foreground">✨</div>
					<p className="text-sm text-muted-foreground">All workspaces are associated</p>
				</div>
			}
			rightHelpText="Click ← to associate"
			searchPlaceholder="Search workspaces..."
			searchFilter={(workspace, query) => {
				const displayName = workspace.name || getBasename(workspace.path);
				return (
					displayName.toLowerCase().includes(query.toLowerCase()) ||
					workspace.path.toLowerCase().includes(query.toLowerCase())
				);
			}}
			loadingItems={loadingItems}
			reorderingItems={reorderingIds}
		/>
	);
}
