import { useEffect, useState } from 'react';

import { DynamicLucideIcon } from '@framework/components/icons/DynamicLucideIcon';
import { DualListDialog } from '@framework/components/overlays/DualListDialog';
import { DualListItem } from '@framework/components/overlays/DualListItem';
import type { Project } from '@shared/api/projects.contract';
import { ArrowLeft, ArrowRight } from 'lucide-react';

/**
 * ===========================================================================================
 * MANAGE PINNED PROJECTS DIALOG COMPONENT
 * ===========================================================================================
 *
 * Dialog for managing pinned projects with drag & drop reordering.
 * Built using generic DualListDialog and DualListItem components for maximum reusability.
 *
 * Features:
 * - Two-column layout: Pinned (left) and Available (right) projects
 * - Drag & drop to reorder pinned projects
 * - Arrow buttons (→ to unpin, ← to pin)
 * - Real-time search functionality for available projects
 * - Auto-save: changes persist immediately to the server
 * - Loading states during API calls
 * - Reordering states with visual feedback
 * - Toast notifications for errors only
 *
 * Refactored: Reduced from 252 lines to ~130 lines by using generic components
 *
 * Usage:
 *   <ManagePinnedProjectsDialog
 *     open={isOpen}
 *     onOpenChange={setIsOpen}
 *     projects={allProjects}
 *     pinnedProjects={pinnedProjects}
 *     onPin={handlePin}
 *     onUnpin={handleUnpin}
 *     onReorder={handleReorder}
 *   />
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
	const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
	const [reorderingIds, setReorderingIds] = useState<Set<string>>(new Set());

	// Optimistic UI: Track pending pin/unpin operations
	// These represent user intent and override server state until confirmed
	const [optimisticPins, setOptimisticPins] = useState<Set<string>>(new Set());
	const [optimisticUnpins, setOptimisticUnpins] = useState<Set<string>>(new Set());

	// Optimistic reordering: Track the optimistic order
	const [optimisticOrder, setOptimisticOrder] = useState<string[] | null>(null);

	// Clear optimistic state when dialog closes
	useEffect(() => {
		if (!open) {
			setOptimisticPins(new Set());
			setOptimisticUnpins(new Set());
			setOptimisticOrder(null);
			setLoadingItems(new Set());
			setReorderingIds(new Set());
		}
	}, [open]);

	// Calculate effective pinned state (props + optimistic)
	// Hierarchy: User intent (optimistic) > Server state (props)
	const basePinnedIds = new Set(pinnedProjects.map(p => p.id));
	const effectivePinnedIds = new Set(basePinnedIds);
	optimisticPins.forEach(id => effectivePinnedIds.add(id));
	optimisticUnpins.forEach(id => effectivePinnedIds.delete(id));

	// Build effective pinned projects list
	let effectivePinnedProjects = projects.filter(p => effectivePinnedIds.has(p.id));

	// Apply optimistic reordering if present
	if (optimisticOrder) {
		// Reorder based on optimistic order
		const orderMap = new Map(optimisticOrder.map((id, index) => [id, index]));
		effectivePinnedProjects = effectivePinnedProjects.sort((a, b) => {
			const orderA = orderMap.get(a.id) ?? Infinity;
			const orderB = orderMap.get(b.id) ?? Infinity;
			return orderA - orderB;
		});
	} else {
		// Use server order
		effectivePinnedProjects = effectivePinnedProjects.sort((a, b) => {
			const orderA = a.order ?? Infinity;
			const orderB = b.order ?? Infinity;
			return orderA - orderB;
		});
	}

	// Build effective available projects list
	const effectiveAvailableProjects = projects.filter(p => !effectivePinnedIds.has(p.id));

	// Handle reordering with optimistic UI
	const handleReorder = async (activeId: string, overId: string) => {
		// Calculate new order optimistically
		const currentOrder = effectivePinnedProjects.map(p => p.id);
		const activeIndex = currentOrder.indexOf(activeId);
		const overIndex = currentOrder.indexOf(overId);

		if (activeIndex === -1 || overIndex === -1) return;

		// Reorder the array
		const newOrder = [...currentOrder];
		newOrder.splice(activeIndex, 1);
		newOrder.splice(overIndex, 0, activeId);

		// Apply optimistic reordering
		setOptimisticOrder(newOrder);

		// Mark all pinned projects as reordering
		const allPinnedIds = new Set(effectivePinnedProjects.map(p => p.id));
		setReorderingIds(allPinnedIds);

		try {
			await onReorder(activeId, overId);
			// Success: keep optimistic order until props sync
		} catch (error) {
			console.error('Failed to reorder projects:', error);
			// Rollback on error
			setOptimisticOrder(null);
		} finally {
			setReorderingIds(new Set());
		}
	};

	// Handle pin action with optimistic UI
	const handlePin = async (projectId: string) => {
		// 1. Optimistic update: Move immediately (user intent is truth)
		setOptimisticPins(prev => new Set(prev).add(projectId));
		// Clear opposite optimistic state if present
		setOptimisticUnpins(prev => {
			if (prev.has(projectId)) {
				const next = new Set(prev);
				next.delete(projectId);
				return next;
			}
			return prev;
		});
		setLoadingItems(prev => new Set(prev).add(projectId));

		try {
			// 2. API call to persist
			await onPin(projectId);

			// 3. Success: DON'T clear optimistic yet!
			//    Keep it until props sync (WebSocket event) or dialog closes
			//    Otherwise project will jump back to Available
		} catch (error) {
			// 4. Error: Rollback optimistic update
			console.error('Failed to pin project:', error);
			setOptimisticPins(prev => {
				const next = new Set(prev);
				next.delete(projectId);
				return next;
			});
		} finally {
			// Clear loading state when API call completes
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(projectId);
				return next;
			});
		}
	};

	// Handle unpin action with optimistic UI
	const handleUnpin = async (projectId: string) => {
		// 1. Optimistic update: Remove immediately (user intent is truth)
		setOptimisticUnpins(prev => new Set(prev).add(projectId));
		// Clear opposite optimistic state if present
		setOptimisticPins(prev => {
			if (prev.has(projectId)) {
				const next = new Set(prev);
				next.delete(projectId);
				return next;
			}
			return prev;
		});
		setLoadingItems(prev => new Set(prev).add(projectId));

		try {
			// 2. API call to persist
			await onUnpin(projectId);

			// 3. Success: DON'T clear optimistic yet!
			//    Keep it until props sync (WebSocket event) or dialog closes
		} catch (error) {
			// 4. Error: Rollback optimistic update
			console.error('Failed to unpin project:', error);
			setOptimisticUnpins(prev => {
				const next = new Set(prev);
				next.delete(projectId);
				return next;
			});
		} finally {
			// Clear loading state when API call completes
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(projectId);
				return next;
			});
		}
	};

	return (
		<DualListDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Customize Project Tabs"
			maxWidth="4xl"
			// Left panel: Pinned projects
			leftTitle="Pinned Projects"
			leftItems={effectivePinnedProjects}
			leftItemKey={project => project.id}
			leftItemRenderer={(project, actions) => (
				<DualListItem
					itemId={project.id}
					variant="sortable"
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
					onAction={handleUnpin}
					actionIcon={ArrowRight}
					actionLabel={`Unpin ${project.name}`}
					isLoading={actions.isLoading}
					isReordering={actions.isReordering}
				/>
			)}
			leftEmptyState={
				<div className="flex flex-col items-center justify-center py-8 text-center">
					<div className="mb-2 text-3xl text-muted-foreground">📌</div>
					<p className="text-sm text-muted-foreground">No pinned projects</p>
					<p className="text-xs text-muted-foreground">Pin projects from the right panel</p>
				</div>
			}
			leftHelpText="Drag to reorder, click → to unpin"
			onReorder={handleReorder}
			// Right panel: Available projects
			rightTitle="Available Projects"
			rightItems={effectiveAvailableProjects}
			rightItemKey={project => project.id}
			rightItemRenderer={(project, actions) => (
				<DualListItem
					itemId={project.id}
					variant="available"
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
					onAction={handlePin}
					actionIcon={ArrowLeft}
					actionLabel={`Pin ${project.name}`}
					isLoading={actions.isLoading}
				/>
			)}
			rightEmptyState={
				<div className="flex flex-col items-center justify-center py-8 text-center">
					<div className="mb-2 text-3xl text-muted-foreground">✨</div>
					<p className="text-sm text-muted-foreground">All projects are pinned</p>
				</div>
			}
			rightHelpText="Click ← to pin"
			searchPlaceholder="Search projects..."
			searchFilter={(project, query) =>
				project.name.toLowerCase().includes(query.toLowerCase()) ||
				(project.description?.toLowerCase().includes(query.toLowerCase()) ?? false)
			}
			loadingItems={loadingItems}
			reorderingItems={reorderingIds}
		/>
	);
}
