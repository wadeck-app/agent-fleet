import { useCallback, useState } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ActiveFeaturesPanel } from '@framework/components/debug/ActiveFeaturesPanel';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Button } from '@framework/components/primitives/Button';
import { SearchBar } from '@framework/features/search/SearchBar';
import { useCacheControl2 } from '@framework/hooks2/data/useCacheControl2';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/data/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/data/useSorting2';
import { useMultiSelect2 } from '@framework/hooks2/utility/useMultiSelect2';
import { useBulkDeleteState } from '@framework/hooks/useBulkDeleteState';
import { useCrudSuccessToast } from '@framework/hooks/useCrudSuccessToast';
import { useDeleteConfirmation } from '@framework/hooks/useDeleteConfirmation';
import { useErrorToast } from '@framework/hooks/useErrorToast';
import { useMutationCleanup } from '@framework/hooks/useMutationCleanup';
import type { Intervention, InterventionsQuery } from '@shared/api/interventions.contract';
import { B2F_INTERVENTIONS_UPDATED, B2F_INTERVENTION_CREATED } from '@shared/transport';
import { XCircle } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { BulkDeleteWorkflow } from '@app/components/domain';

import { InterventionFilters } from './InterventionFilters';
import { InterventionsTable } from './InterventionsTable';
import { interventionsApi } from './interventions.api';
import { useInterventionFilters } from './useInterventionFilters';
import { useInterventionsCrud } from './useInterventionsCrud';

const STORAGE_ID = 'interventions-v2' as const;

/**
 * ===========================================================================================
 * INTERVENTIONS V2 PAGE - Table View with Bulk Actions
 * ===========================================================================================
 *
 * Modern interventions page using Table2 architecture instead of cards:
 * - Table-based layout for better comparison and scanning
 * - Sortable columns
 * - Multi-select with bulk operations
 * - CRUD operations (Cancel, Bulk Cancel)
 * - Real-time updates via WebSocket
 * - All Data2 composable features (pagination, sorting, search, filters, cache)
 *
 * Differences from original InterventionsPage:
 * - Uses InterventionsTable instead of InterventionsCards
 * - Adds multi-selection support (useMultiSelect2)
 * - Adds CRUD operations (useInterventionsCrud)
 * - Adds bulk cancel workflow
 * - Row click navigation to detail page
 *
 * ===========================================================================================
 */
export function InterventionsV2Page() {
	// Data2 composable hooks
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
		onSearchChange: () => pagination.actions.resetPage(),
	});

	const cache = useCacheControl2({ enabled: true });

	const filters = useInterventionFilters({
		onFilterChange: () => pagination.actions.resetPage(),
	});

	// Multi-selection feature
	const selection = useMultiSelect2();

	// CRUD operations
	const { cancelIntervention, bulkCancelInterventions, operationError, clearOperationError } = useInterventionsCrud();

	// Show error as toast automatically
	useErrorToast({ error: operationError, clearError: clearOperationError });

	// Success toast helper
	const successToast = useCrudSuccessToast('intervention');

	// Bulk delete state management (reusing for cancel operations)
	const bulkDelete = useBulkDeleteState();

	// Delete confirmation state management (reusing for cancel operations)
	const deleteConfirmation = useDeleteConfirmation({
		onConfirm: async id => {
			bulkDelete.actions.setDeletingIds(new Set([...bulkDelete.state.deletingIds, id]));
			bulkDelete.actions.markMutating();

			try {
				await cancelIntervention(id);
				await cache.actions.refresh();
				successToast.deleted();
			} finally {
				const next = new Set(bulkDelete.state.deletingIds);
				next.delete(id);
				bulkDelete.actions.setDeletingIds(next);
			}
		},
	});

	// Store fetched interventions for visual feedback
	const [interventions, setInterventions] = useState<Intervention[]>([]);

	// Automatically clean up mutation state when data refreshes
	useMutationCleanup({
		data: interventions,
		isMutating: bulkDelete.state.isMutating,
		onCleanup: () => bulkDelete.actions.clear(),
	});

	// Real-time updates
	useRealtimeRefresh({
		events: [B2F_INTERVENTION_CREATED, B2F_INTERVENTIONS_UPDATED],
		onEvent: cache.actions.refresh,
		logPrefix: 'InterventionsV2Page',
	});

	// Fetch function for Data2
	// Query is already composed by Data2 with all features (pagination, sorting, search, filters)
	const fetchInterventions = useCallback(async (query: InterventionsQuery) => {
		const response = await interventionsApi.getInterventions(query);

		// Store interventions for visual feedback
		setInterventions(response.items);

		return {
			items: response.items,
			pagination: response.pagination,
		};
	}, []);

	// Handle bulk cancel
	const handleBulkCancel = async () => {
		if (selection.fstate.isEmpty) return;
		bulkDelete.actions.openDialog();
	};

	// Adapter function to convert BulkCancelResponse to BulkDeleteResponse format
	const bulkCancelAdapter = async (ids: string[]) => {
		const result = await bulkCancelInterventions(ids);
		return {
			deleted: result.cancelled,
			failed: result.failed.map(f => ({
				id: f.id,
				reason: f.error,
				code: 'CANCEL_FAILED',
			})),
		};
	};

	// Handle select all for current page
	const handleSelectAll = (ids: string[]) => {
		const allSelected = ids.every(id => selection.actions.isSelected(id));

		if (allSelected) {
			const newSelection = new Set(selection.fstate.selectedIds);
			ids.forEach(id => newSelection.delete(id));
			selection.actions.set(newSelection);
		} else {
			const newSelection = new Set([...selection.fstate.selectedIds, ...ids]);
			selection.actions.set(newSelection);
		}
	};

	return (
		<Page>
			<PageHeader
				title="User Interventions (Table View)"
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

			{/* Bulk Action Bar */}
			{!selection.fstate.isEmpty && (
				<BulkActionBar
					selectionCount={selection.fstate.count}
					selectedLabel={`${selection.fstate.count} intervention(s) selected`}
					onCancel={selection.actions.clear}
					variant="light"
				>
					<Button onClick={handleBulkCancel} variant="destructive" size="sm">
						<XCircle className="mr-2 size-4" />
						Cancel Selected
					</Button>
				</BulkActionBar>
			)}

			{/* Feature Info (for demo purposes - can be removed in production) */}
			<ActiveFeaturesPanel
				title="Active Features (UI / Debounced)"
				features={[
					{
						label: 'Search',
						value: search.fstate.query
							? `${search.fstate.query} / ${search.fstate.debouncedQuery}`
							: 'none',
					},
					{
						label: 'Sort',
						value: sorting.fstate.sortConfigs.map(c => `${c.key}:${c.direction}`).join(', ') || 'none',
					},
					{
						label: 'Filters',
						value: filters.fstate.hasFilters
							? [
									filters.fstate.status && `status:${filters.fstate.status}`,
									filters.fstate.type && `type:${filters.fstate.type}`,
									filters.fstate.blocking !== undefined && `blocking:${filters.fstate.blocking}`,
									filters.fstate.taskId && `taskId:${filters.fstate.taskId}`,
								]
									.filter(Boolean)
									.join(' ')
							: 'none',
					},
					{ label: 'Cache ID', value: cache.fstate.cacheId.toString() },
				]}
			/>

			{/* Data + Table */}
			<Data2
				fetchData={fetchInterventions}
				{...pagination}
				{...sorting}
				{...search}
				filter={filters as any}
				{...cache}
				{...selection}
				delegateLoadingToChildren={true}
			>
				{injectedProps => (
					<>
						<InterventionsTable
							{...injectedProps}
							onCancel={deleteConfirmation.open}
							refreshing={injectedProps.isLoading || bulkDelete.state.isRefreshingAfterMutation}
							cancelling={bulkDelete.state.isBulkDeleting}
							cancellingIds={bulkDelete.state.deletingIds}
							onSelectionToggle={selection.actions.toggle}
							onSelectAll={handleSelectAll}
						/>
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

			{/* Bulk Cancel Workflow */}
			<BulkDeleteWorkflow
				open={bulkDelete.state.showDialog}
				onOpenChange={bulkDelete.actions.setShowDialog}
				selectedIds={selection.fstate.selectedIds}
				onClear={selection.actions.clear}
				onBulkDelete={bulkCancelAdapter}
				onReload={async () => cache.actions.refresh()}
				itemTypeName="intervention"
				onDeletingChange={ids => {
					if (ids.size > 0) {
						bulkDelete.actions.setDeletingIds(ids);
					}
				}}
				onBulkDeletingChange={cancelling => {
					if (cancelling) {
						bulkDelete.actions.setIsBulkDeleting(true);
						bulkDelete.actions.markMutating();
					}
				}}
			/>

			{/* Cancel Confirmation Dialog */}
			<AlertDialogWrapper
				open={deleteConfirmation.isOpen}
				onOpenChange={deleteConfirmation.setOpen}
				title="Cancel Intervention"
				description="Are you sure you want to cancel this intervention? This action cannot be undone."
				confirmLabel="Cancel Intervention"
				cancelLabel="Go Back"
				variant="danger"
				onConfirm={deleteConfirmation.confirm}
			/>
		</Page>
	);
}
