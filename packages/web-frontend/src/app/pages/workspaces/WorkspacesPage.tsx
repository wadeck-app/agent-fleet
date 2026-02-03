import { useCallback, useState } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { ActiveFeaturesPanel } from '@framework/components/debug/ActiveFeaturesPanel';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { Button } from '@framework/components/primitives/Button';
import { SearchBar } from '@framework/features/search/SearchBar';
import { useCacheControl2 } from '@framework/hooks2/useCacheControl2';
import { useDebounce } from '@framework/hooks2/useDebounce';
import { usePagination2 } from '@framework/hooks2/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/useSorting2';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import {
	B2F_PROJECT_DELETED,
	B2F_WORKSPACES_UPDATED,
	B2F_WORKSPACE_CREATED,
	B2F_WORKSPACE_DELETED,
	B2F_WORKSPACE_UPDATED,
} from '@shared/transport';
import { Plus } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { CreateWorkspaceDialog } from './CreateWorkspaceDialog';
import { WorkspacesTable } from './WorkspacesTable';
import { workspacesApi } from './workspaces.api';

const STORAGE_ID = 'workspaces' as const;

/**
 * ===========================================================================================
 * WORKSPACES PAGE - Data2 Architecture
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
export function WorkspacesPage() {
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

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
	// Also refresh when projects are deleted (to update project names in table)
	useRealtimeRefresh({
		events: [
			B2F_WORKSPACES_UPDATED,
			B2F_WORKSPACE_CREATED,
			B2F_WORKSPACE_UPDATED,
			B2F_WORKSPACE_DELETED,
			B2F_PROJECT_DELETED,
		],
		onEvent: cache.actions.refresh,
		logPrefix: 'WorkspacesPage',
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

	// Handle workspace creation
	const handleCreateWorkspace = useCallback(() => {
		cache.actions.refresh();
		setCreateDialogOpen(false);
	}, [cache.actions]);

	return (
		<Page>
			<PageHeader
				title="Workspaces"
				onRefresh={cache.actions.refresh}
				isRefreshing={cache.fstate.isRefreshing}
				action={
					<Button onClick={() => setCreateDialogOpen(true)}>
						<Plus className="h-4 w-4 mr-2" />
						Create Workspace
					</Button>
				}
			/>

			{/* Search Bar */}
			<SearchBar
				value={search.fstate.query}
				onChange={search.actions.setQuery}
				onClear={search.actions.clearQuery}
				placeholder="Search workspaces by path, mode, status, or branch..."
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
				fetchData={fetchWorkspaces}
				pagination={pagination}
				sorting={sorting}
				search={search}
				cache={cache}
				delegateLoadingToChildren={true}
			>
				<WorkspacesTable />
			</Data2>

			{/* Create Workspace Dialog */}
			<CreateWorkspaceDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
				onSuccess={handleCreateWorkspace}
			/>
		</Page>
	);
}
