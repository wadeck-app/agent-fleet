/
  ===========================================================================================
  INGREDIENT GRID - Grid Display Component
  ===========================================================================================
 
  A pure presentation grid component implementing QueryResultDisplayerProps<Ingredient>.
  Designed for use with the Data shell in the headless composable architecture.
 
  Displays ingredients as cards in a responsive -column grid:
  - Mobile (< px):  column
  - Tablet (px - px):  columns
  - Desktop (≥ px):  columns
 
  Features:
  - Data display using IngredientCard
  - Sort controls with dropdown selector
  - Pagination controls (if pagination feature enabled)
  - Loading state with skeleton cards
  - Empty and error states
  - Refreshing state with blur effect
 
  Usage:
  ```tsx
  <Data fetchData={fetchIngredients} pagination={pagination} sorting={sorting} search={search} cache={cache}>
    <IngredientGrid onEdit={handleEdit} onDelete={handleDelete} />
  </Data>
  ```
 
  ===========================================================================================
 /
import type { TableColumn } from '@framework/components/table/Table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { PageSizeSelector } from '@framework/components/pagination/PageSizeSelector';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardFooter, CardHeader } from '@framework/components/primitives/Card';
import { cn } from '@framework/lib/utils';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import { formatDate } from '@framework/utils/formatting/DateFormat';
import type { Ingredient } from '@shared/api/ingredients.contract';
import { AlertCircle, ArrowDown, ArrowUp, LayoutGrid } from 'lucide-react';

import { IngredientCard } from './IngredientCard';

/
  Field definitions for ingredient grid (reusing TableColumn interface for compatibility)
  Exported as single source of truth for field configuration
 
  Note: 'name' field is NOT included here because it's always displayed in the card header
  and cannot be hidden or reordered
 /
export const INGREDIENT_GRID_FIELDS: TableColumn<Ingredient>[] = [
	// ID field
	{
		key: 'id',
		label: 'ID',
		render: item => item.id,
		// Hidden by default
		defaultVisible: false,
	},
	// Name column
	{
		key: 'name',
		label: 'Name',
		render: item => <span className="font-medium">{item.name}</span>,
		// Cannot be hidden (always visible)
		canHide: false,
		// Cannot be reordered (always first)
		canReorder: false,
	},
	// Category field
	{
		key: 'category',
		label: 'Category',
		render: item => item.category || '-',
		// Visible by default (shown in header subtitle)
		defaultVisible: true,
	},
	// Calories field
	{
		key: 'calories',
		label: 'Calories',
		render: item => `${item.calories}`,
		defaultVisible: true,
	},
	// Protein field
	{
		key: 'protein',
		label: 'Protein',
		render: item => `${item.protein}g`,
		defaultVisible: true,
	},
	// Carbs field
	{
		key: 'carbs',
		label: 'Carbs',
		render: item => `${item.carbs}g`,
		defaultVisible: true,
	},
	// Fat field
	{
		key: 'fat',
		label: 'Fat',
		render: item => `${item.fat}g`,
		defaultVisible: true,
	},
	// Created field
	{
		key: 'createdAt',
		label: 'Created',
		render: item => formatDate(item.createdAt).short,
		defaultVisible: false, // Hidden by default
	},
	// Updated field
	{
		key: 'updatedAt',
		label: 'Updated',
		render: item => formatDate(item.updatedAt).short,
		defaultVisible: false, // Hidden by default
	},
];

/
  Props for IngredientGrid
  Extends QueryResultDisplayerProps to receive injected state from Data
 /
export interface IngredientGridProps extends Partial<QueryResultDisplayerProps<Ingredient>> {
	/ Optional field configuration override (for visibility/ordering feature) /
	fields?: TableColumn<Ingredient>[];
	/ Optional edit callback /
	onEdit?: (ingredient: Ingredient) => void;
	/ Optional delete callback /
	onDelete?: (id: string) => void;
	/ Optional refreshing state - from Data /
	refreshing?: boolean;
	/ Optional deleting state - for bulk delete blur effect /
	deleting?: boolean;
	/ IDs of items being deleted - for strike-through effect /
	_deletingIds?: Set<string>;
	/ Selection toggle callback /
	onSelectionToggle?: (id: string) => void;
	/ Select all callback /
	_onSelectAll?: (ids: string[]) => void;
}

/
  IngredientGrid - Grid display component for ingredients
 
  Implements QueryResultDisplayerProps<Ingredient> contract for Data integration.
 /
export function IngredientGrid({
	data = [],
	isLoading = false,
	error = null,
	pagination,
	sorting,
	features,
	fields = INGREDIENT_GRID_FIELDS,
	refreshing = false,
	deleting = false,
	_deletingIds = new Set(),
	onEdit,
	onDelete,
	onSelectionToggle,
	_onSelectAll,
}: IngredientGridProps) {
	// Log render with blur state
	console.log('[GRID] Render', {
		refreshing,
		deleting,
		blurActive: refreshing || deleting,
		timestamp: performance.now(),
	});

	// Extract selection state from injected features
	const selection = features?.selection;
	const hasSelection = !!selection && !!onSelectionToggle;
	const selectedIds = selection?.selectedIds || new Set<string>();

	// 
	// ERROR STATE
	// 

	if (error && !isLoading) {
		return (
			<div className={`rounded-lg border border-destructive/ bg-destructive/ p-`}>
				<div className="flex items-center gap-">
					<AlertCircle className="h- w- text-destructive" />
					<strong className="text-sm font-semibold text-destructive">Error:</strong>
					<span className="text-sm text-destructive">{error}</span>
				</div>
			</div>
		);
	}

	// 
	// SORT CONTROLS
	// 

	const sortControl = sorting && (
		<div className="mb- flex items-center gap-">
			<span className="text-sm font-medium">Sort by:</span>
			<Select
				value={sorting.sortConfigs[]?.key ?? ''}
				onValueChange={(key: string) => {
					if (key) {
						sorting.onSortChange(key, false);
					}
				}}
			>
				<SelectTrigger className="w-">
					<SelectValue placeholder="Choose field..." />
				</SelectTrigger>
				<SelectContent>
					<SelectItem value="name">Name</SelectItem>
					<SelectItem value="calories">Calories</SelectItem>
					<SelectItem value="protein">Protein</SelectItem>
					<SelectItem value="carbs">Carbs</SelectItem>
					<SelectItem value="fat">Fat</SelectItem>
					<SelectItem value="category">Category</SelectItem>
					<SelectItem value="createdAt">Created Date</SelectItem>
					<SelectItem value="updatedAt">Updated Date</SelectItem>
				</SelectContent>
			</Select>

			{/ Direction toggle button /}
			{sorting.sortConfigs.length >  && (
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						const current = sorting.sortConfigs[];
						if (current) {
							// Toggle direction by clicking again
							sorting.onSortChange(current.key, false);
						}
					}}
					title={`Sort direction: ${sorting.sortConfigs[]?.direction === 'asc' ? 'Ascending' : 'Descending'}`}
				>
					{sorting.sortConfigs[]?.direction === 'asc' ? (
						<ArrowUp className="h- w-" />
					) : (
						<ArrowDown className="h- w-" />
					)}
				</Button>
			)}
		</div>
	);

	// 
	// LOADING STATE - Skeleton Cards
	// 

	if (isLoading && data.length === ) {
		// Use pageSize from injected pagination (now always available via usePropsInjection)
		const skeletonCount = pagination?.pageSize ?? ;
		return (
			<div>
				{sortControl}
				<div
					className={`
       grid grid-cols- gap-
       md:grid-cols-
       lg:grid-cols-
     `}
				>
					{Array.from({ length: skeletonCount }).map((_, idx) => (
						<Card key={idx} className="animate-pulse">
							<CardHeader>
								<div className="h- w-/ rounded bg-muted" />
								<div className="h- w-/ rounded bg-muted" />
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols- gap-">
									{Array.from({ length:  }).map((_, i) => (
										<div key={i} className="space-y-">
											<div className="h- w- rounded bg-muted" />
											<div className="h- w- rounded bg-muted" />
										</div>
									))}
								</div>
								<div className="mt- space-y- border-t pt-">
									<div className="h- w-full rounded bg-muted" />
									<div className="h- w-full rounded bg-muted" />
									<div className="h- w-full rounded bg-muted" />
								</div>
							</CardContent>
							<CardFooter>
								<div className="h- flex- rounded bg-muted" />
								<div className="h- flex- rounded bg-muted" />
							</CardFooter>
						</Card>
					))}
				</div>
			</div>
		);
	}

	// 
	// EMPTY STATE
	// 

	if (data.length ===  && !isLoading) {
		return (
			<div>
				{sortControl}
				<div className="flex flex-col items-center justify-center py- text-center">
					<div className="mb- rounded-full bg-muted p-">
						<LayoutGrid className="h- w- text-muted-foreground" />
					</div>
					<h className="mb- text-lg font-semibold">No ingredients found</h>
					<p className="text-sm text-muted-foreground">
						{features?.search?.query
							? `No results for "${features.search.query}"`
							: 'Add your first ingredient to get started'}
					</p>
				</div>
			</div>
		);
	}

	// 
	// MAIN GRID DISPLAY
	// 

	return (
		<div>
			{/ Sort Controls /}
			{sortControl}

			{/ Grid with refreshing/deleting blur effect /}
			<div
				className={cn(
					`
       grid grid-cols- gap- transition-all duration-
       md:grid-cols-
       lg:grid-cols-
     `,
					(refreshing || deleting) && 'pointer-events-none opacity- blur-sm'
				)}
			>
				{data.map(ingredient => (
					<IngredientCard
						key={ingredient.id}
						ingredient={ingredient}
						fields={fields}
						onEdit={onEdit}
						onDelete={onDelete}
						selectable={hasSelection}
						isSelected={selectedIds.has(ingredient.id)}
						onToggleSelection={onSelectionToggle}
					/>
				))}
			</div>

			{/ Pagination Controls /}
			{pagination && (
				<div className="mt- flex items-center justify-between">
					{/ Items count /}
					<div className="text-sm text-muted-foreground">
						Showing {(pagination.currentPage - )  pagination.pageSize + } to{' '}
						{Math.min(pagination.currentPage  pagination.pageSize, pagination.totalItems)} of{' '}
						{pagination.totalItems} items
					</div>

					{/ Controls /}
					<div className="flex items-center gap-">
						<PageSizeSelector
							value={pagination.pageSize}
							onChange={pagination.onPageSizeChange}
							options={pagination.pageSizeOptions}
							size="sm"
						/>
						<div className="text-sm text-muted-foreground">
							Page {pagination.currentPage} of {pagination.totalPages}
						</div>
						<Pagination
							currentPage={pagination.currentPage}
							totalPages={pagination.totalPages}
							onPageChange={pagination.onPageChange}
						/>
					</div>
				</div>
			)}
		</div>
	);
}
