import { useCallback, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Data2 } from '@framework/components2/data/Data2';
import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { useColumnOrder } from '@framework/components/columns/useColumnOrder';
import { useColumnVisibility } from '@framework/components/columns/useColumnVisibility';
import { ActiveFeaturesPanel } from '@framework/components/debug/ActiveFeaturesPanel';
import { Input } from '@framework/components/forms/Input';
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
import { useRoutedDialog } from '@framework/hooks/useRoutedDialog';
import {
	applyColumnOrder,
	applyColumnVisibility,
	extractCanHideConstraints,
	extractCanReorderConstraints,
	extractColumnIds,
	extractDefaultVisible,
	toColumnVisibilityDefs,
} from '@framework/utils2/Table2ColumnConfig';
import type { CreateIngredient, Ingredient, IngredientsListQuery } from '@shared/api/ingredients.contract';
import { Plus, Trash2, X } from 'lucide-react';

import { BulkDeleteWorkflow, IngredientDialog } from '@app/components/domain';

import { ingredientsService } from '../ingredients/IngredientsService';
import { useIngredientsCrud } from '../ingredients/useIngredientsCrud';
import { INGREDIENT_TABLE2_COLUMNS, IngredientTable2 } from './IngredientTable2';

const STORAGE_ID = 'ingredients2' as const;

export function Ingredients2TablePage() {
	const navigate = useNavigate();
	const { id, mode } = useParams<{ id?: string; mode?: 'new' | 'edit' }>();

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// HEADLESS FEATURES - Each is independent and composable
	// ═══════════════════════════════════════════════════════════════════════════════════════

	// Pagination feature: manages page state and converts to backend query
	const pagination = usePagination2({
		pageSize: 10,
		storageId: STORAGE_ID,
		initialPage: 1,
	});

	// Sorting feature: manages multi-column sort and converts to backend query
	const sorting = useSorting2({
		storageId: STORAGE_ID,
		defaultSort: [{ key: 'name', direction: 'asc' }],
	});

	// Search feature: simple omnisearch using 'q' URL param, maps to backend 'search' param
	const search = useSimpleSearch({
		onSearchChange: () => {
			// Reset to first page when search changes
			pagination.actions.resetPage();
		},
	});

	// Cache control feature: explicit cache busting and refresh management
	const cache = useCacheControl2({ enabled: true });

	// Multi-selection feature: manages selection state
	const selection = useMultiSelect2();

	// Column visibility feature: manages visible columns with localStorage persistence
	const columnVisibility = useColumnVisibility(extractColumnIds(INGREDIENT_TABLE2_COLUMNS), {
		storageId: STORAGE_ID,
		defaultVisible: extractDefaultVisible(INGREDIENT_TABLE2_COLUMNS),
		constraints: extractCanHideConstraints(INGREDIENT_TABLE2_COLUMNS),
	});

	// Column ordering feature: manages column order with drag & drop
	const columnOrder = useColumnOrder({
		storageId: STORAGE_ID,
		defaultOrder: extractColumnIds(INGREDIENT_TABLE2_COLUMNS),
		constraints: extractCanReorderConstraints(INGREDIENT_TABLE2_COLUMNS),
	});

	// Apply visibility + ordering to columns
	const visibleOrderedColumns = useMemo(() => {
		let cols = INGREDIENT_TABLE2_COLUMNS;
		cols = applyColumnVisibility(cols, columnVisibility.visibleColumns);
		cols = applyColumnOrder(cols, columnOrder.columnOrder);
		return cols;
	}, [columnVisibility.visibleColumns, columnOrder.columnOrder]);

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// DATA FETCHING - Wrapper around existing service
	// ═══════════════════════════════════════════════════════════════════════════════════════

	/**
	 * Fetch ingredients using the composed query from all features.
	 * Data2 will call this function whenever feature states change.
	 * CRITICAL: Wrapped with useCallback to prevent infinite loops in Data2 useEffect
	 */
	const fetchIngredients = useCallback(
		async (query: IngredientsListQuery) => {
			const response = await ingredientsService.getIngredients({
				page: query.page,
				pageSize: query.pageSize,
				sortBy: query.sortBy,
				sortOrder: query.sortOrder,
				search: query.search, // From simple search
			});

			// Store ingredients for dialog and version lookups
			setIngredients(response.items);

			return {
				items: response.items,
				pagination: response.pagination
					? {
							total: response.pagination.total,
							page: response.pagination.page,
							pageSize: response.pagination.pageSize,
							totalPages: response.pagination.totalPages,
						}
					: undefined,
			};
		},
		[] // No dependencies - ingredientsService and setIngredients are stable
	);

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// ACTIONS - Domain-specific operations
	// ═══════════════════════════════════════════════════════════════════════════════════════

	// Store fetched ingredients for dialog and version lookups
	const [ingredients, setIngredients] = useState<Ingredient[]>([]);

	// Use new CRUD-only hook (no automatic fetching)
	const {
		createIngredient,
		updateIngredient,
		deleteIngredient,
		refreshIngredient,
		bulkDeleteIngredients,
		operationError,
		clearOperationError,
	} = useIngredientsCrud();

	// Show error as toast automatically
	useErrorToast({ error: operationError, clearError: clearOperationError });

	// Success toast helper
	const successToast = useCrudSuccessToast('ingredient');

	// Bulk delete state management (centralized hook eliminates ~60 lines of boilerplate)
	const bulkDelete = useBulkDeleteState();

	// Dialog state management using URL routing
	const { isOpen, editingItem: editingIngredient } = useRoutedDialog({
		mode,
		id,
		items: ingredients,
		findItem: (items, id) => items.find(i => i.id === id),
		onNavigateBack: () => navigate('/ingredients2'),
	});

	// Delete confirmation dialog (centralized hook eliminates ~30 lines of boilerplate)
	const deleteConfirmation = useDeleteConfirmation({
		onConfirm: async id => {
			// Mark as deleting for strike-through effect
			bulkDelete.actions.setDeletingIds(new Set([...bulkDelete.state.deletingIds, id]));
			bulkDelete.actions.markMutating();

			try {
				await deleteIngredient(id);
				await cache.actions.refresh();
				successToast.deleted();
			} finally {
				const next = new Set(bulkDelete.state.deletingIds);
				next.delete(id);
				bulkDelete.actions.setDeletingIds(next);
			}
		},
	});

	// Automatic cleanup after mutation completes (eliminates ~10 lines of useEffect boilerplate)
	useMutationCleanup({
		data: ingredients,
		isMutating: bulkDelete.state.isMutating,
		onCleanup: () => bulkDelete.actions.clear(),
	});

	// Dialog refresh state
	const [isDialogRefreshing, setIsDialogRefreshing] = useState(false);

	const handleEdit = (ingredient: Ingredient) => {
		navigate(`/ingredients2/${ingredient.id}/edit`);
	};

	const handleCreateNew = () => {
		navigate('/ingredients2/new');
	};

	const handleSubmit = async (data: CreateIngredient) => {
		bulkDelete.actions.markMutating();
		try {
			const isEditing = !!editingIngredient;
			if (editingIngredient) {
				// Find the latest version from the ingredients array
				const latestIngredient = ingredients.find(i => i.id === editingIngredient.id);
				const version = latestIngredient?.version ?? editingIngredient.version;
				await updateIngredient(editingIngredient.id, { ...data, version });
			} else {
				await createIngredient(data);
			}
			// Trigger Data2 refresh via cache control
			await cache.actions.refresh();
			navigate('/ingredients2');

			// Show success toast
			if (isEditing) {
				successToast.updated();
			} else {
				successToast.created();
			}
		} finally {
			// Cleanup handled by useMutationCleanup hook
		}
	};

	const handleRefresh = async () => {
		if (editingIngredient) {
			setIsDialogRefreshing(true);
			try {
				const refreshedIngredient = await refreshIngredient(editingIngredient.id);
				if (refreshedIngredient) {
					// Update the ingredient in the local state
					setIngredients(prev => prev.map(i => (i.id === editingIngredient.id ? refreshedIngredient : i)));
				}
			} finally {
				setIsDialogRefreshing(false);
			}
		}
	};

	const handleBulkDelete = async () => {
		if (selection.fstate.isEmpty) return;
		bulkDelete.actions.openDialog();
	};

	// Handle select all for current page
	const handleSelectAll = (ids: string[]) => {
		// If all current page items are selected, deselect them
		// Otherwise, select them (merge with existing selection)
		const allSelected = ids.every(id => selection.actions.isSelected(id));

		if (allSelected) {
			// Deselect all current page items
			const newSelection = new Set(selection.fstate.selectedIds);
			ids.forEach(id => newSelection.delete(id));
			selection.actions.set(newSelection);
		} else {
			// Select all current page items (merge with existing selection)
			const newSelection = new Set([...selection.fstate.selectedIds, ...ids]);
			selection.actions.set(newSelection);
		}
	};

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// RENDER
	// ═══════════════════════════════════════════════════════════════════════════════════════

	return (
		<Page>
			<PageHeader
				title="Ingredients v2 table"
				onRefresh={cache.actions.refresh}
				isRefreshing={cache.fstate.isRefreshing}
				action={
					<>
						<ColumnVisibility
							columns={toColumnVisibilityDefs(INGREDIENT_TABLE2_COLUMNS)}
							visibleColumns={columnVisibility.visibleColumns}
							defaultVisible={new Set(extractDefaultVisible(INGREDIENT_TABLE2_COLUMNS))}
							onToggle={columnVisibility.toggleColumn}
							onReset={() => {
								columnVisibility.resetColumns();
								columnOrder.resetOrder();
							}}
							onShowAll={columnVisibility.showAll}
							onHideAll={columnVisibility.hideAll}
							isColumnModified={columnVisibility.isColumnModified}
							onResetColumn={columnVisibility.resetColumn}
							columnOrder={columnOrder.columnOrder}
							defaultOrder={extractColumnIds(INGREDIENT_TABLE2_COLUMNS)}
							onReorderColumns={columnOrder.reorderColumns}
							isColumnModifiedOrder={columnOrder.isColumnModified}
							onResetColumnOrder={columnOrder.resetColumn}
						/>
						<Button onClick={handleCreateNew}>
							<Plus />
							Add Ingredient
						</Button>
					</>
				}
			/>

			{/* Search Bar */}
			<div className="mb-4 flex flex-col gap-4">
				<div className="relative">
					<div className="mb-2 text-xs font-medium text-muted-foreground">Search</div>
					<Input
						type="text"
						value={search.fstate.query}
						onChange={e => search.actions.setQuery(e.target.value)}
						placeholder="Search ingredients..."
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
			</div>

			{/* Feature Info (for demo purposes - remove in production) */}
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

			{/* Bulk Action Bar */}
			{!selection.fstate.isEmpty && (
				<BulkActionBar
					selectionCount={selection.fstate.count}
					selectedLabel={`${selection.fstate.count} ingredient(s) selected`}
					onCancel={selection.actions.clear}
					variant="light"
				>
					<Button onClick={handleBulkDelete} variant="destructive" size="sm">
						<Trash2 className="mr-2 size-4" />
						Delete
					</Button>
				</BulkActionBar>
			)}

			{/* Data Shell + Table */}
			<Data2
				fetchData={fetchIngredients}
				pagination={pagination}
				sorting={sorting}
				search={search}
				cache={cache}
				selection={selection}
				delegateLoadingToChildren={true}
			>
				{injectedProps => (
					<IngredientTable2
						{...injectedProps}
						columns={visibleOrderedColumns}
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

			{/* Bulk Delete Workflow */}
			<BulkDeleteWorkflow
				open={bulkDelete.state.showDialog}
				onOpenChange={bulkDelete.actions.setShowDialog}
				selectedIds={selection.fstate.selectedIds}
				onClear={selection.actions.clear}
				onBulkDelete={bulkDeleteIngredients}
				onReload={async () => cache.actions.refresh()}
				itemTypeName="ingredient"
				onDeletingChange={ids => {
					// Only set deletingIds if non-empty (ignore clear - let useMutationCleanup do it)
					if (ids.size > 0) {
						bulkDelete.actions.setDeletingIds(ids);
					}
				}}
				onBulkDeletingChange={deleting => {
					if (deleting) {
						bulkDelete.actions.startDeleting(new Set());
						bulkDelete.actions.markMutating();
					}
					// Ignore deleting=false - let useMutationCleanup clear it when refresh completes
				}}
			/>

			{/* Ingredient Dialog for Create/Edit */}
			<IngredientDialog
				open={isOpen}
				onClose={() => navigate('/ingredients2')}
				ingredient={editingIngredient}
				onSubmit={handleSubmit}
				onRefresh={handleRefresh}
				isRefreshing={isDialogRefreshing}
			/>

			{/* Delete Confirmation Dialog */}
			<AlertDialogWrapper
				open={deleteConfirmation.isOpen}
				onOpenChange={deleteConfirmation.setOpen}
				title="Delete Ingredient"
				description="Are you sure you want to delete this ingredient? This action cannot be undone."
				confirmLabel="Delete"
				cancelLabel="Cancel"
				variant="danger"
				onConfirm={deleteConfirmation.confirm}
			/>
		</Page>
	);
}
