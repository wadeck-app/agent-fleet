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
import { INGREDIENT_GRID_FIELDS, IngredientGrid3 } from './IngredientGrid3';

const STORAGE_ID = 'ingredients3' as const;

export function Ingredients3GridPage() {
	const navigate = useNavigate();
	const { id, mode } = useParams<{ id?: string; mode?: 'new' | 'edit' }>();

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// HEADLESS FEATURES - Each is independent and composable
	// ═══════════════════════════════════════════════════════════════════════════════════════

	// Pagination feature: manages page state and converts to backend query
	// Page size = 9 for 3x3 grid layout (instead of 10 for table)
	// Grid-friendly page sizes: 6 (2x3), 9 (3x3), 12 (3x4), 24 (3x8)
	const pagination = usePagination2({
		pageSize: 9,
		pageSizeOptions: [3, 6, 9, 12, 15],
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

	// Field visibility feature: manages visible fields with localStorage persistence
	const fieldVisibility = useColumnVisibility(extractColumnIds(INGREDIENT_GRID_FIELDS), {
		storageId: STORAGE_ID + '-fields',
		defaultVisible: extractDefaultVisible(INGREDIENT_GRID_FIELDS),
		constraints: extractCanHideConstraints(INGREDIENT_GRID_FIELDS),
	});

	// Field ordering feature: manages field order with drag & drop
	const fieldOrder = useColumnOrder({
		storageId: STORAGE_ID + '-fields',
		defaultOrder: extractColumnIds(INGREDIENT_GRID_FIELDS),
		constraints: extractCanReorderConstraints(INGREDIENT_GRID_FIELDS),
	});

	// Apply visibility + ordering to fields
	const visibleOrderedFields = useMemo(() => {
		let fields = INGREDIENT_GRID_FIELDS;
		fields = applyColumnVisibility(fields, fieldVisibility.visibleColumns);
		fields = applyColumnOrder(fields, fieldOrder.columnOrder);
		return fields;
	}, [fieldVisibility.visibleColumns, fieldOrder.columnOrder]);

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
		onNavigateBack: () => navigate('/ingredients3'),
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
		navigate(`/ingredients3/${ingredient.id}/edit`);
	};

	const handleCreateNew = () => {
		navigate('/ingredients3/new');
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
			navigate('/ingredients3');

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
				title="Ingredients v3 grid"
				onRefresh={cache.actions.refresh}
				isRefreshing={cache.fstate.isRefreshing}
				action={
					<>
						<ColumnVisibility
							label="Fields"
							columns={toColumnVisibilityDefs(INGREDIENT_GRID_FIELDS)}
							visibleColumns={fieldVisibility.visibleColumns}
							defaultVisible={new Set(extractDefaultVisible(INGREDIENT_GRID_FIELDS))}
							onToggle={fieldVisibility.toggleColumn}
							onReset={() => {
								fieldVisibility.resetColumns();
								fieldOrder.resetOrder();
							}}
							onShowAll={fieldVisibility.showAll}
							onHideAll={fieldVisibility.hideAll}
							isColumnModified={fieldVisibility.isColumnModified}
							onResetColumn={fieldVisibility.resetColumn}
							columnOrder={fieldOrder.columnOrder}
							defaultOrder={extractColumnIds(INGREDIENT_GRID_FIELDS)}
							onReorderColumns={fieldOrder.reorderColumns}
							isColumnModifiedOrder={fieldOrder.isColumnModified}
							onResetColumnOrder={fieldOrder.resetColumn}
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
				{/* Search Input */}
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

			{/* Data Shell + Grid */}
			<Data2
				fetchData={fetchIngredients}
				{...pagination}
				{...sorting}
				{...search}
				{...cache}
				{...selection}
				delegateLoadingToChildren={true}
			>
				{injectedProps => (
					<IngredientGrid3
						{...injectedProps}
						fields={visibleOrderedFields}
						onEdit={handleEdit}
						onDelete={deleteConfirmation.open}
						refreshing={injectedProps.isLoading || bulkDelete.state.isRefreshingAfterMutation}
						deleting={bulkDelete.state.isBulkDeleting}
						_deletingIds={bulkDelete.state.deletingIds}
						onSelectionToggle={selection.actions.toggle}
						_onSelectAll={handleSelectAll}
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
				onClose={() => navigate('/ingredients3')}
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
