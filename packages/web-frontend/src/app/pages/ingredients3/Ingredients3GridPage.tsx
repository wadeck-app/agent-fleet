import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Data2 } from '@framework/components2/data/Data2';
import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { useColumnOrder } from '@framework/components/columns/useColumnOrder';
import { useColumnVisibility } from '@framework/components/columns/useColumnVisibility';
import { Input } from '@framework/components/forms/Input';
import { Page } from '@framework/components/layout/Page';
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
import { Plus, RefreshCw, Trash2, X } from 'lucide-react';

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
	// DEBOUNCE - Delay search queries to avoid excessive requests
	// ═══════════════════════════════════════════════════════════════════════════════════════
	// User types → 300ms delay → query updates → fetch triggers
	// This prevents a fetch on every keystroke

	const debouncedSearchQuery = useDebounce(search.fstate.query, 300);

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

	// Bulk delete dialog state
	const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
	// Track IDs being deleted (for strike-through visual feedback)
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
	// Track if bulk delete is in progress (for blur effect)
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	// Track if we're refreshing after a mutation (delete/update/create)
	// This keeps the blur effect active during mutation + subsequent refresh
	const [isRefreshingAfterMutation, setIsRefreshingAfterMutation] = useState(false);
	// Track if we're waiting for a refresh to complete after a mutation
	const isMutating = useRef(false);
	const _prevCacheIsRefreshing = useRef(false);

	// Clear isRefreshingAfterMutation and isBulkDeleting when the data changes (refresh completed)
	// This prevents the "flash" where blur disappears between delete and refresh
	useEffect(() => {
		console.log('[DELETE] useEffect - ingredients changed', {
			isMutating: isMutating.current,
			ingredientsCount: ingredients.length,
			timestamp: performance.now(),
		});

		// If we were mutating, and ingredients changed (refresh completed)
		if (isMutating.current && ingredients.length > 0) {
			console.log('[DELETE] useEffect - clearing mutation flags', {
				timestamp: performance.now(),
			});
			isMutating.current = false;
			setIsRefreshingAfterMutation(false);
			setIsBulkDeleting(false);
			setDeletingIds(new Set()); // Also clear deletingIds for bulk delete
		}
	}, [ingredients]);

	// Dialog state management using URL routing
	const { isOpen, editingItem: editingIngredient } = useRoutedDialog({
		mode,
		id,
		items: ingredients,
		findItem: (items, id) => items.find(i => i.id === id),
		onNavigateBack: () => navigate('/ingredients3'),
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
		navigate(`/ingredients3/${ingredient.id}/edit`);
	};

	const handleDelete = (id: string) => {
		console.log('[DELETE] handleDelete called, opening confirmation dialog', {
			id,
			timestamp: performance.now(),
		});
		setDeleteConfirmation({
			open: true,
			ingredientId: id,
		});
	};

	const handleDeleteConfirm = async () => {
		console.log('[DELETE] handleDeleteConfirm called', {
			ingredientId: deleteConfirmation.ingredientId,
			hasId: !!deleteConfirmation.ingredientId,
			timestamp: performance.now(),
		});

		if (deleteConfirmation.ingredientId) {
			console.log('[DELETE] 1. Starting delete process', {
				id: deleteConfirmation.ingredientId,
				timestamp: performance.now(),
			});

			// Mark as deleting for strike-through effect
			setDeletingIds(prev => new Set([...prev, deleteConfirmation.ingredientId!]));
			// Start refreshing state before mutation (blur effect active during delete + refresh)
			setIsRefreshingAfterMutation(true);
			// Mark that we're in mutation mode (useEffect will clear the flag when refresh completes)
			isMutating.current = true;

			console.log('[DELETE] 2. States set (deletingIds + isRefreshingAfterMutation + isMutating)', {
				timestamp: performance.now(),
			});

			try {
				console.log('[DELETE] 3. Starting deleteIngredient API call', {
					timestamp: performance.now(),
				});
				await deleteIngredient(deleteConfirmation.ingredientId);
				console.log('[DELETE] 4. Delete completed, starting refresh', {
					timestamp: performance.now(),
				});

				// Trigger Data2 refresh via cache control
				await cache.actions.refresh();
				console.log('[DELETE] 5. Refresh triggered (cache ID incremented)', {
					timestamp: performance.now(),
				});

				// Show success toast
				successToast.deleted();
			} finally {
				// Clear deleting state
				setDeletingIds(prev => {
					const next = new Set(prev);
					next.delete(deleteConfirmation.ingredientId!);
					return next;
				});
				// DON'T clear isRefreshingAfterMutation here - let useEffect do it when refresh completes
				console.log('[DELETE] 6. Cleanup done (deletingIds cleared, waiting for refresh to complete)', {
					timestamp: performance.now(),
				});
			}
		}
	};

	const handleCreateNew = () => {
		navigate('/ingredients3/new');
	};

	const handleSubmit = async (data: CreateIngredient) => {
		// Start refreshing state before mutation
		setIsRefreshingAfterMutation(true);
		// Mark that we're in mutation mode (useEffect will clear the flag when refresh completes)
		isMutating.current = true;
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
			// DON'T clear isRefreshingAfterMutation here - let useEffect do it when refresh completes
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
		setShowBulkDeleteDialog(true);
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
			{/* Page Header with refresh button next to title */}
			<div className="mb-6 flex items-center justify-between">
				<div className="flex items-center gap-2">
					<h1 className="text-3xl font-bold">Ingredients (Grid)</h1>
					<Button
						onClick={cache.actions.refresh}
						disabled={cache.fstate.isRefreshing}
						variant="ghost"
						size="sm"
						className="h-8 w-8 p-0"
						title={cache.fstate.isRefreshing ? 'Refreshing...' : 'Refresh data'}
					>
						<RefreshCw
							className={`
         h-4 w-4
         ${cache.fstate.isRefreshing ? `animate-spin` : ''}
       `}
						/>
					</Button>
				</div>
				<div className="flex items-center gap-2">
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
				</div>
			</div>

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
				pagination={pagination}
				sorting={sorting}
				search={search}
				cache={cache}
				selection={selection}
				delegateLoadingToChildren={true}
			>
				{injectedProps => (
					<IngredientGrid3
						{...injectedProps}
						fields={visibleOrderedFields}
						onEdit={handleEdit}
						onDelete={handleDelete}
						refreshing={injectedProps.isLoading || isRefreshingAfterMutation}
						deleting={isBulkDeleting}
						_deletingIds={deletingIds}
						onSelectionToggle={selection.actions.toggle}
						_onSelectAll={handleSelectAll}
					/>
				)}
			</Data2>

			{/* Bulk Delete Workflow */}
			<BulkDeleteWorkflow
				open={showBulkDeleteDialog}
				onOpenChange={setShowBulkDeleteDialog}
				selectedIds={selection.fstate.selectedIds}
				onClear={selection.actions.clear}
				onBulkDelete={bulkDeleteIngredients}
				onReload={async () => cache.actions.refresh()}
				itemTypeName="ingredient"
				onDeletingChange={ids => {
					// Only set deletingIds if non-empty (ignore clear - let useEffect do it)
					if (ids.size > 0) {
						setDeletingIds(ids);
					}
				}}
				onBulkDeletingChange={deleting => {
					if (deleting) {
						// Set flag and mark as mutating (useEffect will clear when refresh completes)
						setIsBulkDeleting(true);
						isMutating.current = true;
						console.log('[BULK DELETE] onBulkDeletingChange(true) - isMutating set', {
							timestamp: performance.now(),
						});
					}
					// Ignore deleting=false - let useEffect clear it when refresh completes
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
				open={deleteConfirmation.open}
				onOpenChange={open => {
					console.log('[DELETE] onOpenChange called', { open, timestamp: performance.now() });
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
