import { useCallback, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { QueryFiller } from '@framework/types/FeatureContract';
import type { InterventionStatus, InterventionType } from '@shared/api/interventions.contract';

/**
 * ===========================================================================================
 * USE INTERVENTION FILTERS - Domain-Specific Filters Hook
 * ===========================================================================================
 *
 * Manages intervention-specific filters (status, type, blocking, taskId) using URL parameters.
 * This is separate from the generic search feature (useSimpleSearch).
 *
 * Key features:
 * - Uses URL parameters for persistence (shareable filter URLs)
 * - Domain-specific filters for interventions
 * - Integrates with Data2 architecture
 * - Triggers pagination reset when filters change
 *
 * Example usage:
 * ```typescript
 * const filters = useInterventionFilters({
 *   onFilterChange: () => pagination.actions.resetPage()
 * });
 *
 * // Access state
 * console.log(filters.fstate.status); // 'pending' or undefined
 * console.log(filters.fstate.hasFilters); // true if any filter is set
 *
 * // Call actions
 * filters.actions.setStatus('pending');
 * filters.actions.clearFilters();
 * ```
 *
 * ===========================================================================================
 */

export interface UseInterventionFiltersOptions {
	/**
	 * Callback invoked when any filter changes.
	 * Useful for resetting pagination when user changes filters.
	 */
	onFilterChange?: () => void;
}

export interface InterventionFiltersState {
	status?: InterventionStatus;
	type?: InterventionType;
	blocking?: boolean;
	taskId?: string;
	hasFilters: boolean;
}

export interface InterventionFiltersContract {
	fstate: InterventionFiltersState;
	actions: {
		setStatus: (status?: InterventionStatus) => void;
		setType: (type?: InterventionType) => void;
		setBlocking: (blocking?: boolean) => void;
		setTaskId: (taskId?: string) => void;
		clearFilters: () => void;
	};
	fillQuery: QueryFiller;
}

/**
 * Headless hook for managing intervention-specific filters.
 * Uses URL parameters for persistence and provides actions for updates.
 *
 * @param options - Configuration options
 * @returns InterventionFiltersContract with fstate and actions
 */
export function useInterventionFilters(options?: UseInterventionFiltersOptions): InterventionFiltersContract {
	const [searchParams, setSearchParams] = useSearchParams();

	// Read filter values from URL parameters
	const status = (searchParams.get('status') as InterventionStatus) || undefined;
	const type = (searchParams.get('type') as InterventionType) || undefined;
	const blockingParam = searchParams.get('blocking');
	const blocking = blockingParam === 'true' ? true : blockingParam === 'false' ? false : undefined;
	const urlTaskId = searchParams.get('taskId') || '';

	// Local state for UI (what user actually typed, without trimming)
	// Initialize from URL, but stays independent after that
	const [localTaskId, setLocalTaskId] = useState(urlTaskId);

	// Sync local state with URL when URL changes externally (e.g., browser back/forward)
	useMemo(() => {
		setLocalTaskId(urlTaskId);
	}, [urlTaskId]);

	// Frozen state
	const fstate = useMemo<InterventionFiltersState>(
		() => ({
			status,
			type,
			blocking,
			taskId: localTaskId || undefined,
			hasFilters: !!(status || type || blocking !== undefined || localTaskId.trim()),
		}),
		[status, type, blocking, localTaskId]
	);

	// Actions
	const onFilterChange = options?.onFilterChange;

	const actions = useMemo(
		() => ({
			/**
			 * Set status filter
			 */
			setStatus: (newStatus?: InterventionStatus) => {
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
			 * Set type filter
			 */
			setType: (newType?: InterventionType) => {
				setSearchParams(
					prev => {
						const params = new URLSearchParams(prev);
						if (newType) {
							params.set('type', newType);
						} else {
							params.delete('type');
						}
						return params;
					},
					{ replace: true }
				);
				onFilterChange?.();
			},

			/**
			 * Set blocking filter
			 */
			setBlocking: (newBlocking?: boolean) => {
				setSearchParams(
					prev => {
						const params = new URLSearchParams(prev);
						if (newBlocking !== undefined) {
							params.set('blocking', String(newBlocking));
						} else {
							params.delete('blocking');
						}
						return params;
					},
					{ replace: true }
				);
				onFilterChange?.();
			},

			/**
			 * Set taskId filter
			 * UI shows exactly what user typed (local state, no trim).
			 * URL stores trimmed version (prevents unnecessary requests on whitespace).
			 */
			setTaskId: (newTaskId?: string) => {
				const value = newTaskId || '';

				// Update local UI state immediately (no trim)
				setLocalTaskId(value);

				// Update URL with trimmed version
				setSearchParams(
					prev => {
						const params = new URLSearchParams(prev);
						const trimmed = value.trim();
						if (trimmed) {
							params.set('taskId', trimmed);
						} else {
							params.delete('taskId');
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
				setLocalTaskId('');

				// Clear URL params
				setSearchParams(
					prev => {
						const params = new URLSearchParams(prev);
						params.delete('status');
						params.delete('type');
						params.delete('blocking');
						params.delete('taskId');
						return params;
					},
					{ replace: true }
				);
				onFilterChange?.();
			},
		}),
		[setSearchParams, onFilterChange, setLocalTaskId]
	);

	// Fill query function for Data2 integration
	const fillQuery = useCallback<QueryFiller>(
		query => {
			if (status) query.status = status;
			if (type) query.type = type;
			if (blocking !== undefined) query.blocking = blocking;

			// Only send trimmed values to backend
			const trimmedTaskId = localTaskId.trim();
			if (trimmedTaskId) query.taskId = trimmedTaskId;
		},
		[status, type, blocking, localTaskId]
	);

	return {
		fstate,
		actions,
		fillQuery,
	};
}
