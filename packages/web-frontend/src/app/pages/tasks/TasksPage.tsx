import { useCallback, useState } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ActiveFeaturesPanel } from '@framework/components/debug/ActiveFeaturesPanel';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
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
import { useUrlState } from '@framework/hooks/useUrlState';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Task } from '@shared/api/tasks.contract';
import { B2F_TASK_CREATED, B2F_TASK_DELETED, B2F_TASK_UPDATED } from '@shared/transport';
import { Plus, Trash2 } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { BulkDeleteWorkflow } from '@app/components/domain';

import { CreateTaskDialog } from './CreateTaskDialog';
import { TaskFilters } from './TaskFilters';
import { TasksTable } from './TasksTable';
import { tasksApi } from './tasks.api';
import { useTaskFilters } from './useTaskFilters';
import { useTasksCrud } from './useTasksCrud';

const STORAGE_ID = 'tasks' as const;

/**
 * ===========================================================================================
 * TASKS PAGE - Data2 Architecture with Hybrid Filtering
 * ===========================================================================================
 *
 * Modern tasks page using headless composable architecture:
 * - Pagination (usePagination2)
 * - Sorting (useSorting2)
 * - Search (useSimpleSearch) - omnisearch across all fields
 * - Domain Filters (useTaskFilters) - status, priority, workerId
 * - Cache control (useCacheControl2)
 * - Data2 orchestration
 * - Table2 display
 *
 * Hybrid approach:
 * - Generic search (useSimpleSearch) for text-based queries
 * - Domain filters (useTaskFilters) for structured filtering
 * - Both integrate seamlessly with Data2 architecture
 *
 * ===========================================================================================
 */
export function TasksPage() {
	// URL state for dialog - replaces local state
	// URL format: /tasks?action=create
	const [dialogAction, setDialogAction] = useUrlState({
		key: 'action',
		defaultValue: null as string | null,
	});

	// Computed state - dialog is open when action=create
	const createDialogOpen = dialogAction === 'create';

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

	// Multi-selection feature: manages selection state
	const selection = useMultiSelect2();

	// CRUD operations
	const { deleteTask, bulkDeleteTasks, operationError, clearOperationError } = useTasksCrud();

	// Show error as toast automatically
	useErrorToast({ error: operationError, clearError: clearOperationError });

	// Success toast helper
	const successToast = useCrudSuccessToast('task');

	// Bulk delete state management
	const bulkDelete = useBulkDeleteState();

	// Delete confirmation state management
	const deleteConfirmation = useDeleteConfirmation({
		onConfirm: async id => {
			bulkDelete.actions.setDeletingIds(new Set([...bulkDelete.state.deletingIds, id]));
			bulkDelete.actions.markMutating();

			try {
				await deleteTask(id);
				await cache.actions.refresh();
				successToast.deleted();
			} finally {
				const next = new Set(bulkDelete.state.deletingIds);
				next.delete(id);
				bulkDelete.actions.setDeletingIds(next);
			}
		},
	});

	// Store fetched tasks for visual feedback
	const [tasks, setTasks] = useState<Task[]>([]);

	// Subscribe to real-time task events
	// Refresh list when tasks are created, updated, or deleted
	useRealtimeRefresh({
		events: [B2F_TASK_CREATED, B2F_TASK_UPDATED, B2F_TASK_DELETED],
		onEvent: cache.actions.refresh,
		logPrefix: 'TasksPage',
	});

	// Domain-specific filters (tasks-specific)
	const filters = useTaskFilters({
		onFilterChange: () => {
			// Reset to first page when filters change
			pagination.actions.resetPage();
		},
	});

	// Automatically clean up mutation state when data refreshes
	useMutationCleanup({
		data: tasks,
		isMutating: bulkDelete.state.isMutating,
		onCleanup: () => bulkDelete.actions.clear(),
	});

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
			flowId: query.flowId as string | undefined,
		});

		// Store tasks for visual feedback
		setTasks(response.items);

		return {
			items: response.items,
			pagination: response.pagination,
		};
	}, []);

	const handleTaskCreated = async () => {
		cache.actions.refresh();
		// Clear URL params to close dialog after successful creation
		setDialogAction(null);
	};

	const handleBulkDelete = async () => {
		if (selection.fstate.isEmpty) return;
		bulkDelete.actions.openDialog();
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
				title="Tasks"
				onRefresh={cache.actions.refresh}
				isRefreshing={cache.fstate.isRefreshing}
				action={
					<Button onClick={() => setDialogAction('create')} variant="default" size="sm">
						<Plus />
						Create Task
					</Button>
				}
			/>

			{/* Search Bar */}
			<SearchBar
				value={search.fstate.query}
				onChange={search.actions.setQuery}
				onClear={search.actions.clearQuery}
				placeholder="Search tasks by ID, description, worker, status, or priority..."
				className="mb-4"
			/>

			{/* Domain Filters */}
			<TaskFilters filters={filters} />

			{/* Bulk Action Bar */}
			{!selection.fstate.isEmpty && (
				<BulkActionBar
					selectionCount={selection.fstate.count}
					selectedLabel={`${selection.fstate.count} task(s) selected`}
					onCancel={selection.actions.clear}
					variant="light"
				>
					<Button onClick={handleBulkDelete} variant="destructive" size="sm">
						<Trash2 className="mr-2 size-4" />
						Delete
					</Button>
				</BulkActionBar>
			)}

			{/* Feature Info (for demo purposes) */}
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
									filters.fstate.priority && `priority:${filters.fstate.priority}`,
									filters.fstate.workerId && `worker:${filters.fstate.workerId}`,
									filters.fstate.flowId && `flow:${filters.fstate.flowId}`,
								]
									.filter(Boolean)
									.join(', ')
							: 'none',
					},
					{ label: 'Cache ID', value: cache.fstate.cacheId.toString() },
				]}
			/>

			{/* Data + Table */}
			<Data2
				fetchData={fetchTasks}
				{...pagination}
				{...sorting}
				{...search}
				filter={filters as any}
				{...cache}
				{...selection}
				delegateLoadingToChildren={true}
			>
				{injectedProps => (
					<TasksTable
						{...injectedProps}
						onDelete={deleteConfirmation.open}
						refreshing={injectedProps.isLoading || bulkDelete.state.isRefreshingAfterMutation}
						deleting={bulkDelete.state.isBulkDeleting}
						deletingIds={bulkDelete.state.deletingIds}
						onSelectionToggle={selection.actions.toggle}
						onSelectAll={handleSelectAll}
					/>
				)}
			</Data2>

			<CreateTaskDialog
				open={createDialogOpen}
				onOpenChange={open => {
					// When dialog closes, clear URL params
					if (!open) {
						setDialogAction(null);
					}
				}}
				onSuccess={handleTaskCreated}
			/>

			{/* Bulk Delete Workflow */}
			<BulkDeleteWorkflow
				open={bulkDelete.state.showDialog}
				onOpenChange={bulkDelete.actions.setShowDialog}
				selectedIds={selection.fstate.selectedIds}
				onClear={selection.actions.clear}
				onBulkDelete={bulkDeleteTasks}
				onReload={async () => cache.actions.refresh()}
				itemTypeName="task"
				onDeletingChange={ids => {
					if (ids.size > 0) {
						bulkDelete.actions.setDeletingIds(ids);
					}
				}}
				onBulkDeletingChange={deleting => {
					if (deleting) {
						bulkDelete.actions.setIsBulkDeleting(true);
						bulkDelete.actions.markMutating();
					}
				}}
			/>

			{/* Delete Confirmation Dialog */}
			<AlertDialogWrapper
				open={deleteConfirmation.isOpen}
				onOpenChange={deleteConfirmation.setOpen}
				title="Delete Task"
				description="Are you sure you want to delete this task? This action cannot be undone."
				confirmLabel="Delete"
				cancelLabel="Cancel"
				variant="danger"
				onConfirm={deleteConfirmation.confirm}
			/>
		</Page>
	);
}
