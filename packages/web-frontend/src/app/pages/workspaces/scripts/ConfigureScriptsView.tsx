import type { ReactNode } from 'react';

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
import { Button } from '@framework/components/primitives/Button';
import { SearchBar } from '@framework/features/search/SearchBar';
import type { AvailableScript } from '@shared/api/workspaceScripts.contract';
import { Loader2, RefreshCw } from 'lucide-react';

import { AvailableScriptItem } from './AvailableScriptItem';
import { SortableConfiguredScriptItem } from './SortableConfiguredScriptItem';
import type { EditingScript } from './useConfigureScriptsState';

/**
 * ===========================================================================================
 * CONFIGURE SCRIPTS VIEW (PURE PRESENTATION)
 * ===========================================================================================
 *
 * Pure presentation component for configure scripts dialog.
 * This is the "view layer" separated from logic.
 *
 * Responsibilities:
 * - Render two-column layout (configured + available)
 * - Integrate DnD context for reordering
 * - Display search, loading states, empty states, errors
 * - Forward user actions to callbacks
 *
 * Does NOT handle:
 * - State management (handled by useConfigureScriptsState)
 * - API calls (handled by hook)
 * - Optimistic updates logic (handled by hook)
 *
 * Benefits:
 * - 100% testable without async logic
 * - No business logic - just display what it's given
 * - Easy to test visual states
 * - Reusable with different state management
 *
 * Usage:
 *   const scriptsState = useConfigureScriptsState({ ... });
 *   return <ConfigureScriptsView {...scriptsState} />;
 *
 * ===========================================================================================
 */

export interface ConfigureScriptsViewProps {
	// Computed data
	configuredScripts: EditingScript[];
	availableScripts: AvailableScript[];
	filteredAvailableScripts: AvailableScript[];
	availableNonConfiguredScripts: AvailableScript[];

	// State
	searchQuery: string;
	loadingItems: Set<string>;
	reorderingIds: Set<string>;
	isDiscovering: boolean;
	error: string | null;
	maxScripts: number;

	// Actions
	onSearchChange: (query: string) => void;
	onDiscover: () => void;
	onAddScript: (scriptName: string) => void;
	onRemoveScript: (scriptId: string) => void;
	onDragEnd: (activeId: string, overId: string) => void;
	getScriptStatus: (scriptId: string) => 'running' | 'stopped' | 'error';

	// Optional customization
	leftEmptyState?: ReactNode;
	rightEmptyState?: ReactNode;
	rightEmptyStateNoResults?: ReactNode;
	rightEmptyStateAllConfigured?: ReactNode;
}

export function ConfigureScriptsView({
	configuredScripts,
	availableScripts,
	filteredAvailableScripts,
	availableNonConfiguredScripts,
	searchQuery,
	loadingItems,
	reorderingIds,
	isDiscovering,
	error,
	maxScripts,
	onSearchChange,
	onDiscover,
	onAddScript,
	onRemoveScript,
	onDragEnd,
	getScriptStatus,
	leftEmptyState,
	rightEmptyState,
	rightEmptyStateNoResults,
	rightEmptyStateAllConfigured,
}: ConfigureScriptsViewProps) {
	// Configure drag & drop sensors
	const sensors = useSensors(
		useSensor(PointerSensor, {
			activationConstraint: {
				distance: 8,
			},
		}),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		})
	);

	// Handle drag end
	const handleDragEnd = (event: DragEndEvent) => {
		const { active, over } = event;
		if (!over || active.id === over.id) return;
		onDragEnd(String(active.id), String(over.id));
	};

	return (
		<div className="grid grid-cols-2 gap-6 p-6">
			{/* Left Column: Configured Scripts */}
			<div className="space-y-4">
				<div>
					<h3 className="text-sm font-semibold">
						Configured Scripts ({configuredScripts.length}/{maxScripts})
					</h3>
					<p className="text-xs text-muted-foreground">Drag to reorder, click → to remove</p>
				</div>

				{configuredScripts.length === 0 ? (
					leftEmptyState || (
						<div className="flex flex-col items-center justify-center py-8 text-center">
							<p className="text-sm text-muted-foreground">No scripts configured</p>
							<p className="text-xs text-muted-foreground">Add scripts from the right panel</p>
						</div>
					)
				) : (
					<DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
						<SortableContext
							items={configuredScripts.map(s => s.id)}
							strategy={verticalListSortingStrategy}
						>
							<div className="space-y-1">
								{configuredScripts.map(script => (
									<SortableConfiguredScriptItem
										key={script.id}
										script={script}
										onRemove={onRemoveScript}
										isLoading={loadingItems.has(script.id)}
										isReordering={reorderingIds.has(script.id)}
										status={getScriptStatus(script.id)}
									/>
								))}
							</div>
						</SortableContext>
					</DndContext>
				)}

				{/* Error Display */}
				{error && (
					<div className="rounded border border-destructive bg-destructive/10 p-3">
						<p className="text-sm text-destructive">{error}</p>
					</div>
				)}
			</div>

			{/* Right Column: Available Scripts */}
			<div className="space-y-4">
				<div>
					<div className="flex items-center justify-between">
						<h3 className="text-sm font-semibold">Available Scripts</h3>
						<Button variant="outline" size="sm" onClick={onDiscover} disabled={isDiscovering}>
							<RefreshCw className={`mr-1 size-3 ${isDiscovering ? 'animate-spin' : ''}`} />
							Discover
						</Button>
					</div>
					<p className="text-xs text-muted-foreground">Click ← to add</p>
				</div>

				{/* Search Bar */}
				<SearchBar
					value={searchQuery}
					onChange={onSearchChange}
					onClear={() => onSearchChange('')}
					placeholder="Search scripts..."
					label=""
					className="mb-2"
				/>

				{availableScripts.length === 0 ? (
					rightEmptyState || (
						<div className="flex flex-col items-center justify-center py-8 text-center">
							{isDiscovering ? (
								<>
									<Loader2 className="mb-2 size-8 animate-spin text-muted-foreground" />
									<p className="text-sm text-muted-foreground">Discovering scripts...</p>
								</>
							) : (
								<>
									<p className="text-sm text-muted-foreground">Click "Discover" to find scripts</p>
									<p className="text-xs text-muted-foreground">from package.json</p>
								</>
							)}
						</div>
					)
				) : availableNonConfiguredScripts.length === 0 ? (
					rightEmptyStateAllConfigured || (
						<div className="flex flex-col items-center justify-center py-8 text-center">
							<p className="text-sm text-muted-foreground">All scripts are configured</p>
						</div>
					)
				) : filteredAvailableScripts.length === 0 ? (
					rightEmptyStateNoResults || (
						<div className="flex flex-col items-center justify-center py-8 text-center">
							<p className="text-sm text-muted-foreground">No scripts match your search</p>
						</div>
					)
				) : (
					<div className="max-h-[400px] space-y-1 overflow-y-auto">
						{filteredAvailableScripts.map(script => (
							<AvailableScriptItem
								key={script.name}
								script={script}
								onAdd={onAddScript}
								isLoading={loadingItems.has(script.name)}
							/>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
