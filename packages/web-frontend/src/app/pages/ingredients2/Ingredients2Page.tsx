import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Data2 } from '@framework/components2/data/Data2';
import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
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
import { useRoutedDialog } from '@framework/hooks/useRoutedDialog';
import type { CreateIngredient, Ingredient, IngredientsListQuery } from '@shared/api/ingredients.contract';
import { Plus, RefreshCw, Trash2, X } from 'lucide-react';

import { BulkDeleteWorkflow, IngredientDialog } from '@app/components/domain';

import { ingredientsService } from '../ingredients/IngredientsService';
import { useIngredientsCrud } from '../ingredients/useIngredientsCrud';
import { IngredientTable2 } from './IngredientTable2';

const STORAGE_ID = 'ingredients2' as const;

export function Ingredients2Page() {
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
	const { createIngredient, updateIngredient, deleteIngredient, refreshIngredient, bulkDeleteIngredients } =
		useIngredientsCrud();

	// Bulk delete dialog state
	const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
	// Track IDs being deleted (for strike-through visual feedback)
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
	// Track if bulk delete is in progress (for blur effect)
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);

	// Dialog state management using URL routing
	const { isOpen, editingItem: editingIngredient } = useRoutedDialog({
		mode,
		id,
		items: ingredients,
		findItem: (items, id) => items.find(i => i.id === id),
		onNavigateBack: () => navigate('/ingredients2'),
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
		navigate(`/ingredients2/${ingredient.id}/edit`);
	};

	const handleDelete = (id: string) => {
		setDeleteConfirmation({
			open: true,
			ingredientId: id,
		});
	};

	const handleDeleteConfirm = async () => {
		if (deleteConfirmation.ingredientId) {
			await deleteIngredient(deleteConfirmation.ingredientId);
			// Trigger Data2 refresh via cache control
			await cache.actions.refresh();
		}
	};

	const handleCreateNew = () => {
		navigate('/ingredients2/new');
	};

	const handleSubmit = async (data: CreateIngredient) => {
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
					<h1 className="text-3xl font-bold">Ingredients (v2)</h1>
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
				<Button onClick={handleCreateNew}>
					<Plus className="mr-2 h-4 w-4" />
					Add Ingredient
				</Button>
			</div>

			{/* Search & Filter Bar */}
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
				<IngredientTable2
					onEdit={handleEdit}
					onDelete={handleDelete}
					onSelectionToggle={selection.actions.toggle}
					onSelectAll={handleSelectAll}
				/>
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
				onDeletingChange={setDeletingIds}
				onBulkDeletingChange={setIsBulkDeleting}
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
				open={deleteConfirmation.open}
				onOpenChange={open => setDeleteConfirmation({ open, ingredientId: null })}
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
