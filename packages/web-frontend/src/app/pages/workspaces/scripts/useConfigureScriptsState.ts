import { useEffect, useState } from 'react';
import { flushSync } from 'react-dom';

import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { AvailableScript, ScriptProcessWithConfig, WorkspaceScript } from '@shared/api/workspaceScripts.contract';

import { workspaceScriptsApi } from './workspaceScripts.api';

/**
 * ===========================================================================================
 * USE CONFIGURE SCRIPTS STATE HOOK (HEADLESS LOGIC)
 * ===========================================================================================
 *
 * Manages all state and logic for the configure scripts dialog.
 * This is the "logic layer" separated from presentation.
 *
 * Responsibilities:
 * - Optimistic state management (additions, removals, reordering)
 * - API calls with error handling and rollback
 * - Computed state (configured scripts, available scripts, filtered results)
 * - Loading states tracking
 * - Script discovery
 *
 * Benefits:
 * - 100% testable without React rendering
 * - Reusable across different layouts (Dialog, Page, Panel)
 * - Easy to test with controlled promises
 * - Clear separation of concerns
 *
 * Usage:
 *   const scriptsState = useConfigureScriptsState({
 *     workspaceId,
 *     scripts,
 *     isOpen,
 *   });
 *
 *   return <ConfigureScriptsView {...scriptsState} />;
 *
 * ===========================================================================================
 */

export interface EditingScript extends WorkspaceScript {
	isNew?: boolean;
}

export interface UseConfigureScriptsStateProps {
	/** Workspace ID */
	workspaceId: string;
	/** Current scripts from props (server state) */
	scripts: ScriptProcessWithConfig[];
	/** Whether dialog is open (for clearing optimistic state) */
	isOpen: boolean;
	/** Maximum number of scripts allowed */
	maxScripts?: number;
}

export interface UseConfigureScriptsStateReturn {
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
	actions: {
		setSearchQuery: (query: string) => void;
		handleDiscover: () => Promise<void>;
		handleAddScript: (scriptName: string) => Promise<void>;
		handleRemoveScript: (scriptId: string) => Promise<void>;
		handleDragEnd: (activeId: string, overId: string) => Promise<void>;
		getScriptStatus: (scriptId: string) => 'running' | 'stopped' | 'error';
	};
}

const DEFAULT_MAX_SCRIPTS = 10;

export function useConfigureScriptsState({
	workspaceId,
	scripts,
	isOpen,
	maxScripts = DEFAULT_MAX_SCRIPTS,
}: UseConfigureScriptsStateProps): UseConfigureScriptsStateReturn {
	// =========================================================================
	// STATE
	// =========================================================================

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
	const [optimisticOrderMap, setOptimisticOrderMap] = useState<Map<string, number>>(new Map());

	// =========================================================================
	// EFFECTS
	// =========================================================================

	// Clear optimistic state when dialog closes
	useEffect(() => {
		if (!isOpen) {
			setOptimisticAdditions(new Set());
			setOptimisticRemovals(new Set());
			setOptimisticOrderMap(new Map());
			setLoadingItems(new Set());
			setError(null);
		}
	}, [isOpen]);

	// CRITICAL: Clean up optimistic states when WebSocket updates arrive
	// This prevents stale optimistic states from causing "already exists" errors
	useEffect(() => {
		const currentScriptNames = new Set(scripts.map(s => s.script.scriptName));

		// Clean up optimistic additions that have been confirmed by server
		setOptimisticAdditions(prev => {
			const next = new Set(prev);
			let changed = false;
			prev.forEach(name => {
				if (currentScriptNames.has(name)) {
					next.delete(name);
					changed = true;
				}
			});
			return changed ? next : prev;
		});

		// Clean up optimistic removals that have been confirmed by server
		setOptimisticRemovals(prev => {
			const next = new Set(prev);
			let changed = false;
			prev.forEach(name => {
				if (!currentScriptNames.has(name)) {
					next.delete(name);
					changed = true;
				}
			});
			return changed ? next : prev;
		});
	}, [scripts]);

	// =========================================================================
	// COMPUTED STATE
	// =========================================================================

	// Get configured script IDs with optimistic updates
	const baseConfiguredIds = new Set(scripts.map(s => s.script.scriptName));

	// Apply optimistic updates to configured IDs
	const effectiveConfiguredIds = new Set(baseConfiguredIds);
	optimisticAdditions.forEach(name => effectiveConfiguredIds.add(name));
	optimisticRemovals.forEach(name => effectiveConfiguredIds.delete(name));

	// Build configured scripts list from props
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

	// Apply optimistic order during reordering
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

	// =========================================================================
	// ACTIONS
	// =========================================================================

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

	// Handle drag end for reordering
	const handleDragEnd = async (activeId: string, overId: string) => {
		if (activeId === overId) return;

		// Calculate new order
		const oldIndex = configuredScripts.findIndex(s => s.id === activeId);
		const newIndex = configuredScripts.findIndex(s => s.id === overId);

		if (oldIndex === -1 || newIndex === -1) return;

		// Reorder locally
		const reordered = [...configuredScripts];
		const [movedItem] = reordered.splice(oldIndex, 1);
		reordered.splice(newIndex, 0, movedItem);

		// Calculate new orders
		const updatedScripts = reordered.map((s, idx) => ({ ...s, order: idx }));

		// Set optimistic order IMMEDIATELY
		const newOrderMap = new Map<string, number>();
		updatedScripts.forEach(s => newOrderMap.set(s.id, s.order));
		setOptimisticOrderMap(newOrderMap);

		// Mark all as reordering
		const allIds = new Set<string>(configuredScripts.map(s => s.id));
		setReorderingIds(allIds);

		try {
			// Save updated orders sequentially (optimistic locking)
			const scriptsToUpdate = updatedScripts.filter(s => !s.isNew);
			const versionMap = new Map<string, number>();
			scriptsToUpdate.forEach(s => versionMap.set(s.id, s.version));

			for (const script of scriptsToUpdate) {
				const currentVersion = versionMap.get(script.id) || script.version;
				const updated = await workspaceScriptsApi.updateWorkspaceScript(workspaceId, script.id, {
					order: script.order,
					version: currentVersion,
				});
				versionMap.set(updated.id, updated.version);
			}

			// Success: Clear optimistic state
			setOptimisticOrderMap(new Map());
		} catch (err) {
			console.error('Failed to reorder scripts:', err);
			setError(getErrorMessage(err));
			// Rollback
			setOptimisticOrderMap(new Map());
		} finally {
			setReorderingIds(new Set());
		}
	};

	// Handle add script with optimistic UI
	const handleAddScript = async (scriptName: string) => {
		if (configuredScripts.length >= maxScripts) {
			setError(`Maximum ${maxScripts} scripts per workspace`);
			return;
		}

		// CRITICAL: Check if script is being deleted BEFORE checking effectiveConfiguredIds
		// because optimisticRemovals removes the script from effectiveConfiguredIds
		if (loadingItems.has(scriptName) && optimisticRemovals.has(scriptName)) {
			setError(`Script "${scriptName}" is currently being removed. Please wait.`);
			return;
		}

		if (effectiveConfiguredIds.has(scriptName)) {
			setError(`Script "${scriptName}" is already configured`);
			return;
		}

		// 1. Add to optimistic additions immediately (makes item appear in configured list)
		// 2. Set loading state for BOTH available and configured items
		// Use flushSync to ensure state updates are applied immediately
		flushSync(() => {
			setOptimisticAdditions(prev => new Set(prev).add(scriptName));
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.add(scriptName); // For available item
				next.add(`temp-${scriptName}`); // For configured item (temp ID)
				return next;
			});
			setError(null);
		});

		try {
			// 3. API call
			await workspaceScriptsApi.createWorkspaceScript(workspaceId, {
				scriptName,
				enabled: true,
				displayName: scriptName,
				description: '',
				order: configuredScripts.length,
			});

			// 4. Success: Keep optimistic state until WebSocket updates
		} catch (err) {
			// 5. Error: Rollback optimistic addition - USE FLUSH SYNC to prevent race conditions
			console.error('Failed to add script:', err);
			flushSync(() => {
				setOptimisticAdditions(prev => {
					const next = new Set(prev);
					next.delete(scriptName);
					return next;
				});
				setError(getErrorMessage(err));
			});
		} finally {
			// 6. Clear loading states for both IDs - USE FLUSH SYNC to prevent race conditions
			flushSync(() => {
				setLoadingItems(prev => {
					const next = new Set(prev);
					next.delete(scriptName);
					next.delete(`temp-${scriptName}`);
					return next;
				});
			});
		}
	};

	// Handle remove script with optimistic UI
	const handleRemoveScript = async (scriptId: string) => {
		const scriptWithProcess = scripts.find(s => s.script.id === scriptId);
		if (!scriptWithProcess) return;
		const script = scriptWithProcess.script;

		// 1. Set loading state for BOTH IDs (configured item + available item)
		// Use flushSync to ensure state updates are applied immediately
		flushSync(() => {
			setLoadingItems(prev => {
				const next = new Set(prev);
				next.add(scriptId); // For configured item (before optimistic removal)
				next.add(script.scriptName); // For available item (after optimistic removal)
				return next;
			});
			setError(null);

			// 2. Do optimistic removal immediately (item moves to available list)
			setOptimisticRemovals(prev => new Set(prev).add(script.scriptName));
			setOptimisticAdditions(prev => {
				if (prev.has(script.scriptName)) {
					const next = new Set(prev);
					next.delete(script.scriptName);
					return next;
				}
				return prev;
			});
		});

		try {
			// 3. API call
			await workspaceScriptsApi.deleteWorkspaceScript(workspaceId, scriptId);

			// 4. Success: Keep optimistic state until WebSocket updates
		} catch (err) {
			// 5. Error: Rollback optimistic removal - USE FLUSH SYNC to prevent race conditions
			console.error('Failed to remove script:', err);
			flushSync(() => {
				setOptimisticRemovals(prev => {
					const next = new Set(prev);
					next.delete(script.scriptName);
					return next;
				});
				setError(getErrorMessage(err));
			});
		} finally {
			// 6. Clear loading states for both IDs - USE FLUSH SYNC to prevent race conditions
			flushSync(() => {
				setLoadingItems(prev => {
					const next = new Set(prev);
					next.delete(scriptId);
					next.delete(script.scriptName);
					return next;
				});
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

	// =========================================================================
	// RETURN
	// =========================================================================

	return {
		// Computed data
		configuredScripts,
		availableScripts,
		filteredAvailableScripts,
		availableNonConfiguredScripts,

		// State
		searchQuery,
		loadingItems,
		reorderingIds,
		isDiscovering,
		error,
		maxScripts,

		// Actions
		actions: {
			setSearchQuery,
			handleDiscover,
			handleAddScript,
			handleRemoveScript,
			handleDragEnd,
			getScriptStatus,
		},
	};
}
