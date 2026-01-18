import { useCallback, useMemo } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { FeatureInfoBox } from '@framework/components/feedback/FeatureInfoBox';
import { SearchBar } from '@framework/components/forms/SearchBar';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Button } from '@framework/components/primitives/Button';
import { useCacheControl2 } from '@framework/hooks2/useCacheControl2';
import { useDebounce } from '@framework/hooks2/useDebounce';
import { usePagination2 } from '@framework/hooks2/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/useSorting2';
import type { MutationContract } from '@framework/types/MutationContract';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Worker } from '@shared/api/workers.contract';
import { B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED, B2F_WORKER_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

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
			<FeatureInfoBox title="Active Features (UI / Debounced):">
				<div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
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
						<span className="text-muted-foreground">Cache ID:</span>{' '}
						<span className="font-mono">{cache.fstate.cacheId}</span>
					</div>
				</div>
			</FeatureInfoBox>

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
		</Page>
	);
}
