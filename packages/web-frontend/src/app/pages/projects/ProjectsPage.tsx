import { useCallback, useState } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ActiveFeaturesPanel } from '@framework/components/debug/ActiveFeaturesPanel';
import { SearchBar } from '@framework/components/forms/SearchBar';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';
import { Button } from '@framework/components/primitives/Button';
import { useCacheControl2 } from '@framework/hooks2/useCacheControl2';
import { useMultiSelect2 } from '@framework/hooks2/useMultiSelect2';
import { usePagination2 } from '@framework/hooks2/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/useSorting2';
import { useBulkDeleteState } from '@framework/hooks/useBulkDeleteState';
import { useCrudSuccessToast } from '@framework/hooks/useCrudSuccessToast';
import { useDeleteConfirmation } from '@framework/hooks/useDeleteConfirmation';
import { useErrorToast } from '@framework/hooks/useErrorToast';
import { useMutationCleanup } from '@framework/hooks/useMutationCleanup';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Project } from '@shared/api/projects.contract';
import { B2F_PROJECT_CREATED, B2F_PROJECT_DELETED, B2F_PROJECT_UPDATED } from '@shared/transport';
import { Plus, Trash2 } from 'lucide-react';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { BulkDeleteWorkflow } from '@app/components/domain';

import { CreateProjectDialog } from './CreateProjectDialog';
import { EditProjectDialog } from './EditProjectDialog';
import { ProjectsTable } from './ProjectsTable';
import { projectsApi } from './projects.api';
import { useProjectsCrud } from './useProjectsCrud';

const STORAGE_ID = 'projects' as const;

/**
 * ===========================================================================================
 * PROJECTS PAGE - Data2 Architecture with Simple Search
 * ===========================================================================================
 *
 * Modern projects page using headless composable architecture:
 * - Pagination (usePagination2)
 * - Sorting (useSorting2)
 * - Search (useSimpleSearch) - omnisearch across all fields
 * - Cache control (useCacheControl2)
 * - Data2 orchestration
 * - Table2 display
 *
 * Features:
 * - Real-time WebSocket updates
 * - CRUD operations (Create, Edit, Delete, Bulk Delete)
 * - Optimistic locking for updates
 *
 * ===========================================================================================
 */
export function ProjectsPage() {
	const [createDialogOpen, setCreateDialogOpen] = useState(false);
	const [editDialogState, setEditDialogState] = useState<{
		open: boolean;
		project: Project | null;
	}>({
		open: false,
		project: null,
	});

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
			pagination.actions.resetPage();
		},
	});

	const cache = useCacheControl2({ enabled: true });

	// Multi-selection feature: manages selection state
	const selection = useMultiSelect2();

	// CRUD operations
	const { deleteProject, bulkDeleteProjects, operationError, clearOperationError } = useProjectsCrud();

	// Show error as toast automatically
	useErrorToast({ error: operationError, clearError: clearOperationError });

	// Success toast helper
	const successToast = useCrudSuccessToast('project');

	// Add comment above the target line, not at the end
	// Bulk delete state management (centralized hook eliminates ~60 lines of boilerplate)
	const bulkDelete = useBulkDeleteState();

	// Add comment above the target line, not at the end
	// Delete confirmation dialog (centralized hook eliminates ~30 lines of boilerplate)
	const deleteConfirmation = useDeleteConfirmation({
		onConfirm: async id => {
			// Add comment above the target line, not at the end
			// Mark as deleting for strike-through effect
			bulkDelete.actions.setDeletingIds(new Set([...bulkDelete.state.deletingIds, id]));
			bulkDelete.actions.markMutating();

			try {
				await deleteProject(id);
				await cache.actions.refresh();
				successToast.deleted();
			} finally {
				const next = new Set(bulkDelete.state.deletingIds);
				next.delete(id);
				bulkDelete.actions.setDeletingIds(next);
			}
		},
	});

	// Store fetched projects for visual feedback
	const [projects, setProjects] = useState<Project[]>([]);

	// Subscribe to real-time project events
	// Refresh list when projects are created, updated, or deleted
	useRealtimeRefresh({
		events: [B2F_PROJECT_CREATED, B2F_PROJECT_UPDATED, B2F_PROJECT_DELETED],
		onEvent: cache.actions.refresh,
		logPrefix: 'ProjectsPage',
	});

	// Add comment above the target line, not at the end
	// Automatic cleanup after mutation completes (eliminates ~10 lines of useEffect boilerplate)
	useMutationCleanup({
		data: projects,
		isMutating: bulkDelete.state.isMutating,
		onCleanup: () => bulkDelete.actions.clear(),
	});

	// Fetch function - query includes all features composed by Data2
	const fetchProjects = useCallback(async (query: ComposedQuery) => {
		const response = await projectsApi.getProjectsList({
			page: query.page,
			pageSize: query.pageSize,
			sortBy: query.sortBy,
			sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
			search: query.search,
		});

		// Store projects for visual feedback
		setProjects(response.items);

		return {
			items: response.items,
			pagination: response.pagination,
		};
	}, []);

	const handleProjectCreated = async () => {
		cache.actions.refresh();
	};

	const handleProjectUpdated = async () => {
		cache.actions.refresh();
	};

	const handleEdit = (project: Project) => {
		setEditDialogState({ open: true, project });
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
				title="Projects"
				onRefresh={cache.actions.refresh}
				isRefreshing={cache.fstate.isRefreshing}
				action={
					<Button onClick={() => setCreateDialogOpen(true)} variant="default" size="sm">
						<Plus />
						Create Project
					</Button>
				}
			/>

			{/* Search Bar */}
			<SearchBar
				value={search.fstate.query}
				onChange={search.actions.setQuery}
				onClear={search.actions.clearQuery}
				placeholder="Search projects by name or description..."
				className="mb-4"
			/>

			{/* Bulk Action Bar */}
			{!selection.fstate.isEmpty && (
				<BulkActionBar
					selectionCount={selection.fstate.count}
					selectedLabel={`${selection.fstate.count} project(s) selected`}
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
					{ label: 'Cache ID', value: cache.fstate.cacheId.toString() },
				]}
			/>

			{/* Data + Table */}
			<Data2
				fetchData={fetchProjects}
				{...pagination}
				{...sorting}
				{...search}
				{...cache}
				{...selection}
				delegateLoadingToChildren={true}
			>
				{injectedProps => (
					<ProjectsTable
						{...injectedProps}
						onEdit={handleEdit}
						onDelete={deleteConfirmation.open}
						refreshing={injectedProps.isLoading || bulkDelete.state.isRefreshingAfterMutation}
						deleting={bulkDelete.state.isBulkDeleting}
						deletingIds={bulkDelete.state.deletingIds}
						onSelectionToggle={selection.actions.toggle}
						onSelectAll={handleSelectAll}
					/>
				)}
			</Data2>

			<CreateProjectDialog
				open={createDialogOpen}
				onOpenChange={setCreateDialogOpen}
				onSuccess={handleProjectCreated}
			/>

			<EditProjectDialog
				project={editDialogState.project}
				open={editDialogState.open}
				onOpenChange={open => setEditDialogState({ open, project: open ? editDialogState.project : null })}
				onSuccess={handleProjectUpdated}
			/>

			{/* Bulk Delete Workflow */}
			<BulkDeleteWorkflow
				open={bulkDelete.state.showDialog}
				onOpenChange={bulkDelete.actions.setShowDialog}
				selectedIds={selection.fstate.selectedIds}
				onClear={selection.actions.clear}
				onBulkDelete={bulkDeleteProjects}
				onReload={async () => cache.actions.refresh()}
				itemTypeName="project"
				onDeletingChange={ids => {
					bulkDelete.actions.setDeletingIds(ids);
				}}
				onBulkDeletingChange={deleting => {
					if (deleting) {
						bulkDelete.actions.startDeleting(new Set());
						bulkDelete.actions.markMutating();
					}
				}}
			/>

			{/* Delete Confirmation Dialog */}
			<AlertDialogWrapper
				open={deleteConfirmation.isOpen}
				onOpenChange={deleteConfirmation.setOpen}
				title="Delete Project"
				description="Are you sure you want to delete this project? This action cannot be undone."
				confirmLabel="Delete"
				cancelLabel="Cancel"
				variant="danger"
				onConfirm={deleteConfirmation.confirm}
			/>
		</Page>
	);
}
