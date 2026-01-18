import { useCallback } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { FeatureInfoBox } from '@framework/components/feedback/FeatureInfoBox';
import { SearchBar } from '@framework/components/forms/SearchBar';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Button } from '@framework/components/primitives/Button';
import { useCacheControl2 } from '@framework/hooks2/useCacheControl2';
import { usePagination2 } from '@framework/hooks2/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/useSorting2';
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
			<FeatureInfoBox title="Active Features (UI / Debounced):">
				<div className="mt-2 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
					<div>
						<span className="text-muted-foreground">Search:</span>{' '}
						<span className="font-mono">{search.fstate.query || 'none'}</span>
					</div>
					<div>
						<span className="text-muted-foreground">Sort:</span>{' '}
						<span className="font-mono">
							{sorting.fstate.sortConfigs.map(c => `${c.key}:${c.direction}`).join(', ') || 'none'}
						</span>
					</div>
					<div>
						<span className="text-muted-foreground">Filters:</span>{' '}
						<span className="font-mono">{filters.fstate.hasFilters ? 'active' : 'none'}</span>
					</div>
					<div>
						<span className="text-muted-foreground">Cache ID:</span>{' '}
						<span className="font-mono">{cache.fstate.cacheId}</span>
					</div>
				</div>
			</FeatureInfoBox>

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
