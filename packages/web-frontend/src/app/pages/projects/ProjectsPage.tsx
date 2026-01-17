import { useCallback, useEffect, useRef, useState } from 'react';

import { Data2 } from '@framework/components2/data/Data2';
import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
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
		projectId: string | null;
	}>({
		open: false,
		projectId: null,
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

	// Debounce search query
	const debouncedSearchQuery = useDebounce(search.fstate.query, 300);

	// Clear isRefreshingAfterMutation and isBulkDeleting when the data changes
	useEffect(() => {
		if (isMutating.current && projects.length > 0) {
			isMutating.current = false;
			setIsRefreshingAfterMutation(false);
			setIsBulkDeleting(false);
			setDeletingIds(new Set());
		}
	}, [projects]);

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

	const handleDelete = (id: string) => {
		setDeleteConfirmation({ open: true, projectId: id });
	};

	const handleDeleteConfirm = async () => {
		if (deleteConfirmation.projectId) {
			// Mark as deleting for strike-through effect
			setDeletingIds(prev => new Set([...prev, deleteConfirmation.projectId!]));
			// Start refreshing state
			setIsRefreshingAfterMutation(true);
			// Mark mutation mode
			isMutating.current = true;

			try {
				await deleteProject(deleteConfirmation.projectId);
				await cache.actions.refresh();
				successToast.deleted();
			} finally {
				setDeletingIds(prev => {
					const next = new Set(prev);
					next.delete(deleteConfirmation.projectId!);
					return next;
				});
			}
		}
		setDeleteConfirmation({ open: false, projectId: null });
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
			<div className="mb-4 rounded-lg border border-border bg-muted/50 p-4 text-sm">
				<strong>Active Features (UI / Debounced):</strong>
				<div
					className={`
       mt-2 grid grid-cols-2 gap-2 text-xs
       sm:grid-cols-4
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
			<Data2
				fetchData={fetchProjects}
				pagination={pagination}
				sorting={sorting}
				search={search}
				cache={cache}
				selection={selection}
				delegateLoadingToChildren={true}
			>
				{injectedProps => (
					<ProjectsTable
						{...injectedProps}
						onEdit={handleEdit}
						onDelete={handleDelete}
						refreshing={injectedProps.isLoading || isRefreshingAfterMutation}
						deleting={isBulkDeleting}
						deletingIds={deletingIds}
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
				open={showBulkDeleteDialog}
				onOpenChange={setShowBulkDeleteDialog}
				selectedIds={selection.fstate.selectedIds}
				onClear={selection.actions.clear}
				onBulkDelete={bulkDeleteProjects}
				onReload={async () => cache.actions.refresh()}
				itemTypeName="project"
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
					setDeleteConfirmation({ open, projectId: open ? deleteConfirmation.projectId : null });
				}}
				title="Delete Project"
				description="Are you sure you want to delete this project? This action cannot be undone."
				confirmLabel="Delete"
				cancelLabel="Cancel"
				variant="danger"
				onConfirm={handleDeleteConfirm}
			/>
		</Page>
	);
}
