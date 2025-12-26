/**
 * ===========================================================================================
 * INGREDIENT GRID3 - Grid Display Component
 * ===========================================================================================
 *
 * A pure presentation grid component implementing QueryResultDisplayerProps<Ingredient>.
 * Designed for use with the Data2 shell in the headless composable architecture.
 *
 * Displays ingredients as cards in a responsive 3-column grid:
 * - Mobile (< 768px): 1 column
 * - Tablet (768px - 1024px): 2 columns
 * - Desktop (≥ 1024px): 3 columns
 *
 * Features:
 * - Data display using IngredientCard3
 * - Sort controls with dropdown selector
 * - Sort indicator bar showing active sorts
 * - Pagination controls (if pagination feature enabled)
 * - Loading state with skeleton cards
 * - Empty and error states
 * - Refreshing state with blur effect
 *
 * Usage:
 * ```tsx
 * <Data2 fetchData={fetchIngredients} pagination={pagination} sorting={sorting} search={search} cache={cache}>
 *   <IngredientGrid3 onEdit={handleEdit} onDelete={handleDelete} />
 * </Data2>
 * ```
 *
 * ===========================================================================================
 */
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { PageSizeSelector } from '@framework/components/pagination/PageSizeSelector';
import { Pagination } from '@framework/components/pagination/Pagination';
import { Badge } from '@framework/components/primitives/Badge';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardFooter, CardHeader } from '@framework/components/primitives/Card';
import { cn } from '@framework/lib/utils';
import type { QueryResultDisplayerProps } from '@framework/types/QueryResultDisplayerContract';
import type { Ingredient } from '@shared/api/ingredients.contract';
import { AlertCircle, ArrowDown, ArrowUp, LayoutGrid, RefreshCw } from 'lucide-react';

import { IngredientCard3 } from './IngredientCard3';

/**
 * Props for IngredientGrid3
 * Extends QueryResultDisplayerProps to receive injected state from Data2
 */
export interface IngredientGrid3Props extends Partial<QueryResultDisplayerProps<Ingredient>> {
	/** Optional edit callback */
	onEdit?: (ingredient: Ingredient) => void;
	/** Optional delete callback */
	onDelete?: (id: string) => void;
	/** Optional refreshing state - from Data2 */
	refreshing?: boolean;
}

/**
 * IngredientGrid3 - Grid display component for ingredients
 *
 * Implements QueryResultDisplayerProps<Ingredient> contract for Data2 integration.
 */
export function IngredientGrid3({
	data = [],
	isLoading = false,
	error = null,
	pagination,
	sorting,
	features,
	refreshing = false,
	onEdit,
	onDelete,
}: IngredientGrid3Props) {
	// ═══════════════════════════════════════════════════════════════════════════════════════
	// ERROR STATE
	// ═══════════════════════════════════════════════════════════════════════════════════════

	if (error && !isLoading) {
		return (
			<div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
				<div className="flex items-center gap-2">
					<AlertCircle className="h-5 w-5 text-destructive" />
					<strong className="text-sm font-semibold text-destructive">Error:</strong>
					<span className="text-sm text-destructive">{error}</span>
				</div>
			</div>
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// SORT CONTROLS
	// ═══════════════════════════════════════════════════════════════════════════════════════

	const sortControl = sorting && (
		<div className="mb-4 flex items-center gap-2">
			<span className="text-sm font-medium">Sort by:</span>
			<Select
				value={sorting.sortConfigs[0]?.key ?? ''}
				onValueChange={(key: string) => {
					if (key) {
						sorting.onSortChange(key, false);
					}
				}}
			>
				<SelectTrigger className="w-48">
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

			{/* Direction toggle button */}
			{sorting.sortConfigs.length > 0 && (
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						const current = sorting.sortConfigs[0];
						if (current) {
							// Toggle direction by clicking again
							sorting.onSortChange(current.key, false);
						}
					}}
					title={`Sort direction: ${sorting.sortConfigs[0]?.direction === 'asc' ? 'Ascending' : 'Descending'}`}
				>
					{sorting.sortConfigs[0]?.direction === 'asc' ? (
						<ArrowUp className="h-4 w-4" />
					) : (
						<ArrowDown className="h-4 w-4" />
					)}
				</Button>
			)}
		</div>
	);

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// SORT INDICATOR BAR
	// ═══════════════════════════════════════════════════════════════════════════════════════

	const sortIndicator = sorting && sorting.sortConfigs.length > 0 && (
		<div className="mb-4 flex items-center gap-2 rounded-lg border border-border bg-muted/50 p-3">
			<span className="text-sm font-medium">Sorted by:</span>
			<div className="flex flex-wrap gap-2">
				{sorting.sortConfigs.map((config, idx) => (
					<Badge key={config.key} variant="secondary" className="gap-1">
						<span className="capitalize">{config.key}</span>
						{config.direction === 'asc' ? (
							<ArrowUp className="h-3 w-3" />
						) : (
							<ArrowDown className="h-3 w-3" />
						)}
						{sorting.sortConfigs.length > 1 && (
							<span className="ml-1 rounded-full bg-primary/20 px-1.5 text-xs">{idx + 1}</span>
						)}
					</Badge>
				))}
			</div>
			<Button
				variant="ghost"
				size="sm"
				onClick={() => {
					// Clear all sorts by toggling primary sort twice
					const primaryKey = sorting.sortConfigs[0]?.key;
					if (primaryKey) {
						sorting.onSortChange(primaryKey, false);
						sorting.onSortChange(primaryKey, false);
					}
				}}
				className="ml-auto"
			>
				Clear Sort
			</Button>
		</div>
	);

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// LOADING STATE - Skeleton Cards
	// ═══════════════════════════════════════════════════════════════════════════════════════

	if (isLoading && data.length === 0) {
		const skeletonCount = pagination?.pageSize ?? 9;
		return (
			<div>
				{sortControl}
				<div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
					{Array.from({ length: skeletonCount }).map((_, idx) => (
						<Card key={idx} className="animate-pulse">
							<CardHeader>
								<div className="h-6 w-3/4 rounded bg-muted" />
								<div className="h-4 w-1/2 rounded bg-muted" />
							</CardHeader>
							<CardContent>
								<div className="grid grid-cols-2 gap-3">
									{Array.from({ length: 4 }).map((_, i) => (
										<div key={i} className="space-y-2">
											<div className="h-3 w-16 rounded bg-muted" />
											<div className="h-5 w-12 rounded bg-muted" />
										</div>
									))}
								</div>
								<div className="mt-4 space-y-2 border-t pt-3">
									<div className="h-3 w-full rounded bg-muted" />
									<div className="h-3 w-full rounded bg-muted" />
									<div className="h-3 w-full rounded bg-muted" />
								</div>
							</CardContent>
							<CardFooter>
								<div className="h-9 flex-1 rounded bg-muted" />
								<div className="h-9 flex-1 rounded bg-muted" />
							</CardFooter>
						</Card>
					))}
				</div>
			</div>
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// EMPTY STATE
	// ═══════════════════════════════════════════════════════════════════════════════════════

	if (data.length === 0 && !isLoading) {
		return (
			<div>
				{sortControl}
				<div className="flex flex-col items-center justify-center py-12 text-center">
					<div className="mb-4 rounded-full bg-muted p-4">
						<LayoutGrid className="h-8 w-8 text-muted-foreground" />
					</div>
					<h3 className="mb-2 text-lg font-semibold">No ingredients found</h3>
					<p className="text-sm text-muted-foreground">
						{features?.search?.query
							? `No results for "${features.search.query}"`
							: 'Add your first ingredient to get started'}
					</p>
				</div>
			</div>
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// MAIN GRID DISPLAY
	// ═══════════════════════════════════════════════════════════════════════════════════════

	return (
		<div>
			{/* Sort Controls */}
			{sortControl}

			{/* Sort Indicator Bar */}
			{sortIndicator}

			{/* Grid with refreshing overlay */}
			<div className="relative">
				<div
					className={cn(
						'grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3',
						refreshing && 'pointer-events-none opacity-50'
					)}
				>
					{data.map(ingredient => (
						<IngredientCard3
							key={ingredient.id}
							ingredient={ingredient}
							onEdit={onEdit}
							onDelete={onDelete}
						/>
					))}
				</div>

				{/* Refreshing spinner overlay */}
				{refreshing && (
					<div className="absolute inset-0 flex items-center justify-center">
						<div className="rounded-lg bg-background/80 p-4 shadow-lg">
							<RefreshCw className="h-6 w-6 animate-spin" />
						</div>
					</div>
				)}
			</div>

			{/* Pagination Controls */}
			{pagination && (
				<div className="mt-6 flex items-center justify-between">
					{/* Items count */}
					<div className="text-sm text-muted-foreground">
						Showing {(pagination.currentPage - 1) * pagination.pageSize + 1} to{' '}
						{Math.min(pagination.currentPage * pagination.pageSize, pagination.totalItems)} of{' '}
						{pagination.totalItems} items
					</div>

					{/* Controls */}
					<div className="flex items-center gap-4">
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
