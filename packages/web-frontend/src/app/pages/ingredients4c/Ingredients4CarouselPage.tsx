import { useCallback, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Data2Infinite } from '@framework/components2/data/Data2Infinite';
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
import { useDebounce } from '@framework/hooks2/useDebounce';
import { useInfinitePagination } from '@framework/hooks2/useInfinitePagination';
import { useMultiSelect2 } from '@framework/hooks2/useMultiSelect2';
import { useSorting2 } from '@framework/hooks2/useSorting2';
import { useCrudSuccessToast } from '@framework/hooks/useCrudSuccessToast';
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
} from '@framework/utils2/Table2ColumnConfig';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { CreateIngredient, Ingredient } from '@shared/api/ingredients.contract';
import { Plus, Trash2, X } from 'lucide-react';

import { BulkDeleteWorkflow, IngredientDialog } from '@app/components/domain';

import { ingredientsService } from '../ingredients/IngredientsService';
import { useIngredientsCrud } from '../ingredients/useIngredientsCrud';
import { INGREDIENT_CAROUSEL_FIELDS, IngredientCarousel4c } from './IngredientCarousel4c';
import { useCarousel } from './useCarousel';

const STORAGE_ID = 'ingredients4c' as const;
const PAGE_SIZE = 12; // Fetch 12 items per page, show 3 at a time

export function Ingredients4CarouselPage() {
	const navigate = useNavigate();
	const { id, mode } = useParams<{ id?: string; mode?: 'new' | 'edit' }>();

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// HEADLESS FEATURES - Each is independent and composable
	// ═══════════════════════════════════════════════════════════════════════════════════════

	// Sorting feature: manages multi-column sort and converts to backend query
	const sorting = useSorting2({
		storageId: STORAGE_ID,
		defaultSort: [{ key: 'name', direction: 'asc' }],
	});

	// Search state (simple - no hook needed for infinite scroll)
	const [searchQuery, setSearchQuery] = useState('');

	// Add comment above the target line, not at the end
	// Debounced search query for SearchContract compatibility
	const debouncedSearchQuery = useDebounce(searchQuery, 300);

	// Multi-selection feature: manages selection state
	const selection = useMultiSelect2();

	// Carousel feature: manages Embla Carousel state
	// Show 3 cards at a time, infinite scroll for data loading
	const carousel = useCarousel({ itemsPerView: 3 });

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

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// DATA FETCHING - Infinite Scroll with Data2Infinite
	// ═══════════════════════════════════════════════════════════════════════════════════════

	/**
	 * Fetch ingredients wrapper for Data2Infinite
	 */
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

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// ACTIONS - Domain-specific operations
	// ═══════════════════════════════════════════════════════════════════════════════════════

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

	// Track ingredients and totalItems for dialog/UI (will be synced with Data2Infinite)
	const ingredientsRef = useRef<Ingredient[]>([]);
	const totalItemsRef = useRef(0);
	// Track loading state for UI outside of Data2Infinite render props
	const [isLoading, setIsLoading] = useState(false);

	// Add comment above the target line, not at the end
	// Note: This effect won't work correctly with refs - would need a state trigger
	// Keeping for now but may need refactoring
	// TODO: Fix this to properly detect when data changes after mutation

	// Dialog state management using URL routing
	const { isOpen, editingItem: editingIngredient } = useRoutedDialog({
		mode,
		id,
		items: ingredientsRef.current,
		findItem: (items, id) => items.find(i => i.id === id),
		onNavigateBack: () => navigate('/ingredients4c'),
	});

	// Delete confirmation dialog state
	const [deleteConfirmation, setDeleteConfirmation] = useState<{
		open: boolean;
		ingredientId: string | null;
	}>({
		open: false,
		ingredientId: null,
	});

	// Dialog refresh state
	const [isDialogRefreshing, setIsDialogRefreshing] = useState(false);

	const handleEdit = (ingredient: Ingredient) => {
		navigate(`/ingredients4c/${ingredient.id}/edit`);
	};

	const handleDelete = (id: string) => {
		setDeleteConfirmation({
			open: true,
			ingredientId: id,
		});
	};

	const handleDeleteConfirm = async () => {
		if (deleteConfirmation.ingredientId) {
			// Mark as deleting for strike-through effect
			setDeletingIds(prev => new Set([...prev, deleteConfirmation.ingredientId!]));
			setIsRefreshingAfterMutation(true);
			isMutating.current = true;

			try {
				await deleteIngredient(deleteConfirmation.ingredientId);

				// Reset infinite scroll to refresh from page 1
				resetInfiniteScroll();

				// Show success toast
				successToast.deleted();
			} finally {
				// Clear deleting state
				setDeletingIds(prev => {
					const next = new Set(prev);
					next.delete(deleteConfirmation.ingredientId!);
					return next;
				});
			}
		}
	};

	const handleCreateNew = () => {
		navigate('/ingredients4c/new');
	};

	const handleSubmit = async (data: CreateIngredient) => {
		setIsRefreshingAfterMutation(true);
		isMutating.current = true;
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

			// Reset infinite scroll to refresh from page 1
			resetInfiniteScroll();
			navigate('/ingredients4c');

			// Show success toast
			if (isEditing) {
				successToast.updated();
			} else {
				successToast.created();
			}
		} finally {
			// Don't clear isRefreshingAfterMutation here - let useEffect do it
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
		// Reset infinite scroll to page 1
		resetInfiniteScroll();
	};

	const handleBulkDelete = async () => {
		if (selection.fstate.isEmpty) return;
		setShowBulkDeleteDialog(true);
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

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// RENDER
	// ═══════════════════════════════════════════════════════════════════════════════════════

	return (
		<Page>
			<PageHeader
				title="Ingredients v4 carousel"
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

			{/* Search Bar */}
			<div className="mb-4 flex flex-col gap-4">
				<div className="relative">
					<div className="mb-2 text-xs font-medium text-muted-foreground">Search</div>
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
							className="absolute top-9 right-2 h-6 w-6 -translate-y-1/2 p-0"
							aria-label="Clear search"
						>
							<X className="h-4 w-4" />
						</Button>
					)}
				</div>
			</div>

			{/* Feature Info (for demo purposes) */}
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
						value: `${carousel.fstate.currentIndex + 1}-${Math.min(
							carousel.fstate.currentIndex + carousel.fstate.itemsPerView,
							totalItemsRef.current
						)} of ${totalItemsRef.current}`,
					},
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

			{/* Carousel Component with Data2Infinite */}
			<Data2Infinite
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
						<IngredientCarousel4c
							data={props.data}
							isLoading={props.isLoading}
							isLoadingMore={false} // TODO: derive from Data2
							hasMore={hasMore}
							error={props.error}
							sorting={sorting}
							searchQuery={searchQuery}
							carousel={carousel}
							fields={visibleOrderedFields}
							onEdit={handleEdit}
							onDelete={handleDelete}
							refreshing={props.isLoading || isRefreshingAfterMutation}
							deleting={isBulkDeleting}
							_deletingIds={deletingIds}
							onSelectionToggle={selection.actions.toggle}
							selectedIds={selection.fstate.selectedIds}
						/>
					);
				}}
			</Data2Infinite>

			{/* Bulk Delete Workflow */}
			<BulkDeleteWorkflow
				open={showBulkDeleteDialog}
				onOpenChange={setShowBulkDeleteDialog}
				selectedIds={selection.fstate.selectedIds}
				onClear={selection.actions.clear}
				onBulkDelete={bulkDeleteIngredients}
				onReload={async () => {
					resetInfiniteScroll();
				}}
				itemTypeName="ingredient"
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

			{/* Ingredient Dialog for Create/Edit */}
			<IngredientDialog
				open={isOpen}
				onClose={() => navigate('/ingredients4c')}
				ingredient={editingIngredient}
				onSubmit={handleSubmit}
				onRefresh={handleRefresh}
				isRefreshing={isDialogRefreshing}
			/>

			{/* Delete Confirmation Dialog */}
			<AlertDialogWrapper
				open={deleteConfirmation.open}
				onOpenChange={open => {
					setDeleteConfirmation({ open, ingredientId: open ? deleteConfirmation.ingredientId : null });
				}}
				title="Delete Ingredient"
				description="Are you sure you want to delete this ingredient? This action cannot be undone."
				confirmLabel="Delete"
				cancelLabel="Cancel"
				variant="danger"
				onConfirm={handleDeleteConfirm}
			/>
		</Page>
	);
}
