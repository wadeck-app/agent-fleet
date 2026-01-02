import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { BulkActionBar } from '@framework/components/advanced/BulkActionBar';
import { ColumnVisibility } from '@framework/components/columns/ColumnVisibility';
import { useColumnOrder } from '@framework/components/columns/useColumnOrder';
import { useColumnVisibility } from '@framework/components/columns/useColumnVisibility';
import { EmptyState } from '@framework/components/feedback/EmptyState';
import { Page } from '@framework/components/layout/Page';
import { PageHeader } from '@framework/components/layout/PageHeader';
import { usePagination } from '@framework/components/pagination/usePagination';
import { Button } from '@framework/components/primitives/Button';
import { useSorting } from '@framework/components/table/useSorting';
import { useTableRefreshing } from '@framework/components/table/useTableRefreshing';
import { useCrudSuccessToast } from '@framework/hooks/useCrudSuccessToast';
import { useErrorToast } from '@framework/hooks/useErrorToast';
import { useRoutedDialog } from '@framework/hooks/useRoutedDialog';
import { toColumnVisibilityDefs } from '@framework/utils/table/ColumnConfig';
import { extractColumnIds } from '@framework/utils/table/ColumnConfig';
import { extractDefaultVisible } from '@framework/utils/table/ColumnConfig';
import { extractCanHideConstraints } from '@framework/utils/table/ColumnConfig';
import type { Ingredient } from '@shared/api/ingredients.contract';
import { Plus, Trash2, Utensils } from 'lucide-react';

import { BulkDeleteWorkflow, IngredientDialog } from '@app/components/domain';

import { INGREDIENT_TABLE_COLUMNS, IngredientTable } from './IngredientTable';
import { useIngredients } from './useIngredients';

/**
 * ===========================================================================================
 * INGREDIENTS PAGE - Clean Architecture
 * ===========================================================================================
 *
 * This page demonstrates proper architectural separation:
 * - Business logic extracted to useIngredients hook
 * - Presentation delegated to feature components
 * - UI components are reusable and generic
 * - Page is compositional only (minimal styling)
 * - Tailwind CSS for all styling
 * - Dialog-based form with URL routing support
 *
 * Data Flow:
 * API → Service → Hook → Page → Components
 *
 * Routing:
 * - /ingredients → List view
 * - /ingredients/new → Create dialog
 * - /ingredients/:id/edit → Edit dialog
 *
 * ===========================================================================================
 */

export function IngredientsPage() {
	const { id, mode } = useParams<{ id?: string; mode?: string }>();
	const navigate = useNavigate();

	// 🧩 Composable hooks - each feature is independent!
	const storageId = 'ingredients-table';
	const pagination = usePagination({ pageSize: 10, storageId: 'ingredients' });
	const sorting = useSorting({ storageId });
	// Use column definitions from IngredientTable as single source of truth
	const columnVisibility = useColumnVisibility(extractColumnIds(INGREDIENT_TABLE_COLUMNS), {
		storageId,
		defaultVisible: extractDefaultVisible(INGREDIENT_TABLE_COLUMNS),
		constraints: extractCanHideConstraints(INGREDIENT_TABLE_COLUMNS),
	});
	// Column ordering with drag & drop
	const columnOrder = useColumnOrder({
		storageId,
		defaultOrder: extractColumnIds(INGREDIENT_TABLE_COLUMNS),
	});
	// Multi-row selection state (persists across pagination during session)
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
	// Bulk delete dialog state
	const [showBulkDeleteDialog, setShowBulkDeleteDialog] = useState(false);
	// Add comment above the target line, not at the end
	// Track IDs being deleted (for strike-through visual feedback)
	const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());
	// Track if bulk delete is in progress (for blur effect)
	const [isBulkDeleting, setIsBulkDeleting] = useState(false);
	// Track if dialog refresh is in progress (for loading state in dialog)
	const [isDialogRefreshing, setIsDialogRefreshing] = useState(false);

	// Convert sort configs to backend format
	const sortBy = sorting.sortConfigs.map(c => c.key).join(',');
	const sortOrder = sorting.sortConfigs.map(c => c.direction).join(',');

	const {
		ingredients,
		loading,
		error,
		pagination: paginationData,
		createIngredient,
		updateIngredient,
		deleteIngredient,
		bulkDeleteIngredients,
		refreshIngredient,
		clearError,
		totalCount,
		loadIngredients,
	} = useIngredients({
		page: pagination.currentPage,
		pageSize: pagination.pageSize,
		sortBy: sortBy || undefined,
		sortOrder: sortOrder || undefined,
	});

	// Track refreshing state for blur effect
	const isRefreshing = useTableRefreshing(
		{
			page: pagination.currentPage,
			pageSize: pagination.pageSize,
			sortBy,
			sortOrder,
		},
		loading
	);

	// Show error as toast automatically
	useErrorToast({ error, clearError });

	// Success toast helper
	const successToast = useCrudSuccessToast('ingredient');

	// Handle URL-based dialog routing
	const { isOpen, editingItem: editingIngredient } = useRoutedDialog<Ingredient>({
		mode: mode as 'new' | 'edit' | undefined,
		id,
		items: ingredients,
		findItem: (items, id) => items.find(i => i.id === id),
		onNavigateBack: () => navigate('/ingredients'),
	});

	const handleSubmit = async (data: Parameters<typeof createIngredient>[0]) => {
		const isEditing = !!editingIngredient;
		if (editingIngredient) {
			// Find the latest version from the ingredients array
			const latestIngredient = ingredients.find(i => i.id === editingIngredient.id);
			const version = latestIngredient?.version ?? editingIngredient.version;
			await updateIngredient(editingIngredient.id, { ...data, version });
		} else {
			await createIngredient(data);
		}
		navigate('/ingredients');

		// Show success toast
		if (isEditing) {
			successToast.updated();
		} else {
			successToast.created();
		}
	};

	const handleRefresh = async () => {
		if (editingIngredient) {
			setIsDialogRefreshing(true);
			try {
				await refreshIngredient(editingIngredient.id);
			} finally {
				setIsDialogRefreshing(false);
			}
		}
	};

	const handleEdit = (ingredient: Ingredient) => {
		navigate(`/ingredients/${ingredient.id}/edit`);
	};

	const handleDelete = async (id: string) => {
		// Add comment above the target line, not at the end
		// Mark item as deleting for visual feedback (strike-through)
		setDeletingIds(prev => new Set([...prev, id]));
		try {
			await deleteIngredient(id);
			// Show success toast
			successToast.deleted();
		} finally {
			// Add comment above the target line, not at the end
			// Clear deleting state after deletion completes
			setDeletingIds(prev => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
		}
	};

	const handleNewIngredient = () => {
		navigate('/ingredients/new');
	};

	const handleBulkDelete = async () => {
		if (selectedIds.size === 0) return;
		setShowBulkDeleteDialog(true);
	};

	// Current params for reload after bulk delete
	const currentParams = {
		page: pagination.currentPage,
		pageSize: pagination.pageSize,
		sortBy: sortBy || undefined,
		sortOrder: sortOrder || undefined,
	};

	if (loading && !ingredients.length) {
		return (
			<Page>
				<PageHeader
					title="Ingredients"
					badge={totalCount}
					action={
						<>
							<ColumnVisibility
								columns={toColumnVisibilityDefs(INGREDIENT_TABLE_COLUMNS)}
								visibleColumns={columnVisibility.visibleColumns}
								defaultVisible={new Set(extractDefaultVisible(INGREDIENT_TABLE_COLUMNS))}
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
								defaultOrder={extractColumnIds(INGREDIENT_TABLE_COLUMNS)}
								onReorderColumns={columnOrder.reorderColumns}
								isColumnModifiedOrder={columnOrder.isColumnModified}
								onResetColumnOrder={columnOrder.resetColumn}
							/>
							<Button onClick={handleNewIngredient}>
								<Plus />
								Add Ingredient
							</Button>
						</>
					}
				/>
				<IngredientTable
					storageId={storageId}
					ingredients={[]}
					onEdit={handleEdit}
					onDelete={handleDelete}
					pagination={
						paginationData
							? {
									currentPage: paginationData.page,
									totalPages: paginationData.totalPages,
									totalItems: paginationData.total,
									onPageChange: pagination.setPage,
									pageSize: pagination.pageSize,
									onPageSizeChange: pagination.setPageSize,
									pageSizeOptions: [5, 10, 20, 50],
								}
							: undefined
					}
					sorting={{
						sortConfigs: sorting.sortConfigs,
						onSortChange: sorting.handleSort,
					}}
					visibleColumns={columnVisibility.visibleColumns}
					columnOrder={columnOrder.columnOrder}
					initialLoading={true}
					selectable={true}
					selectedIds={selectedIds}
					onSelectionChange={setSelectedIds}
					deletingIds={deletingIds}
				/>
			</Page>
		);
	}

	return (
		<>
			<Page>
				<PageHeader
					title="Ingredients"
					badge={totalCount}
					action={
						<>
							<ColumnVisibility
								columns={toColumnVisibilityDefs(INGREDIENT_TABLE_COLUMNS)}
								visibleColumns={columnVisibility.visibleColumns}
								defaultVisible={new Set(extractDefaultVisible(INGREDIENT_TABLE_COLUMNS))}
								onToggle={columnVisibility.toggleColumn}
								onReset={() => {
									columnVisibility.resetColumns();
									columnOrder.resetOrder();
								}}
								onShowAll={columnVisibility.showAll}
								onHideAll={columnVisibility.hideAll}
								// Phase 2: Hook functions for improved separation of concerns
								isColumnModified={columnVisibility.isColumnModified}
								onResetColumn={columnVisibility.resetColumn}
								// Column ordering (enables drag & drop)
								columnOrder={columnOrder.columnOrder}
								defaultOrder={extractColumnIds(INGREDIENT_TABLE_COLUMNS)}
								onReorderColumns={columnOrder.reorderColumns}
								isColumnModifiedOrder={columnOrder.isColumnModified}
								onResetColumnOrder={columnOrder.resetColumn}
							/>
							<Button onClick={handleNewIngredient}>
								<Plus />
								Add Ingredient
							</Button>
						</>
					}
				/>

				{/* Content */}
				{ingredients.length === 0 ? (
					<EmptyState
						icon={<Utensils className="size-16" />}
						title="No ingredients yet"
						description="Start building your ingredient database by adding your first ingredient."
						action={{
							label: 'Add First Ingredient',
							onClick: handleNewIngredient,
						}}
					/>
				) : (
					<>
						{/* Bulk Action Bar */}
						{selectedIds.size > 0 && (
							<BulkActionBar
								selectionCount={selectedIds.size}
								selectedLabel={`${selectedIds.size} ingredient(s) selected`}
								onCancel={() => setSelectedIds(new Set())}
								variant="light"
							>
								<Button onClick={handleBulkDelete} variant="destructive" size="sm">
									<Trash2 className="mr-2 size-4" />
									Delete
								</Button>
							</BulkActionBar>
						)}

						<IngredientTable
							storageId={storageId}
							ingredients={ingredients}
							onEdit={handleEdit}
							onDelete={handleDelete}
							pagination={
								paginationData
									? {
											currentPage: paginationData.page,
											totalPages: paginationData.totalPages,
											totalItems: paginationData.total,
											onPageChange: pagination.setPage,
											pageSize: pagination.pageSize,
											onPageSizeChange: pagination.setPageSize,
											pageSizeOptions: [5, 10, 20, 50],
										}
									: undefined
							}
							sorting={{
								sortConfigs: sorting.sortConfigs,
								onSortChange: sorting.handleSort,
							}}
							visibleColumns={columnVisibility.visibleColumns}
							columnOrder={columnOrder.columnOrder}
							refreshing={isRefreshing}
							deleting={isBulkDeleting}
							selectable={true}
							selectedIds={selectedIds}
							onSelectionChange={setSelectedIds}
							deletingIds={deletingIds}
						/>
					</>
				)}
			</Page>

			{/* Bulk Delete Workflow */}
			<BulkDeleteWorkflow
				open={showBulkDeleteDialog}
				onOpenChange={setShowBulkDeleteDialog}
				selectedIds={selectedIds}
				onClear={() => setSelectedIds(new Set())}
				onBulkDelete={bulkDeleteIngredients}
				onReload={() => loadIngredients(currentParams)}
				itemTypeName="ingredient"
				onDeletingChange={setDeletingIds}
				onBulkDeletingChange={setIsBulkDeleting}
			/>

			<IngredientDialog
				open={isOpen}
				onClose={() => navigate('/ingredients')}
				ingredient={editingIngredient}
				onSubmit={handleSubmit}
				onRefresh={handleRefresh}
				isRefreshing={isDialogRefreshing}
			/>
		</>
	);
}
