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
import {
	B2F_WORKSPACES_UPDATED,
	B2F_WORKSPACE_CREATED,
	B2F_WORKSPACE_DELETED,
	B2F_WORKSPACE_UPDATED,
} from '@shared/transport';
import { RefreshCw, X } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { workspacesApi } from '../workspaces/workspaces.api';
import { WorkspacesTable2 } from './WorkspacesTable2';

const STORAGE_ID = 'workspaces2' as const;

/**
 * ===========================================================================================
 * WORKSPACES2 PAGE - Data2 Architecture
 * ===========================================================================================
 *
 * Modern workspaces page using headless composable architecture:
 * - Pagination (usePagination2)
 * - Sorting (useSorting2)
 * - Search (useSimpleSearch)
 * - Cache control (useCacheControl2)
 * - Data2 orchestration
 * - Table2 display
 *
 * ===========================================================================================
 */
export function WorkspacesPage2() {
	// Headless features
	const pagination = usePagination2({
		pageSize: 10,
		storageId: STORAGE_ID,
		initialPage: 1,
	});

	const sorting = useSorting2({
		storageId: STORAGE_ID,
		defaultSort: [{ key: 'lastUsed', direction: 'desc' }],
	});

	const search = useSimpleSearch({
		onSearchChange: () => {
			// Reset to first page when search changes
			pagination.actions.resetPage();
		},
	});

	const cache = useCacheControl2({ enabled: true });

	// Subscribe to real-time workspace events
	// Refresh list when workspaces are created, updated, deleted, or when workers connect/disconnect
	useRealtimeRefresh({
		events: [B2F_WORKSPACES_UPDATED, B2F_WORKSPACE_CREATED, B2F_WORKSPACE_UPDATED, B2F_WORKSPACE_DELETED],
		onEvent: cache.actions.refresh,
		logPrefix: 'WorkspacesPage2',
	});

	// Debounce search query
	const debouncedSearchQuery = useDebounce(search.fstate.query, 300);

	// Fetch function
	const fetchWorkspaces = useCallback(async (query: ComposedQuery) => {
		const response = await workspacesApi.getWorkspacesList({
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
			<PageHeader
				title="Workspaces (v2)"
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
					placeholder="Search workspaces by path, mode, status, or branch..."
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

			{/* Feature Info (for demo purposes) */}
			<div className="mb-4 rounded-lg border border-border bg-muted/50 p-4 text-sm">
				<strong>Active Features (UI / Debounced):</strong>
				<div
					className={`
       mt-2 grid grid-cols-2 gap-2 text-xs
       sm:grid-cols-3
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
						<span className="text-muted-foreground">Cache ID:</span>{' '}
						<span className="font-mono">{cache.fstate.cacheId}</span>
					</div>
				</div>
			</div>

			{/* Data + Table */}
			<Data2 fetchData={fetchWorkspaces} pagination={pagination} sorting={sorting} search={search} cache={cache}>
				<WorkspacesTable2 />
			</Data2>
		</Page>
	);
}
