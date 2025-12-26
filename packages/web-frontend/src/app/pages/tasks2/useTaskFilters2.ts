import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import type { TaskPriority, TaskStatus } from '@shared/api/tasks.contract';

/**
 * ===========================================================================================
 * USE TASK FILTERS2 - Domain-Specific Filters Hook
 * ===========================================================================================
 *
 * Manages task-specific filters (status, priority, workerId) using URL parameters.
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
 * const filters = useTaskFilters2({
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

export interface UseTaskFilters2Options {
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
	hasFilters: boolean;
}

export interface TaskFiltersContract {
	fstate: TaskFiltersState;
	actions: {
		setStatus: (status?: TaskStatus) => void;
		setPriority: (priority?: TaskPriority) => void;
		setWorkerId: (workerId?: string) => void;
		clearFilters: () => void;
	};
}

/**
 * Headless hook for managing task-specific filters.
 * Uses URL parameters for persistence and provides actions for updates.
 *
 * @param options - Configuration options
 * @returns TaskFiltersContract with fstate and actions
 */
export function useTaskFilters2(options?: UseTaskFilters2Options): TaskFiltersContract {
	const [searchParams, setSearchParams] = useSearchParams();

	// Read filter values from URL parameters
	const status = (searchParams.get('status') as TaskStatus) || undefined;
	const priority = (searchParams.get('priority') as TaskPriority) || undefined;
	const workerId = searchParams.get('workerId') || undefined;

	// Frozen state
	const fstate = useMemo<TaskFiltersState>(
		() => ({
			status,
			priority,
			workerId,
			hasFilters: !!(status || priority || workerId),
		}),
		[status, priority, workerId]
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
			 */
			setWorkerId: (newWorkerId?: string) => {
				setSearchParams(
					prev => {
						const params = new URLSearchParams(prev);
						const trimmed = newWorkerId?.trim();
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
			 * Clear all filters
			 */
			clearFilters: () => {
				setSearchParams(
					prev => {
						const params = new URLSearchParams(prev);
						params.delete('status');
						params.delete('priority');
						params.delete('workerId');
						return params;
					},
					{ replace: true }
				);
				onFilterChange?.();
			},
		}),
		[setSearchParams, onFilterChange]
	);

	return {
		fstate,
		actions,
	};
}
