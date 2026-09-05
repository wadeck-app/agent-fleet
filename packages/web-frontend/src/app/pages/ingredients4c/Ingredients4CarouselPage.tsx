import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { DataInfinite } from '@framework/components/data/DataInfinite';
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
import { useInfinitePagination } from '@framework/hooks/data/useInfinitePagination';
import { useSorting } from '@framework/hooks/data/useSorting';
import { useDebounce } from '@framework/hooks/utility/useDebounce';
import { useMultiSelect } from '@framework/hooks/utility/useMultiSelect';
import { useBulkDeleteState } from '@framework/hooks/useBulkDeleteState';
import { useCrudSuccessToast } from '@framework/hooks/useCrudSuccessToast';
import { useDeleteConfirmation } from '@framework/hooks/useDeleteConfirmation';
import { useErrorToast } from '@framework/hooks/useErrorToast';
import { useRoutedDialog } from '@framework/hooks/useRoutedDialog';
import type { SearchContract } from '@framework/types/contracts/SearchContract';
import {
	applyColumnOrder,
	applyColumnVisibility,
	extractCanHideConstraints,
	extractCanReorderConstraints,
	extractColumnIds,
	extractDefaultVisible,
	toColumnVisibilityDefs,
} from '@framework/utils/TableColumnConfig';
import type { ComposedQuery } from '@framework/utils/buildQuery';
import type { CreateIngredient, Ingredient } from '@shared/api/ingredients.contract';
import { Plus, Trash, X } from 'lucide-react';

import { BulkDeleteWorkflow } from '@app/components/domain/BulkDeleteWorkflow';
import { IngredientDialog } from '@app/components/domain/IngredientDialog';

import { ingredientsService } from '../ingredients/IngredientsService';
import { useIngredientsCrud } from '../ingredients/useIngredientsCrud';
import { INGREDIENT_CAROUSEL_FIELDS, IngredientCarouselc } from './IngredientCarouselc';
import { useCarousel } from './useCarousel';

const STORAGE_ID = 'ingredientsc' as const;
const PAGE_SIZE = ; // Fetch  items per page, show  at a time

export function IngredientsCarouselPage() {
	const navigate = useNavigate();
	const { id, mode } = useParams<{ id?: string; mode?: 'new' | 'edit' }>();

	// 
	// HEADLESS FEATURES - Each is independent and composable
	// 

	// Sorting feature: manages multi-column sort and converts to backend query
	const sorting = useSorting({
		storageId: STORAGE_ID,
		defaultSort: [{ key: 'name', direction: 'asc' }],
	});

	// Search state (simple - no hook needed for infinite scroll)
	const [searchQuery, setSearchQuery] = useState('');

	// Add comment above the target line, not at the end
	// Debounced search query for SearchContract compatibility
	const debouncedSearchQuery = useDebounce(searchQuery, );

	// Multi-selection feature: manages selection state
	const selection = useMultiSelect();

	// Carousel feature: manages Embla Carousel state
	// Show  cards at a time, infinite scroll for data loading
	const carousel = useCarousel({ itemsPerView:  });

	// Field visibility feature: manages visible fields with localStorage persistence
	const fieldVisibility = useColumnVisibility(extractColumnIds(INGREDIENT_CAROUSEL_FIELDS), {
		storageId: STORAGE_ID + '-fields',
		defaultVisible: extractDefaultVisible(INGREDIENT_CAROUSEL_FIELDS),
		constraints: extractCanHideConstraints(INGREDIENT_CAROUSEL_FIELDS),
	});

	// Field ordering feature: manages field order with drag & drop
	const fieldOrder = useColumnOrder({
		storageId: STORAGE_ID + '-fields',
		defaultOrder: extractColumnIds(INGREDIENT_CAROUSEL_FIELDS),
		constraints: extractCanReorderConstraints(INGREDIENT_CAROUSEL_FIELDS),
	});

	// Apply visibility + ordering to fields
	const visibleOrderedFields = useMemo(() => {
		let fields = INGREDIENT_CAROUSEL_FIELDS;
		fields = applyColumnVisibility(fields, fieldVisibility.visibleColumns);
		fields = applyColumnOrder(fields, fieldOrder.columnOrder);
		return fields;
	}, [fieldVisibility.visibleColumns, fieldOrder.columnOrder]);

	// 
	// DATA FETCHING - Infinite Scroll with DataInfinite
	// 

	/
	  Fetch ingredients wrapper for DataInfinite
	 /
	const fetchIngredients = useCallback(async (query: ComposedQuery) => {
		const response = await ingredientsService.getIngredients({
			page: query.page as number,
			pageSize: query.pageSize as number,
			sortBy: query.sortBy as string | undefined,
			sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
			search: query.search as string | undefined,
		});

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
	}, []);

	// Search feature contract
	const search: SearchContract = useMemo(() => {
		const trimmedQuery = searchQuery.trim();
		const searchState = {
			query: searchQuery,
			trimmedQuery,
			debouncedQuery: debouncedSearchQuery,
			isEmpty: trimmedQuery === '',
		};
		return {
			state: searchState,
			fstate: searchState,
			actions: {
				setQuery: setSearchQuery,
				clearQuery: () => setSearchQuery(''),
			},
			fillQuery: q => {
				if (trimmedQuery) q.search = trimmedQuery;
			},
		};
	}, [searchQuery, debouncedSearchQuery]);

	// Infinite pagination feature - track hasMore from backend
	const [hasMore, _setHasMore] = useState(true);
	const infinitePagination = useInfinitePagination({
		pageSize: PAGE_SIZE,
		hasMore,
	});

	// Reset function for mutations
	const resetInfiniteScroll = useCallback(() => {
		infinitePagination.actions.reset();
	}, [infinitePagination]);

	// 
	// ACTIONS - Domain-specific operations
	// 

	// Use CRUD hook
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

	// Bulk delete state management (centralized hook eliminates ~ lines of boilerplate)
	const bulkDelete = useBulkDeleteState();

	// Track ingredients and totalItems for dialog/UI (will be synced with DataInfinite)
	const ingredientsRef = useRef<Ingredient[]>([]);
	const totalItemsRef = useRef();
	// Track loading state for UI outside of DataInfinite render props
	const [isLoading, setIsLoading] = useState(false);

	// Dialog state management using URL routing
	const { isOpen, editingItem: editingIngredient } = useRoutedDialog({
		mode,
		id,
		items: ingredientsRef.current,
		findItem: (items, id) => items.find(i => i.id === id),
		onNavigateBack: () => navigate('/ingredientsc'),
	});

	// Delete confirmation dialog (centralized hook eliminates ~ lines of boilerplate)
	const deleteConfirmation = useDeleteConfirmation({
		onConfirm: async id => {
			// Mark as deleting for strike-through effect
			bulkDelete.actions.setDeletingIds(new Set([...bulkDelete.state.deletingIds, id]));
			bulkDelete.actions.markMutating();

			try {
				await deleteIngredient(id);
				resetInfiniteScroll();
				successToast.deleted();
			} finally {
				const next = new Set(bulkDelete.state.deletingIds);
				next.delete(id);
				bulkDelete.actions.setDeletingIds(next);
				// Clear mutation state after reset completes
				bulkDelete.actions.clear();
			}
		},
	});

	// Dialog refresh state
	const [isDialogRefreshing, setIsDialogRefreshing] = useState(false);

	const handleEdit = (ingredient: Ingredient) => {
		navigate(`/ingredientsc/${ingredient.id}/edit`);
	};

	const handleCreateNew = () => {
		navigate('/ingredientsc/new');
	};

	const handleSubmit = async (data: CreateIngredient) => {
		bulkDelete.actions.markMutating();
		try {
			const isEditing = !!editingIngredient;
			if (editingIngredient) {
				// Find the latest version from the ingredients array
				const latestIngredient = ingredientsRef.current.find(i => i.id === editingIngredient.id);
				const version = latestIngredient?.version ?? editingIngredient.version;
				await updateIngredient(editingIngredient.id, { ...data, version });
			} else {
				await createIngredient(data);
			}

			// Reset infinite scroll to refresh from page 
			resetInfiniteScroll();
			navigate('/ingredientsc');

			// Show success toast
			if (isEditing) {
				successToast.updated();
			} else {
				successToast.created();
			}
		} finally {
			// Clear mutation state after reset completes
			bulkDelete.actions.clear();
		}
	};

	const handleRefresh = async () => {
		if (editingIngredient) {
			setIsDialogRefreshing(true);
			try {
				await refreshIngredient(editingIngredient.id);
				// Note: We don't update local state here since useInfiniteCarousel manages the data
				// The dialog will show stale data until user closes and reopens
				// This is acceptable for MVP - can improve later with granular updates
			} finally {
				setIsDialogRefreshing(false);
			}
		}
	};

	const handleManualRefresh = () => {
		// Reset infinite scroll to page 
		resetInfiniteScroll();
	};

	const handleBulkDelete = async () => {
		if (selection.fstate.isEmpty) return;
		bulkDelete.actions.openDialog();
	};

	// Handle select all for current visible items
	const _handleSelectAll = (ids: string[]) => {
		const allSelected = ids.every(id => selection.actions.isSelected(id));

		if (allSelected) {
			// Deselect all current items
			const newSelection = new Set(selection.fstate.selectedIds);
			ids.forEach(id => newSelection.delete(id));
			selection.actions.set(newSelection);
		} else {
			// Select all current items
			const newSelection = new Set([...selection.fstate.selectedIds, ...ids]);
			selection.actions.set(newSelection);
		}
	};

	// 
	// RENDER
	// 

	return (
		<Page>
			<PageHeader
				title="Ingredients v carousel"
				onRefresh={handleManualRefresh}
				isRefreshing={isLoading}
				action={
					<>
						<ColumnVisibility
							label="Fields"
							columns={toColumnVisibilityDefs(INGREDIENT_CAROUSEL_FIELDS)}
							visibleColumns={fieldVisibility.visibleColumns}
							defaultVisible={new Set(extractDefaultVisible(INGREDIENT_CAROUSEL_FIELDS))}
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
							defaultOrder={extractColumnIds(INGREDIENT_CAROUSEL_FIELDS)}
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

			{/ Search Bar /}
			<div className="mb- flex flex-col gap-">
				<div className="relative">
					<div className="mb- text-xs font-medium text-muted-foreground">Search</div>
					<Input
						type="text"
						value={searchQuery}
						onChange={e => setSearchQuery(e.target.value)}
						placeholder="Search ingredients..."
					/>
					{searchQuery && (
						<Button
							onClick={() => setSearchQuery('')}
							variant="ghost"
							size="sm"
							className="absolute top- right- h- w- -translate-y-/ p-"
							aria-label="Clear search"
						>
							<X className="h- w-" />
						</Button>
					)}
				</div>
			</div>

			{/ Feature Info (for demo purposes) /}
			<ActiveFeaturesPanel
				features={[
					{ label: 'Search', value: searchQuery || 'none' },
					{
						label: 'Sort',
						value: sorting.fstate.sortConfigs.map(c => `${c.key}:${c.direction}`).join(', ') || 'none',
					},
					{ label: 'Loaded', value: `${ingredientsRef.current.length} items` },
					{
						label: 'Viewing',
						value: `${carousel.fstate.currentIndex + }-${Math.min(
							carousel.fstate.currentIndex + carousel.fstate.itemsPerView,
							totalItemsRef.current
						)} of ${totalItemsRef.current}`,
					},
				]}
			/>

			{/ Bulk Action Bar /}
			{!selection.fstate.isEmpty && (
				<BulkActionBar
					selectionCount={selection.fstate.count}
					selectedLabel={`${selection.fstate.count} ingredient(s) selected`}
					onCancel={selection.actions.clear}
					variant="light"
				>
					<Button onClick={handleBulkDelete} variant="destructive" size="sm">
						<Trash className="mr- size-" />
						Delete
					</Button>
				</BulkActionBar>
			)}

			{/ Carousel Component with DataInfinite /}
			<DataInfinite
				fetchData={fetchIngredients}
				infinitePagination={infinitePagination}
				sorting={sorting}
				search={search}
				selection={selection}
				deduplicateBy={item => item.id}
			>
				{props => {
					// Update refs for dialog management (safe to do in render)
					ingredientsRef.current = props.data;
					if (props.pagination) {
						totalItemsRef.current = props.pagination.totalItems;
					}
					// Sync loading state for UI outside render props
					if (isLoading !== props.isLoading) {
						setIsLoading(props.isLoading);
					}

					return (
						<IngredientCarouselc
							data={props.data}
							isLoading={props.isLoading}
							isLoadingMore={false} // TODO: derive from Data
							hasMore={hasMore}
							error={props.error}
							sorting={sorting}
							searchQuery={searchQuery}
							carousel={carousel}
							fields={visibleOrderedFields}
							onEdit={handleEdit}
							onDelete={deleteConfirmation.open}
							refreshing={props.isLoading || bulkDelete.state.isRefreshingAfterMutation}
							deleting={bulkDelete.state.isBulkDeleting}
							_deletingIds={bulkDelete.state.deletingIds}
							onSelectionToggle={selection.actions.toggle}
							selectedIds={selection.fstate.selectedIds}
						/>
					);
				}}
			</DataInfinite>

			{/ Bulk Delete Workflow /}
			<BulkDeleteWorkflow
				open={bulkDelete.state.showDialog}
				onOpenChange={bulkDelete.actions.setShowDialog}
				selectedIds={selection.fstate.selectedIds}
				onClear={selection.actions.clear}
				onBulkDelete={bulkDeleteIngredients}
				onReload={async () => {
					resetInfiniteScroll();
					// Clear mutation state after reset completes
					bulkDelete.actions.clear();
				}}
				itemTypeName="ingredient"
				onDeletingChange={ids => {
					if (ids.size > ) {
						bulkDelete.actions.setDeletingIds(ids);
					}
				}}
				onBulkDeletingChange={deleting => {
					if (deleting) {
						bulkDelete.actions.startDeleting(new Set());
						bulkDelete.actions.markMutating();
					}
				}}
			/>

			{/ Ingredient Dialog for Create/Edit /}
			<IngredientDialog
				open={isOpen}
				onClose={() => navigate('/ingredientsc')}
				ingredient={editingIngredient}
				onSubmit={handleSubmit}
				onRefresh={handleRefresh}
				isRefreshing={isDialogRefreshing}
			/>

			{/ Delete Confirmation Dialog /}
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
