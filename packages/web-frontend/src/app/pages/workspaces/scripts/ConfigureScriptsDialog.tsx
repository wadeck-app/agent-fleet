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
import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import { Button } from '@framework/components/primitives/Button';
import { SearchBar } from '@framework/features/search/SearchBar';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { AvailableScript, ScriptProcessWithConfig, WorkspaceScript } from '@shared/api/workspaceScripts.contract';
import { Loader2, RefreshCw } from 'lucide-react';

import { AvailableScriptItem } from './AvailableScriptItem';
import { SortableConfiguredScriptItem } from './SortableConfiguredScriptItem';
import { workspaceScriptsApi } from './workspaceScripts.api';

/**
 * ===========================================================================================
 * CONFIGURE SCRIPTS DIALOG COMPONENT
 * ===========================================================================================
 *
 * Dialog for managing workspace scripts with drag & drop reordering.
 *
 * Features:
 * - Two-column layout: Configured (left) and Available (right) scripts
 * - Drag & drop to reorder configured scripts
 * - Arrow buttons (→ to remove, ← to add)
 * - Search functionality in available scripts
 * - Auto-save: changes persist immediately to the server
 * - Loading states during API calls
 * - Toast notifications for errors only
 *
 * Layout:
 * - Left column: Configured scripts with drag handles
 * - Right column: Available scripts with search
 *
 * Usage:
 *   <ConfigureScriptsDialog
 *     workspaceId={workspaceId}
 *     open={isOpen}
 *     onClose={handleClose}
 *     scripts={scripts}
 *   />
 *
 * ===========================================================================================
 */

interface ConfigureScriptsDialogProps {
	workspaceId: string;
	open: boolean;
	onClose: () => void;
	scripts: ScriptProcessWithConfig[];
}

interface EditingScript extends WorkspaceScript {
	isNew?: boolean;
}

const MAX_SCRIPTS = 10;

export function ConfigureScriptsDialog({ workspaceId, open, onClose, scripts }: ConfigureScriptsDialogProps) {
	const [availableScripts, setAvailableScripts] = useState<AvailableScript[]>([]);
	const [isDiscovering, setIsDiscovering] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [searchQuery, setSearchQuery] = useState('');
	const [loadingItems, setLoadingItems] = useState<Set<string>>(new Set());
	const [reorderingIds, setReorderingIds] = useState<Set<string>>(new Set());

	// Optimistic UI: Track pending additions/removals
	const [optimisticAdditions, setOptimisticAdditions] = useState<Set<string>>(new Set());
	const [optimisticRemovals, setOptimisticRemovals] = useState<Set<string>>(new Set());

	// Optimistic UI: Track reordering state (scriptId => new order)
	// This overrides props order during drag operations to prevent WebSocket events from resetting the UI
	const [optimisticOrderMap, setOptimisticOrderMap] = useState<Map<string, number>>(new Map());

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

	// Clear optimistic state when dialog closes
	useEffect(() => {
		if (!open) {
			setOptimisticAdditions(new Set());
			setOptimisticRemovals(new Set());
			setOptimisticOrderMap(new Map());
			setLoadingItems(new Set());
			setError(null);
		}
	}, [open]);

	// Discover available scripts from package.json
	const handleDiscover = async () => {
		try {
			setIsDiscovering(true);
			setError(null);
			const discovered = await workspaceScriptsApi.discoverAvailableScripts(workspaceId);
			setAvailableScripts(discovered);
		} catch (err) {
			setError(getErrorMessage(err));
		} finally {
			setIsDiscovering(false);
		}
	};

	// Get configured script IDs with optimistic updates (directly from props)
	// Hierarchy: User intent (optimistic) > Server state
	const baseConfiguredIds = new Set(scripts.map(s => s.script.scriptName));

	// Apply optimistic updates to configured IDs
	const effectiveConfiguredIds = new Set(baseConfiguredIds);
	optimisticAdditions.forEach(name => effectiveConfiguredIds.add(name));
	optimisticRemovals.forEach(name => effectiveConfiguredIds.delete(name));

	// Build configured scripts list from props (not from local state!)
	const configuredScripts: EditingScript[] = scripts
		.filter(s => !optimisticRemovals.has(s.script.scriptName))
		.map(s => ({ ...s.script }));

	// Add optimistic additions as temporary scripts
	optimisticAdditions.forEach(scriptName => {
		if (!scripts.some(s => s.script.scriptName === scriptName)) {
			configuredScripts.push({
				id: `temp-${scriptName}`,
				workspaceId,
				scriptName,
				enabled: true,
				displayName: scriptName,
				description: '',
				url: '',
				order: configuredScripts.length,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString(),
				version: 1,
				isNew: true,
			});
		}
	});

	// Apply optimistic order during reordering (overrides server state)
	// This prevents WebSocket events from resetting the UI during drag operations
	if (optimisticOrderMap.size > 0) {
		configuredScripts.forEach(script => {
			const optimisticOrder = optimisticOrderMap.get(script.id);
			if (optimisticOrder !== undefined) {
				script.order = optimisticOrder;
			}
		});
	}

	// Sort by order (respecting optimistic updates)
	configuredScripts.sort((a, b) => a.order - b.order);

	// Get available (non-configured) scripts
	const availableNonConfiguredScripts = availableScripts.filter(s => !effectiveConfiguredIds.has(s.name));

	// Filter available scripts by search query
	const filteredAvailableScripts = availableNonConfiguredScripts.filter(script => {
		const query = searchQuery.toLowerCase();
		return script.name.toLowerCase().includes(query) || script.command.toLowerCase().includes(query);
	});

	// Handle drag end for reordering
	const handleDragEnd = async (event: DragEndEvent) => {
		const { active, over } = event;

		if (!over || active.id === over.id) {
			return;
		}

		const activeId = active.id as string;
		const overId = over.id as string;

		// Calculate new order
		const oldIndex = configuredScripts.findIndex(s => s.id === activeId);
		const newIndex = configuredScripts.findIndex(s => s.id === overId);

		if (oldIndex === -1 || newIndex === -1) {
			return;
		}

		// Reorder locally (for API call calculation)
		const reordered = [...configuredScripts];
		const [movedItem] = reordered.splice(oldIndex, 1);
		reordered.splice(newIndex, 0, movedItem);

		// Calculate new orders for all scripts
		const updatedScripts = reordered.map((s, idx) => ({ ...s, order: idx }));

		// Set optimistic order IMMEDIATELY (before API calls)
		// This keeps the desired order visible during API calls and prevents WebSocket events from resetting it
		const newOrderMap = new Map<string, number>();
		updatedScripts.forEach(s => newOrderMap.set(s.id, s.order));
		setOptimisticOrderMap(newOrderMap);

		// Mark all as reordering (visual feedback - opacity)
		const allIds = new Set<string>(configuredScripts.map(s => s.id));
		setReorderingIds(allIds);

		try {
			// Save updated orders to server SEQUENTIALLY
			// We can't use Promise.all because of optimistic locking (version conflicts)
			// Each update increments the version, so we must:
			// 1. Update one script
			// 2. Get the updated version from response
			// 3. Use that version for the next update
			const scriptsToUpdate = updatedScripts.filter(s => !s.isNew);

			// Track updated versions to use for subsequent updates
			const versionMap = new Map<string, number>();
			scriptsToUpdate.forEach(s => versionMap.set(s.id, s.version));

			for (const script of scriptsToUpdate) {
				const currentVersion = versionMap.get(script.id) || script.version;
				const updated = await workspaceScriptsApi.updateWorkspaceScript(workspaceId, script.id, {
					order: script.order,
					version: currentVersion,
				});
				// Store the new version for potential next update
				versionMap.set(updated.id, updated.version);
			}

			// Success: WebSocket will update props with new order
			// Clear optimistic state now that server has confirmed
			setOptimisticOrderMap(new Map());
		} catch (err) {
			console.error('Failed to reorder scripts:', err);
			setError(getErrorMessage(err));
			// On error, also clear optimistic state (rollback)
			setOptimisticOrderMap(new Map());
		} finally {
			setReorderingIds(new Set());
		}
	};

	// Handle add script with optimistic UI
	const handleAddScript = async (scriptName: string) => {
		if (configuredScripts.length >= MAX_SCRIPTS) {
			setError(`Maximum ${MAX_SCRIPTS} scripts per workspace`);
			return;
		}

		// Check if already added
		if (effectiveConfiguredIds.has(scriptName)) {
			setError(`Script "${scriptName}" is already configured`);
			return;
		}

		// 1. Optimistic update: Add immediately
		setOptimisticAdditions(prev => new Set(prev).add(scriptName));
		setOptimisticRemovals(prev => {
			if (prev.has(scriptName)) {
				const next = new Set(prev);
				next.delete(scriptName);
				return next;
			}
			return prev;
		});
		setLoadingItems(prev => new Set(prev).add(scriptName));
		setError(null);

		try {
			// 2. API call to persist
			await workspaceScriptsApi.createWorkspaceScript(workspaceId, {
				scriptName,
				enabled: true,
				displayName: scriptName,
				description: '',
				order: configuredScripts.length,
			});

			// 3. Success: DON'T call onRefresh()!
			//    Keep optimistic state until WebSocket event updates props or dialog closes
		} catch (err) {
			// 4. Error: Rollback optimistic update
			console.error('Failed to add script:', err);
			setOptimisticAdditions(prev => {
				const next = new Set(prev);
				next.delete(scriptName);
				return next;
			});
			setError(getErrorMessage(err));
		} finally {
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(scriptName);
				return next;
			});
		}
	};

	// Handle remove script with optimistic UI
	const handleRemoveScript = async (scriptId: string) => {
		const scriptWithProcess = scripts.find(s => s.script.id === scriptId);
		if (!scriptWithProcess) return;
		const script = scriptWithProcess.script;

		// 1. Optimistic update: Remove immediately
		setOptimisticRemovals(prev => new Set(prev).add(script.scriptName));
		setOptimisticAdditions(prev => {
			if (prev.has(script.scriptName)) {
				const next = new Set(prev);
				next.delete(script.scriptName);
				return next;
			}
			return prev;
		});
		setLoadingItems(prev => new Set(prev).add(scriptId));
		setError(null);

		try {
			// 2. API call to persist
			await workspaceScriptsApi.deleteWorkspaceScript(workspaceId, scriptId);

			// 3. Success: DON'T call onRefresh()!
			//    Keep optimistic state until WebSocket event updates props or dialog closes
		} catch (err) {
			// 4. Error: Rollback optimistic update
			console.error('Failed to remove script:', err);
			setOptimisticRemovals(prev => {
				const next = new Set(prev);
				next.delete(script.scriptName);
				return next;
			});
			setError(getErrorMessage(err));
		} finally {
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.delete(scriptId);
				return next;
			});
		}
	};

	// Helper to get script status
	const getScriptStatus = (scriptId: string): 'running' | 'stopped' | 'error' => {
		const scriptWithProcess = scripts.find(s => s.script.id === scriptId);
		if (!scriptWithProcess?.process) return 'stopped';

		const status = scriptWithProcess.process.status;
		if (status === 'running' || status === 'starting') return 'running';
		if (status === 'error' || status === 'crashed') return 'error';
		return 'stopped';
	};

	return (
		<CrudDialog open={open} onOpenChange={onClose} title="Configure Scripts" maxWidth="4xl" showCloseButton={true}>
			<div className="grid grid-cols-2 gap-6 p-6">
				{/* Left Column: Configured Scripts */}
				<div className="space-y-4">
					<div className="border-b pb-2">
						<h3 className="text-sm font-semibold">
							Configured Scripts ({configuredScripts.length}/{MAX_SCRIPTS})
						</h3>
					</div>

					{configuredScripts.length === 0 ? (
						<div
							className={`
        flex flex-col items-center justify-center py-8 text-center
      `}
						>
							<div className="mb-2 text-3xl text-muted-foreground">📜</div>
							<p className="text-sm text-muted-foreground">No scripts configured</p>
							<p className="text-xs text-muted-foreground">Add scripts from the right panel</p>
						</div>
					) : (
						<>
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
												onRemove={handleRemoveScript}
												isLoading={loadingItems.has(script.id)}
												isReordering={reorderingIds.has(script.id)}
												status={getScriptStatus(script.id)}
											/>
										))}
									</div>
								</SortableContext>
							</DndContext>

							<p className="text-xs text-muted-foreground">Drag to reorder, click → to remove</p>
						</>
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
					<div className="flex items-center justify-between border-b pb-2">
						<h3 className="text-sm font-semibold">Available Scripts</h3>
						<Button variant="outline" size="sm" onClick={handleDiscover} disabled={isDiscovering}>
							<RefreshCw
								className={`
          mr-1 size-3
          ${isDiscovering ? 'animate-spin' : ''}
        `}
							/>
							Discover
						</Button>
					</div>

					{/* Search Bar */}
					<SearchBar
						value={searchQuery}
						onChange={setSearchQuery}
						onClear={() => setSearchQuery('')}
						placeholder="Search scripts..."
						label=""
						className="mb-2"
					/>

					{availableScripts.length === 0 ? (
						<div
							className={`
        flex flex-col items-center justify-center py-8 text-center
      `}
						>
							{isDiscovering ? (
								<>
									<Loader2 className="mb-2 size-8 animate-spin text-muted-foreground" />
									<p className="text-sm text-muted-foreground">Discovering scripts...</p>
								</>
							) : (
								<>
									<div className="mb-2 text-3xl text-muted-foreground">🔍</div>
									<p className="text-sm text-muted-foreground">Click "Discover" to find scripts</p>
									<p className="text-xs text-muted-foreground">from package.json</p>
								</>
							)}
						</div>
					) : availableNonConfiguredScripts.length === 0 ? (
						<div
							className={`
        flex flex-col items-center justify-center py-8 text-center
      `}
						>
							<div className="mb-2 text-3xl text-muted-foreground">✨</div>
							<p className="text-sm text-muted-foreground">All scripts are configured</p>
						</div>
					) : filteredAvailableScripts.length === 0 ? (
						<div
							className={`
        flex flex-col items-center justify-center py-8 text-center
      `}
						>
							<div className="mb-2 text-3xl text-muted-foreground">🔍</div>
							<p className="text-sm text-muted-foreground">No scripts match your search</p>
						</div>
					) : (
						<>
							<div className="max-h-[400px] space-y-1 overflow-y-auto">
								{filteredAvailableScripts.map(script => (
									<AvailableScriptItem
										key={script.name}
										script={script}
										onAdd={handleAddScript}
										isLoading={loadingItems.has(script.name)}
										isAdded={effectiveConfiguredIds.has(script.name)}
									/>
								))}
							</div>

							<p className="text-xs text-muted-foreground">Click ← to add</p>
						</>
					)}
				</div>
			</div>
		</CrudDialog>
	);
}
