import { useState } from 'react';

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

	// Get available (non-pinned) projects
	const availableProjects = projects.filter(p => !p.pinned);

	// Handle reordering with state management
	const handleReorder = async (activeId: string, overId: string) => {
		// Mark all pinned projects as reordering (since we update all their order fields)
		const allPinnedIds = new Set(pinnedProjects.map(p => p.id));
		setReorderingIds(allPinnedIds);

		try {
			await onReorder(activeId, overId);
		} catch (error) {
			console.error('Failed to reorder projects:', error);
		} finally {
			setReorderingIds(new Set());
		}
	};

	// Handle pin action
	const handlePin = async (projectId: string) => {
		setLoadingItems(prev => new Set(prev).add(projectId));
		try {
			await onPin(projectId);
		} catch (error) {
			console.error('Failed to pin project:', error);
		} finally {
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(projectId);
				return next;
			});
		}
	};

	// Handle unpin action
	const handleUnpin = async (projectId: string) => {
		setLoadingItems(prev => new Set(prev).add(projectId));
		try {
			await onUnpin(projectId);
		} catch (error) {
			console.error('Failed to unpin project:', error);
		} finally {
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
			leftItems={pinnedProjects}
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
			rightItems={availableProjects}
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
