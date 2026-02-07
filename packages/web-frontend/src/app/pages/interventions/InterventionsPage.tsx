import { useCallback } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { ActiveFeaturesPanel } from '@framework/components/debug/ActiveFeaturesPanel';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Pagination } from '@framework/components/pagination/Pagination';
import { SearchBar } from '@framework/features/search/SearchBar';
import { useCacheControl2 } from '@framework/hooks2/data/useCacheControl2';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/data/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/data/useSorting2';
import type { InterventionsQuery } from '@shared/api/interventions.contract';
import { B2F_INTERVENTIONS_UPDATED, B2F_INTERVENTION_CREATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { InterventionFilters } from './InterventionFilters';
import { InterventionsCards } from './InterventionsCards';
import { interventionsApi } from './interventions.api';
import { useInterventionFilters } from './useInterventionFilters';

/**
 * ===========================================================================================
 * INTERVENTIONS PAGE - User Interventions Inbox
 * ===========================================================================================
 *
 * Displays list of user interventions from agents/workers using Data2 architecture:
 * - Approval requests
 * - Questions requiring answers
 * - Choices between options
 *
 * Features:
 * - Card-based conversational layout
 * - Search across ID, title, description, task, type
 * - Filters (status, type, blocking, taskId)
 * - Sorting (createdAt, type, status, blocking)
 * - Pagination
 * - Real-time updates via WebSocket
 * - Cache control with refresh button
 * - localStorage persistence for UI state
 *
 * ===========================================================================================
 */

export function InterventionsPage() {
	// Data2 composable hooks
	const pagination = usePagination2({
		pageSize: 10,
		storageId: 'interventions',
		initialPage: 1,
	});

	const sorting = useSorting2({
		storageId: 'interventions',
		defaultSort: [{ key: 'createdAt', direction: 'desc' }],
	});

	const search = useSimpleSearch({
		onSearchChange: () => pagination.actions.resetPage(),
	});

	const cache = useCacheControl2({ enabled: true });

	const filters = useInterventionFilters({
		onFilterChange: () => pagination.actions.resetPage(),
	});

	// Fetch function for Data2
	const fetchInterventions = useCallback(
		async (query: InterventionsQuery) => {
			// Apply domain filters
			filters.fillQuery(query);

			const response = await interventionsApi.getInterventions(query);
			return {
				items: response.items,
				total: response.pagination?.total || response.items.length,
			};
		},
		// eslint-disable-next-line react-hooks/exhaustive-deps -- Only filters.fillQuery is needed, not the entire filters object
		[filters.fillQuery]
	);

	// Real-time updates
	useRealtimeRefresh({
		events: [B2F_INTERVENTION_CREATED, B2F_INTERVENTIONS_UPDATED],
		onEvent: cache.actions.refresh,
		logPrefix: 'InterventionsPage',
	});

	return (
		<Page>
			<PageHeader
				title="User Interventions"
				onRefresh={cache.actions.refresh}
				isRefreshing={cache.fstate.isRefreshing}
			/>

			{/* Search Bar */}
			<SearchBar
				value={search.fstate.query}
				onChange={search.actions.setQuery}
				onClear={search.actions.clearQuery}
				placeholder="Search interventions by ID, title, description, task, or type..."
				className="mb-4"
			/>

			<InterventionFilters filters={filters} />

			{/* Feature Info (for demo purposes - remove in production) */}
			<ActiveFeaturesPanel
				title="Active Features (UI / Debounced)"
				features={[
					{ label: 'Search', value: search.fstate.query || 'none' },
					{
						label: 'Sort',
						value: sorting.fstate.sortConfigs.map(c => `${c.key}:${c.direction}`).join(', ') || 'none',
					},
					{ label: 'Filters', value: filters.fstate.hasFilters ? 'active' : 'none' },
					{ label: 'Cache ID', value: cache.fstate.cacheId.toString() },
				]}
			/>

			<Data2
				fetchData={fetchInterventions}
				pagination={pagination}
				sorting={sorting}
				search={search}
				cache={cache}
				delegateLoadingToChildren={true}
			>
				{injectedProps => (
					<>
						<InterventionsCards {...injectedProps} />
						{injectedProps.pagination && injectedProps.pagination.totalPages > 1 && (
							<Pagination
								currentPage={injectedProps.pagination.currentPage}
								totalPages={injectedProps.pagination.totalPages}
								onPageChange={injectedProps.pagination.onPageChange}
								className="mt-4"
							/>
						)}
					</>
				)}
			</Data2>
		</Page>
	);
}
