/**
 * ===========================================================================================
 * INGREDIENT TABLE2 - Domain Component
 * ===========================================================================================
 *
 * Pure presentation table component for displaying ingredients.
 * Built on top of the headless Table2 component with ingredient-specific configuration.
 *
 * Key features:
 * - Reuses Table2 for presentation logic
 * - Defines ingredient-specific columns
 * - Handles ingredient-specific actions (edit, delete)
 * - Implements QueryResultDisplayerProps contract (via Table2)
 *
 * This component receives data and state from Data2 shell via props injection.
 *
 * ===========================================================================================
 */
import { Table2, type Table2Column, type Table2Props } from '@framework/components2/table/Table2';
import { Button } from '@framework/components/primitives/Button';
import { formatDate } from '@framework/utils/formatting/DateFormat';
import type { Ingredient } from '@shared/api/ingredients.contract';
import { Pencil, Trash2 } from 'lucide-react';

/**
 * Column definitions for ingredient table (Table2 compatible)
 * Exported as single source of truth for column configuration
 */
export const INGREDIENT_TABLE2_COLUMNS: Table2Column<Ingredient>[] = [
	// ID column
	{
		key: 'id',
		label: 'ID',
		render: item => <span className="font-mono text-xs text-muted-foreground">{item.id}</span>,
		defaultVisible: false, // Hidden by default
	},
	// Created column
	{
		key: 'createdAt',
		label: 'Created',
		render: item => {
			const { short, full } = formatDate(item.createdAt);
			return (
				<span className="text-sm text-muted-foreground" title={full}>
					{short}
				</span>
			);
		},
		defaultVisible: false, // Hidden by default
	},
	// Updated column
	{
		key: 'updatedAt',
		label: 'Updated',
		render: item => {
			const { short, full } = formatDate(item.updatedAt);
			return (
				<span className="text-sm text-muted-foreground" title={full}>
					{short}
				</span>
			);
		},
		defaultVisible: false, // Hidden by default
	},
	// Name column
	{
		key: 'name',
		label: 'Name',
		render: item => <span className="font-medium">{item.name}</span>,
		canHide: false, // Cannot be hidden (always visible)
		canReorder: false, // Cannot be reordered (always first)
	},
	// Calories column
	{
		key: 'calories',
		label: 'Calories',
		render: item => <span className="tabular-nums">{item.calories}</span>,
		className: 'text-right',
	},
	// Protein column
	{
		key: 'protein',
		label: 'Protein',
		render: item => <span className="tabular-nums">{item.protein}g</span>,
		className: 'text-right',
	},
	// Carbs column
	{
		key: 'carbs',
		label: 'Carbs',
		render: item => <span className="tabular-nums">{item.carbs}g</span>,
		className: 'text-right',
	},
	// Fat column
	{
		key: 'fat',
		label: 'Fat',
		render: item => <span className="tabular-nums">{item.fat}g</span>,
		className: 'text-right',
	},
	// Category column
	{
		key: 'category',
		label: 'Category',
		render: item => <span className="text-muted-foreground">{item.category || '-'}</span>,
	},
];

/**
 * Props for IngredientTable2
 * Extends partial Table2Props to allow Data2 to inject data, loading, error, pagination, sorting
 */
export interface IngredientTable2Props extends Partial<Table2Props<Ingredient>> {
	/** Optional column override (for visibility/ordering feature) */
	columns?: Table2Column<Ingredient>[];
	/** Optional edit callback */
	onEdit?: (ingredient: Ingredient) => void;
	/** Optional delete callback */
	onDelete?: (id: string) => void;
	/** Optional refreshing state - from Data2 */
	refreshing?: boolean;
	/** Optional deleting state - for bulk delete blur effect */
	deleting?: boolean;
	/** IDs of items being deleted - for strike-through effect */
	deletingIds?: Set<string>;
	/** Selection toggle callback */
	onSelectionToggle?: (id: string) => void;
	/** Select all callback */
	onSelectAll?: (ids: string[]) => void;
}

/**
 * IngredientTable2 - Domain-specific table component
 *
 * Wraps Table2 with ingredient-specific column definitions and action handlers.
 * Receives injected props from Data2 (data, isLoading, error, pagination, sorting).
 */
export function IngredientTable2({
	columns = INGREDIENT_TABLE2_COLUMNS,
	onEdit,
	onDelete,
	refreshing,
	deleting,
	deletingIds,
	onSelectionToggle,
	onSelectAll,
	...tableProps
}: IngredientTable2Props) {
	// Build actions column if either onEdit or onDelete is provided
	const renderActions =
		onEdit || onDelete
			? (ingredient: Ingredient) => (
					<div className="flex items-center justify-center gap-2">
						{onEdit && (
							<Button
								size="sm"
								variant="ghost"
								onClick={() => onEdit(ingredient)}
								aria-label={`Edit ${ingredient.name}`}
							>
								<Pencil className="h-4 w-4" />
							</Button>
						)}
						{onDelete && (
							<Button
								size="sm"
								variant="destructive"
								onClick={() => onDelete(ingredient.id)}
								aria-label={`Delete ${ingredient.name}`}
							>
								<Trash2 className="h-4 w-4" />
							</Button>
						)}
					</div>
				)
			: undefined;

	return (
		<Table2
			columns={columns}
			getItemId={item => item.id}
			renderActions={renderActions}
			emptyMessage="No ingredients found. Add your first ingredient to get started."
			striped={true}
			rowHeight={40}
			data={tableProps.data ?? []}
			isLoading={tableProps.isLoading ?? false}
			error={tableProps.error ?? null}
			pagination={tableProps.pagination}
			sorting={tableProps.sorting}
			features={tableProps.features}
			refreshing={refreshing}
			deleting={deleting}
			deletingIds={deletingIds}
			onSelectionToggle={onSelectionToggle}
			onSelectAll={onSelectAll}
		/>
	);
}
