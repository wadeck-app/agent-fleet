import { useState } from 'react';

import {
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	closestCenter,
	useSensor,
	useSensors,
} from '@dnd-kit/core';
import {
	SortableContext,
	arrayMove,
	sortableKeyboardCoordinates,
	verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { SearchBar } from '@framework/components/forms/SearchBar';
import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import type { Project } from '@shared/api/projects.contract';

import { AvailableProjectItem } from './AvailableProjectItem';
import { SortablePinnedProjectItem } from './SortablePinnedProjectItem';

/**
 * ===========================================================================================
 * MANAGE PINNED PROJECTS DIALOG COMPONENT
 * ===========================================================================================
 *
 * Dialog for managing pinned projects with drag & drop reordering.
 *
 * Features:
 * - Two-column layout: Pinned (left) and Available (right) projects
 * - Drag & drop to reorder pinned projects
 * - Arrow buttons (→ to unpin, ← to pin) instead of × and ○
 * - Search functionality in available projects
 * - Auto-save: changes persist immediately to the server
 * - Loading states during API calls
 * - Toast notifications for errors only
 *
 * Layout:
 * - Left column: Pinned projects with drag handles
 * - Right column: Available projects with search
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
	const [searchQuery, setSearchQuery] = useState('');
	const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
	const [reorderingIds, setReorderingIds] = useState<Set<string>>(new Set());

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

	// Get available (non-pinned) projects
	const availableProjects = projects.filter(p => !p.pinned);

	// Filter available projects by search query
	const filteredAvailableProjects = availableProjects.filter(
		project =>
			project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
			project.description?.toLowerCase().includes(searchQuery.toLowerCase())
	);

	// Handle drag end for reordering
	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over || active.id === over.id) {
			return;
		}

		// Mark all pinned projects as reordering (since we update all their order fields)
		const allPinnedIds = new Set(pinnedProjects.map(p => p.id));
		setReorderingIds(allPinnedIds);

		try {
			await onReorder(active.id as string, over.id as string);
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
		<CrudDialog
			open={open}
			onOpenChange={onOpenChange}
			title="Customize Project Tabs"
			maxWidth="4xl"
			showCloseButton={true}
		>
			<div className="grid grid-cols-2 gap-6 p-6">
				{/* Left Column: Pinned Projects */}
				<div className="space-y-4">
					<div className="border-b pb-2">
						<h3 className="text-sm font-semibold">Pinned Projects</h3>
					</div>

					{pinnedProjects.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-8 text-center">
							<div className="mb-2 text-3xl text-muted-foreground">📌</div>
							<p className="text-sm text-muted-foreground">No pinned projects</p>
							<p className="text-xs text-muted-foreground">Pin projects from the right panel</p>
						</div>
					) : (
						<>
							<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
								<SortableContext
									items={pinnedProjects.map(p => p.id)}
									strategy={verticalListSortingStrategy}
								>
									<div className="space-y-1">
										{pinnedProjects.map(project => (
											<SortablePinnedProjectItem
												key={project.id}
												project={project}
												onUnpin={handleUnpin}
												isLoading={loadingItems.has(project.id)}
												isReordering={reorderingIds.has(project.id)}
											/>
										))}
									</div>
								</SortableContext>
							</DndContext>

							<p className="text-xs text-muted-foreground">Drag to reorder, click → to unpin</p>
						</>
					)}
				</div>

				{/* Right Column: Available Projects */}
				<div className="space-y-4">
					<div className="border-b pb-2">
						<h3 className="text-sm font-semibold">Available Projects</h3>
					</div>

					{/* Search Bar */}
					<SearchBar
						value={searchQuery}
						onChange={setSearchQuery}
						onClear={() => setSearchQuery('')}
						placeholder="Search projects..."
						label=""
						className="mb-2"
					/>

					{availableProjects.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-8 text-center">
							<div className="mb-2 text-3xl text-muted-foreground">✨</div>
							<p className="text-sm text-muted-foreground">All projects are pinned</p>
						</div>
					) : filteredAvailableProjects.length === 0 ? (
						<div className="flex flex-col items-center justify-center py-8 text-center">
							<div className="mb-2 text-3xl text-muted-foreground">🔍</div>
							<p className="text-sm text-muted-foreground">No projects match your search</p>
						</div>
					) : (
						<>
							<div className="space-y-1 max-h-[400px] overflow-y-auto">
								{filteredAvailableProjects.map(project => (
									<AvailableProjectItem
										key={project.id}
										project={project}
										onPin={handlePin}
										isLoading={loadingItems.has(project.id)}
									/>
								))}
							</div>

							<p className="text-xs text-muted-foreground">Click ← to pin</p>
						</>
					)}
				</div>
			</div>
		</CrudDialog>
	);
}
