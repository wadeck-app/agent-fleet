import { CrudTable, type CrudTableConfig } from '@framework/components/advanced/CrudTable';
import { type TablePaginationConfig } from '@framework/components/table/Table';
import { type TableSortingConfig } from '@framework/components/table/Table';
import { ColumnHelpers } from '@framework/utils/table/ColumnHelpers';
import { defineColumns } from '@framework/utils/table/ColumnHelpers';
import type { Ingredient } from '@shared/api/ingredients.contract';

/**
 * ===========================================================================================
 * INGREDIENT TABLE - Feature Component
 * ===========================================================================================
 *
 * Pure presentation component for displaying ingredients in a table.
 * - Receives data via props
 * - Emits events via callbacks
 * - No direct API calls
 * - Focused on domain presentation
 * - Uses CrudTable for consistent CRUD operations
 *
 * ===========================================================================================
 */

export interface IngredientTableProps {
	/** Unique identifier for persistent state (sorting, visibility, etc.) */
	storageId: string;
	ingredients: Ingredient[];
	onDelete: (id: string) => void;
	onEdit?: (ingredient: Ingredient) => void;
	pagination?: TablePaginationConfig;
	sorting?: TableSortingConfig;
	visibleColumns?: Set<string>;
	/** Column order (array of column keys) for reordering */
	columnOrder?: string[];
	/** Initial loading state (show skeleton rows on first load) */
	initialLoading?: boolean;
	refreshing?: boolean;
	deleting?: boolean;
	/** Selection props */
	selectable?: boolean;
	selectedIds?: Set<string>;
	onSelectionChange?: (selectedIds: Set<string>) => void;
	/** IDs being deleted (for strike-through styling) */
	deletingIds?: Set<string>;
}

// Export column definitions as single source of truth for column configuration
export const INGREDIENT_TABLE_COLUMNS = defineColumns<Ingredient>([
	...ColumnHelpers.metadata(),
	ColumnHelpers.string('name', 'Name', { fontWeight: 'medium', defaultVisible: true }),
	ColumnHelpers.numeric('calories', 'Calories', { align: 'right', defaultVisible: true }),
	ColumnHelpers.numeric('protein', 'Protein', {
		suffix: 'g',
		align: 'right',
		defaultVisible: true,
	}),
	ColumnHelpers.numeric('carbs', 'Carbs', { suffix: 'g', align: 'right', defaultVisible: true }),
	ColumnHelpers.numeric('fat', 'Fat', { suffix: 'g', align: 'right', defaultVisible: true }),
	ColumnHelpers.string('category', 'Category', {
		textColor: 'text-muted-foreground',
		defaultVisible: true,
	}),
]);

const INGREDIENT_TABLE_CONFIG: CrudTableConfig<Ingredient> = {
	getItemDisplayName: ingredient => ingredient.name,
	emptyMessage: 'No ingredients found. Add your first ingredient to get started.',
	itemTypeName: 'ingredient',
	editButtonVariant: 'ghost',
};

export function IngredientTable({
	storageId,
	ingredients,
	onDelete,
	onEdit,
	pagination,
	sorting,
	visibleColumns,
	columnOrder,
	initialLoading,
	refreshing,
	deleting,
	selectable,
	selectedIds,
	onSelectionChange,
	deletingIds,
}: IngredientTableProps) {
	return (
		<CrudTable
			storageId={storageId}
			data={ingredients}
			columns={INGREDIENT_TABLE_COLUMNS}
			config={INGREDIENT_TABLE_CONFIG}
			onDelete={onDelete}
			onEdit={onEdit}
			pagination={pagination}
			sorting={sorting}
			visibleColumns={visibleColumns}
			columnOrder={columnOrder}
			initialLoading={initialLoading}
			refreshing={refreshing}
			deleting={deleting}
			selectable={selectable}
			selectedIds={selectedIds}
			onSelectionChange={onSelectionChange}
			deletingIds={deletingIds}
		/>
	);
}
