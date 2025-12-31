import { useCallback } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { Input } from '@framework/components/forms/Input';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Button } from '@framework/components/primitives/Button';
import { useCacheControl2 } from '@framework/hooks2/useCacheControl2';
import { useDebounce } from '@framework/hooks2/useDebounce';
import { usePagination2 } from '@framework/hooks2/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/useSorting2';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import { B2F_TASK_CREATED, B2F_TASK_DELETED, B2F_TASK_UPDATED } from '@shared/transport';
import { RefreshCw, X } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { tasksApi } from '../tasks/tasks.api';
import { TaskFilters2 } from './TaskFilters2';
import { TasksTable2 } from './TasksTable2';
import { useTaskFilters2 } from './useTaskFilters2';

const STORAGE_ID = 'tasks2' as const;

/**
 * ===========================================================================================
 * TASKS2 PAGE - Data2 Architecture with Hybrid Filtering
 * ===========================================================================================
 *
 * Modern tasks page using headless composable architecture:
 * - Pagination (usePagination2)
 * - Sorting (useSorting2)
 * - Search (useSimpleSearch) - omnisearch across all fields
 * - Domain Filters (useTaskFilters2) - status, priority, workerId
 * - Cache control (useCacheControl2)
 * - Data2 orchestration
 * - Table2 display
 *
 * Hybrid approach:
 * - Generic search (useSimpleSearch) for text-based queries
 * - Domain filters (useTaskFilters2) for structured filtering
 * - Both integrate seamlessly with Data2 architecture
 *
 * ===========================================================================================
 */
export function TasksPage2() {
	// Headless features
	const pagination = usePagination2({
		pageSize: 10,
		storageId: STORAGE_ID,
		initialPage: 1,
	});

	const sorting = useSorting2({
		storageId: STORAGE_ID,
		defaultSort: [{ key: 'createdAt', direction: 'desc' }],
	});

	const search = useSimpleSearch({
		onSearchChange: () => {
			// Reset to first page when search changes
			pagination.actions.resetPage();
		},
	});

	const cache = useCacheControl2({ enabled: true });

	// Subscribe to real-time task events
	// Refresh list when tasks are created, updated, or deleted
	useRealtimeRefresh({
		events: [B2F_TASK_CREATED, B2F_TASK_UPDATED, B2F_TASK_DELETED],
		onEvent: cache.actions.refresh,
		logPrefix: 'TasksPage2',
	});

	// Domain-specific filters (tasks-specific)
	const filters = useTaskFilters2({
		onFilterChange: () => {
			// Reset to first page when filters change
			pagination.actions.resetPage();
		},
	});

	// Debounce search query
	const debouncedSearchQuery = useDebounce(search.fstate.query, 300);

	// Fetch function - query includes all features composed by Data2
	const fetchTasks = useCallback(async (query: ComposedQuery) => {
		const response = await tasksApi.getTasksList({
			page: query.page,
			pageSize: query.pageSize,
			sortBy: query.sortBy,
			sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
			search: query.search,
			status: query.status as any,
			priority: query.priority as any,
			workerId: query.workerId as string | undefined,
		});

		return {
			items: response.items,
			pagination: response.pagination,
		};
	}, []);

	return (
		<Page>
			<PageHeader
				title="Tasks (v2)"
				action={
					<Button
						onClick={cache.actions.refresh}
						disabled={cache.fstate.isRefreshing}
						variant="outline"
						size="sm"
					>
						<RefreshCw
							className={`
         mr-2 size-4
         ${cache.fstate.isRefreshing ? 'animate-spin' : ''}
       `}
						/>
						Refresh
					</Button>
				}
			/>

			{/* Search Bar */}
			<div className="relative mb-4">
				<div className="mb-2 text-xs font-medium text-muted-foreground">Search</div>
				<Input
					type="text"
					value={search.fstate.query}
					onChange={e => search.actions.setQuery(e.target.value)}
					placeholder="Search tasks by ID, description, worker, status, or priority..."
				/>
				{search.fstate.query && (
					<Button
						onClick={search.actions.clearQuery}
						variant="ghost"
						size="sm"
						className="absolute top-9 right-2 h-6 w-6 -translate-y-1/2 p-0"
						aria-label="Clear search"
					>
						<X className="h-4 w-4" />
					</Button>
				)}
			</div>

			{/* Domain Filters */}
			<TaskFilters2 filters={filters} />

			{/* Feature Info (for demo purposes) */}
			<div className="mb-4 rounded-lg border border-border bg-muted/50 p-4 text-sm">
				<strong>Active Features (UI / Debounced):</strong>
				<div
					className={`
       mt-2 grid grid-cols-2 gap-2 text-xs
       sm:grid-cols-4
     `}
				>
					<div>
						<span className="text-muted-foreground">Search:</span>{' '}
						<span className="font-mono">
							{search.fstate.query ? `${search.fstate.query} / ${debouncedSearchQuery}` : 'none'}
						</span>
					</div>
					<div>
						<span className="text-muted-foreground">Sort:</span>{' '}
						<span className="font-mono">
							{sorting.fstate.sortConfigs.map(c => `${c.key}:${c.direction}`).join(', ') || 'none'}
						</span>
					</div>
					<div>
						<span className="text-muted-foreground">Filters:</span>{' '}
						<span className="font-mono">
							{filters.fstate.hasFilters
								? [
										filters.fstate.status && `status:${filters.fstate.status}`,
										filters.fstate.priority && `priority:${filters.fstate.priority}`,
										filters.fstate.workerId && `worker:${filters.fstate.workerId}`,
									]
										.filter(Boolean)
										.join(', ')
								: 'none'}
						</span>
					</div>
					<div>
						<span className="text-muted-foreground">Cache ID:</span>{' '}
						<span className="font-mono">{cache.fstate.cacheId}</span>
					</div>
				</div>
			</div>

			{/* Data + Table */}
			<Data2
				fetchData={fetchTasks}
				pagination={pagination}
				sorting={sorting}
				search={search}
				filter={filters as any}
				cache={cache}
				delegateLoadingToChildren={true}
			>
				<TasksTable2 />
			</Data2>
		</Page>
	);
}
