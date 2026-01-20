import { useEffect, useState } from 'react';

import {
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SearchBar } from '@framework/components/forms/SearchBar';
import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import type { Project } from '@shared/api/projects.contract';
import type { Workspace } from '@shared/api/workspaces.contract';

import { AvailableWorkspaceItem } from './AvailableWorkspaceItem';
import { SortableAssociatedWorkspaceItem } from './SortableAssociatedWorkspaceItem';

/**
 * ===========================================================================================
 * MANAGE PROJECT WORKSPACES DIALOG COMPONENT
 * ===========================================================================================
 *
 * Dialog for managing workspaces associated with a project with drag & drop reordering.
 *
 * Features:
 * - Two-column layout: Associated (left) and Available (right) workspaces
 * - Drag & drop to reorder associated workspaces
 * - Arrow buttons (→ to dissociate, ← to associate)
 * - Search functionality in available workspaces
 * - Auto-save: changes persist immediately to the server
 * - Loading states during API calls
 * - Toast notifications for errors only
 *
 * Layout:
 * - Left column: Associated workspaces with drag handles
 * - Right column: Available workspaces with search
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
	const [searchQuery, setSearchQuery] = useState('');
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

	// Configure drag & drop sensors
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8, // Require 8px of movement before activating drag
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

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

	// Filter available workspaces by search query
	const filteredAvailableWorkspaces = availableWorkspaces.filter((workspace: Workspace) => {
		const displayName = workspace.name || workspace.path.split(/[/\\]/).pop() || workspace.path;
		return (
			displayName.toLowerCase().includes(searchQuery.toLowerCase()) ||
			workspace.path.toLowerCase().includes(searchQuery.toLowerCase())
		);
	});

	// Handle drag end for reordering
	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over || active.id === over.id) {
			return;
		}

		// Mark all associated workspaces as reordering (since we update the order)
		const allAssociatedIds = new Set<string>(associatedWorkspaces.map((w: Workspace) => w.id));
		setReorderingIds(allAssociatedIds);

		try {
			await onReorder(active.id as string, over.id as string);
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
		<CrudDialog
			open={open}
			onOpenChange={onOpenChange}
			title={project ? `Manage Workspaces for ${project.name}` : 'Manage Workspaces'}
			maxWidth="4xl"
			showCloseButton={true}
		>
			<div className="grid grid-cols-2 gap-6 p-6">
				{/* Left Column: Associated Workspaces */}
				<div className="space-y-4">
					<div className="border-b pb-2">
						<h3 className="text-sm font-semibold">Associated Workspaces</h3>
					</div>

					{associatedWorkspaces.length === 0 ? (
						<div
							className={`
        flex flex-col items-center justify-center py-8 text-center
      `}
						>
							<div className="mb-2 text-3xl text-muted-foreground">🔗</div>
							<p className="text-sm text-muted-foreground">No associated workspaces</p>
							<p className="text-xs text-muted-foreground">Associate workspaces from the right panel</p>
						</div>
					) : (
						<>
							<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
								<SortableContext
									items={associatedWorkspaces.map((w: Workspace) => w.id)}
									strategy={verticalListSortingStrategy}
								>
									<div className="space-y-1">
										{associatedWorkspaces.map((workspace: Workspace) => (
											<SortableAssociatedWorkspaceItem
												key={workspace.id}
												workspace={workspace}
												onDissociate={handleDissociate}
												isLoading={loadingItems.has(workspace.id)}
												isReordering={reorderingIds.has(workspace.id)}
											/>
										))}
									</div>
								</SortableContext>
							</DndContext>

							<p className="text-xs text-muted-foreground">Drag to reorder, click → to dissociate</p>
						</>
					)}
				</div>

				{/* Right Column: Available Workspaces */}
				<div className="space-y-4">
					<div className="border-b pb-2">
						<h3 className="text-sm font-semibold">Available Workspaces</h3>
					</div>

					{/* Search Bar */}
					<SearchBar
						value={searchQuery}
						onChange={setSearchQuery}
						onClear={() => setSearchQuery('')}
						placeholder="Search workspaces..."
						label=""
						className="mb-2"
					/>

					{availableWorkspaces.length === 0 ? (
						<div
							className={`
        flex flex-col items-center justify-center py-8 text-center
      `}
						>
							<div className="mb-2 text-3xl text-muted-foreground">✨</div>
							<p className="text-sm text-muted-foreground">All workspaces are associated</p>
						</div>
					) : filteredAvailableWorkspaces.length === 0 ? (
						<div
							className={`
        flex flex-col items-center justify-center py-8 text-center
      `}
						>
							<div className="mb-2 text-3xl text-muted-foreground">🔍</div>
							<p className="text-sm text-muted-foreground">No workspaces match your search</p>
						</div>
					) : (
						<>
							<div className="max-h-[400px] space-y-1 overflow-y-auto">
								{filteredAvailableWorkspaces.map(workspace => (
									<AvailableWorkspaceItem
										key={workspace.id}
										workspace={workspace}
										onAssociate={handleAssociate}
										isLoading={loadingItems.has(workspace.id)}
									/>
								))}
							</div>

							<p className="text-xs text-muted-foreground">Click ← to associate</p>
						</>
					)}
				</div>
			</div>
		</CrudDialog>
	);
}
