import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { QueryFiller } from '@framework/types/FeatureContract';
import type { TaskPriority, TaskStatus } from '@shared/api/tasks.contract';

/**
 * ===========================================================================================
 * USE TASK FILTERS - Domain-Specific Filters Hook
 * ===========================================================================================
 *
 * Manages task-specific filters (status, priority, workerId, flowId) using URL parameters.
 * This is separate from the generic search feature (useSimpleSearch).
 *
 * Key features:
 * - Uses URL parameters for persistence (shareable filter URLs)
 * - Domain-specific filters for tasks
 * - Integrates with Data2 architecture
 * - Triggers pagination reset when filters change
 *
 * Example usage:
 * ```typescript
 * const filters = useTaskFilters({
 *   onFilterChange: () => pagination.actions.resetPage()
 * });
 *
 * // Access state
 * console.log(filters.fstate.status); // 'in_progress' or undefined
 * console.log(filters.fstate.hasFilters); // true if any filter is set
 *
 * // Call actions
 * filters.actions.setStatus('in_progress');
 * filters.actions.clearFilters();
 * ```
 *
 * ===========================================================================================
 */

export interface UseTaskFiltersOptions {
	/**
	 * Callback invoked when any filter changes.
	 * Useful for resetting pagination when user changes filters.
	 */
	onFilterChange?: () => void;
}

export interface TaskFiltersState {
	status?: TaskStatus;
	priority?: TaskPriority;
	workerId?: string;
	flowId?: string;
	hasFilters: boolean;
}

export interface TaskFiltersContract {
	fstate: TaskFiltersState;
	actions: {
		setStatus: (status?: TaskStatus) => void;
		setPriority: (priority?: TaskPriority) => void;
		setWorkerId: (workerId?: string) => void;
		setFlowId: (flowId?: string) => void;
		clearFilters: () => void;
	};
	fillQuery: QueryFiller;
}

/**
 * Headless hook for managing task-specific filters.
 * Uses URL parameters for persistence and provides actions for updates.
 *
 * @param options - Configuration options
 * @returns TaskFiltersContract with fstate and actions
 */
export function useTaskFilters(options?: UseTaskFiltersOptions): TaskFiltersContract {
	const [searchParams, setSearchParams] = useSearchParams();

	// Read filter values from URL parameters
	const status = (searchParams.get('status') as TaskStatus) || undefined;
	const priority = (searchParams.get('priority') as TaskPriority) || undefined;
	const urlWorkerId = searchParams.get('workerId') || '';
	const urlFlowId = searchParams.get('flowId') || '';

	// Local state for UI (what user actually typed, without trimming)
	// Initialize from URL, but stays independent after that
	const [localWorkerId, setLocalWorkerId] = useState(urlWorkerId);
	const [localFlowId, setLocalFlowId] = useState(urlFlowId);

	// Sync local state with URL when URL changes externally (e.g., browser back/forward)
	useMemo(() => {
		setLocalWorkerId(urlWorkerId);
	}, [urlWorkerId]);

	useMemo(() => {
		setLocalFlowId(urlFlowId);
	}, [urlFlowId]);

	// Frozen state
	const fstate = useMemo<TaskFiltersState>(
		() => ({
			status,
			priority,
			workerId: localWorkerId || undefined,
			flowId: localFlowId || undefined,
			hasFilters: !!(status || priority || localWorkerId.trim() || localFlowId.trim()),
		}),
		[status, priority, localWorkerId, localFlowId]
	);

	// Actions
	const onFilterChange = options?.onFilterChange;

	const actions = useMemo(
		() => ({
			/**
			 * Set status filter
			 */
			setStatus: (newStatus?: TaskStatus) => {
				setSearchParams(
					prev => {
						const params = new URLSearchParams(prev);
						if (newStatus) {
							params.set('status', newStatus);
						} else {
							params.delete('status');
						}
						return params;
					},
					{ replace: true }
				);
				onFilterChange?.();
			},

			/**
			 * Set priority filter
			 */
			setPriority: (newPriority?: TaskPriority) => {
				setSearchParams(
					prev => {
						const params = new URLSearchParams(prev);
						if (newPriority) {
							params.set('priority', newPriority);
						} else {
							params.delete('priority');
						}
						return params;
					},
					{ replace: true }
				);
				onFilterChange?.();
			},

			/**
			 * Set workerId filter
			 * UI shows exactly what user typed (local state, no trim).
			 * URL stores trimmed version (prevents unnecessary requests on whitespace).
			 */
			setWorkerId: (newWorkerId?: string) => {
				const value = newWorkerId || '';

				// Update local UI state immediately (no trim)
				setLocalWorkerId(value);

				// Update URL with trimmed version
				setSearchParams(
					prev => {
						const params = new URLSearchParams(prev);
						const trimmed = value.trim();
						if (trimmed) {
							params.set('workerId', trimmed);
						} else {
							params.delete('workerId');
						}
						return params;
					},
					{ replace: true }
				);
				onFilterChange?.();
			},

			/**
			 * Set flowId filter
			 * UI shows exactly what user typed (local state, no trim).
			 * URL stores trimmed version (prevents unnecessary requests on whitespace).
			 */
			setFlowId: (newFlowId?: string) => {
				const value = newFlowId || '';

				// Update local UI state immediately (no trim)
				setLocalFlowId(value);

				// Update URL with trimmed version
				setSearchParams(
					prev => {
						const params = new URLSearchParams(prev);
						const trimmed = value.trim();
						if (trimmed) {
							params.set('flowId', trimmed);
						} else {
							params.delete('flowId');
						}
						return params;
					},
					{ replace: true }
				);
				onFilterChange?.();
			},

			/**
			 * Clear all filters
			 */
			clearFilters: () => {
				// Clear local states
				setLocalWorkerId('');
				setLocalFlowId('');

				// Clear URL params
				setSearchParams(
					prev => {
						const params = new URLSearchParams(prev);
						params.delete('status');
						params.delete('priority');
						params.delete('workerId');
						params.delete('flowId');
						return params;
					},
					{ replace: true }
				);
				onFilterChange?.();
			},
		}),
		[setSearchParams, onFilterChange, setLocalWorkerId, setLocalFlowId]
	);

	// Fill query function for Data2 integration
	const fillQuery = useCallback<QueryFiller>(
		query => {
			if (status) query.status = status;
			if (priority) query.priority = priority;

			// Only send trimmed values to backend
			const trimmedWorkerId = localWorkerId.trim();
			const trimmedFlowId = localFlowId.trim();

			if (trimmedWorkerId) query.workerId = trimmedWorkerId;
			if (trimmedFlowId) query.flowId = trimmedFlowId;
		},
		[status, priority, localWorkerId, localFlowId]
	);

	return {
		fstate,
		actions,
		fillQuery,
	};
}
