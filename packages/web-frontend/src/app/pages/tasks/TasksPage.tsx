import { useCallback, useEffect, useRef, useState } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ActiveFeaturesPanel } from '@framework/components/debug/ActiveFeaturesPanel';
import { SearchBar } from '@framework/components/forms/SearchBar';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { Button } from '@framework/components/primitives/Button';
import { useCacheControl2 } from '@framework/hooks2/useCacheControl2';
import { useDebounce } from '@framework/hooks2/useDebounce';
import { useMultiSelect2 } from '@framework/hooks2/useMultiSelect2';
import { usePagination2 } from '@framework/hooks2/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/useSorting2';
import { useCrudSuccessToast } from '@framework/hooks/useCrudSuccessToast';
import { useErrorToast } from '@framework/hooks/useErrorToast';
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
	const [createDialogOpen, setCreateDialogOpen] = useState(false);

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

	// Bulk delete dialog state
	const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
	// Track IDs being deleted (for strike-through visual feedback)
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
	// Track if bulk delete is in progress (for blur effect)
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	// Track if we're refreshing after a mutation (delete/update/create)
	const [isRefreshingAfterMutation, setIsRefreshingAfterMutation] = useState(false);
	// Track if we're waiting for a refresh to complete after a mutation
	const isMutating = useRef(false);

	// Delete confirmation dialog state
	const [deleteConfirmation, setDeleteConfirmation] = useState<{
		open: boolean;
		taskId: string | null;
	}>({
		open: false,
		taskId: null,
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

	// Debounce search query
	const debouncedSearchQuery = useDebounce(search.fstate.query, 300);

	// Clear isRefreshingAfterMutation and isBulkDeleting when the data changes
	useEffect(() => {
		if (isMutating.current && tasks.length > 0) {
			isMutating.current = false;
			setIsRefreshingAfterMutation(false);
			setIsBulkDeleting(false);
			setDeletingIds(new Set());
		}
	}, [tasks]);

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
	};

	const handleDelete = (id: string) => {
		setDeleteConfirmation({ open: true, taskId: id });
	};

	const handleDeleteConfirm = async () => {
		if (deleteConfirmation.taskId) {
			// Mark as deleting for strike-through effect
			setDeletingIds(prev => new Set([...prev, deleteConfirmation.taskId!]));
			// Start refreshing state
			setIsRefreshingAfterMutation(true);
			// Mark mutation mode
			isMutating.current = true;

			try {
				await deleteTask(deleteConfirmation.taskId);
				await cache.actions.refresh();
				successToast.deleted();
			} finally {
				setDeletingIds(prev => {
					const next = new Set(prev);
					next.delete(deleteConfirmation.taskId!);
					return next;
				});
			}
		}
		setDeleteConfirmation({ open: false, taskId: null });
	};

	const handleBulkDelete = async () => {
		if (selection.fstate.isEmpty) return;
		setShowBulkDeleteDialog(true);
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
					<Button onClick={() => setCreateDialogOpen(true)} variant="default" size="sm">
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
						value: search.fstate.query ? `${search.fstate.query} / ${debouncedSearchQuery}` : 'none',
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
				pagination={pagination}
				sorting={sorting}
				search={search}
				filter={filters as any}
				cache={cache}
				selection={selection}
				delegateLoadingToChildren={true}
			>
				{injectedProps => (
					<TasksTable
						{...injectedProps}
						onDelete={handleDelete}
						refreshing={injectedProps.isLoading || isRefreshingAfterMutation}
						deleting={isBulkDeleting}
						deletingIds={deletingIds}
						onSelectionToggle={selection.actions.toggle}
						onSelectAll={handleSelectAll}
					/>
				)}
			</Data2>

			<CreateTaskDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
				onSuccess={handleTaskCreated}
			/>

			{/* Bulk Delete Workflow */}
			<BulkDeleteWorkflow
				open={showBulkDeleteDialog}
				onOpenChange={setShowBulkDeleteDialog}
				selectedIds={selection.fstate.selectedIds}
				onClear={selection.actions.clear}
				onBulkDelete={bulkDeleteTasks}
				onReload={async () => cache.actions.refresh()}
				itemTypeName="task"
				onDeletingChange={ids => {
					if (ids.size > 0) {
						setDeletingIds(ids);
					}
				}}
				onBulkDeletingChange={deleting => {
					if (deleting) {
						setIsBulkDeleting(true);
						isMutating.current = true;
					}
				}}
			/>

			{/* Delete Confirmation Dialog */}
			<AlertDialogWrapper
				open={deleteConfirmation.open}
				onOpenChange={open => {
					setDeleteConfirmation({ open, taskId: open ? deleteConfirmation.taskId : null });
				}}
				title="Delete Task"
				description="Are you sure you want to delete this task? This action cannot be undone."
				confirmLabel="Delete"
				cancelLabel="Cancel"
				variant="danger"
				onConfirm={handleDeleteConfirm}
			/>
		</Page>
	);
}
