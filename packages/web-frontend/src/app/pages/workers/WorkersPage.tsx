import { useCallback, useMemo } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { ActiveFeaturesPanel } from '@framework/components/debug/ActiveFeaturesPanel';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { SearchBar } from '@framework/features/search/SearchBar';
import { useCacheControl2 } from '@framework/hooks2/data/useCacheControl2';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/data/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/data/useSorting2';
import { useDebounce } from '@framework/hooks2/utility/useDebounce';
import type { MutationContract } from '@framework/types/MutationContract';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Worker } from '@shared/api/workers.contract';
import { B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED, B2F_WORKER_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { EventSubscriptionsPanel } from './EventSubscriptionsPanel';
import { WorkersTable } from './WorkersTable';
import { workersApi } from './workers.api';

const STORAGE_ID = 'workers' as const;

/**
 * ===========================================================================================
 * WORKERS PAGE - Data2 Architecture
 * ===========================================================================================
 *
 * Modern workers page using headless composable architecture:
 * - Pagination (usePagination2)
 * - Sorting (useSorting2)
 * - Search (useSimpleSearch)
 * - Cache control (useCacheControl2)
 * - Data2 orchestration
 * - Table2 display
 *
 * ===========================================================================================
 */
export function WorkersPage() {
	// Headless features
	const pagination = usePagination2({
		pageSize: 10,
		storageId: STORAGE_ID,
		initialPage: 1,
	});

	const sorting = useSorting2({
		storageId: STORAGE_ID,
		defaultSort: [{ key: 'workerId', direction: 'asc' }],
	});

	const search = useSimpleSearch({
		onSearchChange: () => {
			// Reset to first page when search changes
			pagination.actions.resetPage();
		},
	});

	const cache = useCacheControl2({ enabled: true });

	// Debounce search query
	const debouncedSearchQuery = useDebounce(search.fstate.query, 300);

	// Mutation contract for direct cache updates
	const mutation: MutationContract<Worker> = useMemo(
		() => ({
			keyExtractor: (worker: Worker) => worker.workerId,
		}),
		[]
	);

	// Subscribe to real-time worker events
	// Events: worker name updates, worker connections, worker disconnections
	useRealtimeRefresh({
		events: [B2F_WORKER_UPDATED, B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED],
		onEvent: cache.actions.refresh,
		logPrefix: 'WorkersPage',
	});

	// Fetch function
	const fetchWorkers = useCallback(async (query: ComposedQuery) => {
		const response = await workersApi.getWorkersList({
			page: query.page,
			pageSize: query.pageSize,
			sortBy: query.sortBy,
			sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
			search: query.search,
		});

		return {
			items: response.items,
			pagination: response.pagination,
		};
	}, []);

	return (
		<Page>
			<PageHeader title="Workers" onRefresh={cache.actions.refresh} isRefreshing={cache.fstate.isRefreshing} />

			{/* Search Bar */}
			<SearchBar
				value={search.fstate.query}
				onChange={search.actions.setQuery}
				onClear={search.actions.clearQuery}
				placeholder="Search workers by ID, state, or task..."
				className="mb-4"
			/>

			{/* Feature Info (for demo purposes) */}
			<ActiveFeaturesPanel
				title="Active Features (UI / Debounced)"
				features={[
					{
						label: 'Search',
						value: search.fstate.query ? `${search.fstate.query} / ${debouncedSearchQuery}` : 'none',
					},
					{
						label: 'Sort',
						value: sorting.fstate.sortConfigs.map(c => `${c.key}:${c.direction}`).join(', ') || 'none',
					},
					{ label: 'Cache ID', value: cache.fstate.cacheId.toString() },
				]}
			/>

			{/* Data + Table */}
			<Data2
				fetchData={fetchWorkers}
				pagination={pagination}
				sorting={sorting}
				search={search}
				cache={cache}
				mutation={mutation}
				delegateLoadingToChildren={true}
			>
				<WorkersTable />
			</Data2>

			{/* Event Subscriptions Panel */}
			<EventSubscriptionsPanel />
		</Page>
	);
}
