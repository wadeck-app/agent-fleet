/**
 * ===========================================================================================
 * INGREDIENT CAROUSEL4C - Infinite Scroll Carousel Display Component
 * ===========================================================================================
 *
 * A pure presentation carousel component with infinite scroll support.
 * Displays ingredients as cards in a horizontal carousel that progressively loads data.
 *
 * Displays ingredients as cards in a carousel with:
 * - 3 cards visible at a time (responsive: mobile 1, tablet 2, desktop 3)
 * - Arrow navigation (previous/next)
 * - Infinite scroll - loads next page automatically when approaching end
 * - Full CRUD support with cards
 * - NO pagination UI (no page numbers, no page size selector)
 *
 * Features:
 * - Data display using IngredientCard4
 * - Embla Carousel integration via useCarousel hook
 * - Sort controls with dropdown selector
 * - Loading state with skeleton cards AND arrows
 * - Empty and error states
 * - Refreshing state with blur effect
 * - Loading indicator at end when fetching more
 *
 * Usage:
 * ```tsx
 * const carousel = useCarousel({ itemsPerView: 3 });
 * const {data, isLoading, isLoadingMore, hasMore} = useInfiniteCarousel({...});
 *
 * <IngredientCarousel4c
 *   data={data}
 *   isLoading={isLoading}
 *   isLoadingMore={isLoadingMore}
 *   hasMore={hasMore}
 *   carousel={carousel}
 *   onEdit={handleEdit}
 *   onDelete={handleDelete}
 * />
 * ```
 *
 * ===========================================================================================
 */
import type { Table2Column } from '@framework/components2/table/Table2';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';
import { Button } from '@framework/components/primitives/Button';
import { Card, CardContent, CardFooter, CardHeader } from '@framework/components/primitives/Card';
import type { SortingContract } from '@framework/hooks2/useSorting2';
import { cn } from '@framework/lib/utils';
import { formatDate } from '@framework/utils/formatting/DateFormat';
import type { Ingredient } from '@shared/api/ingredients.contract';
import { AlertCircle, ArrowDown, ArrowUp, ChevronLeft, ChevronRight, LayoutGrid, Loader2 } from 'lucide-react';

import { IngredientCard4 } from './IngredientCard4';
import type { CarouselContract } from './useCarousel';

/**
 * Field definitions for ingredient carousel (same as grid for consistency)
 * Exported as single source of truth for field configuration
 *
 * Note: 'name' field is NOT included here because it's always displayed in the card header
 * and cannot be hidden or reordered
 */
export const INGREDIENT_CAROUSEL_FIELDS: Table2Column<Ingredient>[] = [
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

/**
 * Props for IngredientCarousel4c
 * Simplified from v4b - no QueryResultDisplayerProps (not using Data2)
 */
export interface IngredientCarousel4cProps {
	/** Data items to display */
	data: Ingredient[];
	/** Initial loading state (first page) */
	isLoading?: boolean;
	/** Loading more pages (subsequent pages) */
	isLoadingMore?: boolean;
	/** Has more pages to load */
	hasMore?: boolean;
	/** Error message */
	error?: string | null;
	/** Sorting contract (optional) */
	sorting?: SortingContract;
	/** Search query (optional, for empty state message) */
	searchQuery?: string;
	/** Carousel feature contract (required) */
	carousel: CarouselContract;
	/** Optional field configuration override (for visibility/ordering feature) */
	fields?: Table2Column<Ingredient>[];
	/** Optional edit callback */
	onEdit?: (ingredient: Ingredient) => void;
	/** Optional delete callback */
	onDelete?: (id: string) => void;
	/** Optional refreshing state */
	refreshing?: boolean;
	/** Optional deleting state - for bulk delete blur effect */
	deleting?: boolean;
	/** IDs of items being deleted - for strike-through effect */
	_deletingIds?: Set<string>;
	/** Selection toggle callback */
	onSelectionToggle?: (id: string) => void;
	/** Selected IDs */
	selectedIds?: Set<string>;
}

/**
 * IngredientCarousel4c - Infinite scroll carousel display component
 */
export function IngredientCarousel4c({
	data = [],
	isLoading = false,
	isLoadingMore = false,
	hasMore = true,
	error = null,
	sorting,
	searchQuery,
	carousel,
	fields = INGREDIENT_CAROUSEL_FIELDS,
	refreshing = false,
	deleting = false,
	_deletingIds = new Set(),
	onEdit,
	onDelete,
	onSelectionToggle,
	selectedIds = new Set(),
}: IngredientCarousel4cProps) {
	// Add comment above the target line, not at the end
	// Log render with blur state
	console.log('[CAROUSEL4C] Render', {
		dataLength: data.length,
		isLoading,
		isLoadingMore,
		hasMore,
		refreshing,
		deleting,
		blurActive: refreshing || deleting,
		timestamp: performance.now(),
	});

	// Selection state
	const hasSelection = !!onSelectionToggle;

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
				value={sorting.fstate.sortConfigs[0]?.key ?? ''}
				onValueChange={(key: string) => {
					if (key) {
						sorting.actions.onSortChange(key, false);
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
			{sorting.fstate.sortConfigs.length > 0 && (
				<Button
					variant="outline"
					size="sm"
					onClick={() => {
						const current = sorting.fstate.sortConfigs[0];
						if (current) {
							// Toggle direction by clicking again
							sorting.actions.onSortChange(current.key, false);
						}
					}}
					title={`Sort direction: ${sorting.fstate.sortConfigs[0]?.direction === 'asc' ? 'Ascending' : 'Descending'}`}
				>
					{sorting.fstate.sortConfigs[0]?.direction === 'asc' ? (
						<ArrowUp className="h-4 w-4" />
					) : (
						<ArrowDown className="h-4 w-4" />
					)}
				</Button>
			)}
		</div>
	);

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// LOADING STATE - Skeleton Cards WITH ARROWS
	// ═══════════════════════════════════════════════════════════════════════════════════════

	if (isLoading && data.length === 0) {
		// Use itemsPerView from carousel
		const skeletonCount = carousel.fstate.itemsPerView;
		return (
			<div>
				{sortControl}

				{/* Carousel Container with arrows */}
				<div className="relative px-12">
					{/* Skeleton grid */}
					<div
						className="
       grid grid-cols-1 gap-6
       md:grid-cols-2
       lg:grid-cols-3
     "
					>
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

					{/* Navigation Arrows - VISIBLE from skeleton state (disabled) */}
					<Button
						variant="outline"
						size="icon"
						className="absolute left-0 top-1/2 z-50 -translate-y-1/2 bg-background shadow-lg hover:bg-accent"
						disabled
						aria-label="Previous slide"
					>
						<ChevronLeft className="h-5 w-5" />
					</Button>
					<Button
						variant="outline"
						size="icon"
						className="absolute right-0 top-1/2 z-50 -translate-y-1/2 bg-background shadow-lg hover:bg-accent"
						disabled
						aria-label="Next slide"
					>
						<ChevronRight className="h-5 w-5" />
					</Button>
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
						{searchQuery ? `No results for "${searchQuery}"` : 'Add your first ingredient to get started'}
					</p>
				</div>
			</div>
		);
	}

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// MAIN CAROUSEL DISPLAY (Infinite Scroll)
	// ═══════════════════════════════════════════════════════════════════════════════════════

	return (
		<div>
			{/* Sort Controls */}
			{sortControl}

			{/* Carousel Container */}
			<div className="relative px-12">
				{/* Embla Carousel Viewport - overflow-hidden to clip slides */}
				<div className="overflow-hidden" ref={carousel.fstate.emblaRef}>
					{/* Embla Container - flex with gap for spacing */}
					<div
						className={cn(
							'flex touch-pan-y',
							(refreshing || deleting) && 'pointer-events-none opacity-50 blur-sm'
						)}
						style={{ marginLeft: '-1rem' }}
					>
						{/* Embla Slides - each slide has fixed width for 3 visible cards */}
						{data.map(ingredient => (
							<div
								key={ingredient.id}
								className="flex-[0_0_33.333%] pl-4"
								style={{
									minWidth: 0,
								}}
							>
								<IngredientCard4
									ingredient={ingredient}
									fields={fields}
									onEdit={onEdit}
									onDelete={onDelete}
									selectable={hasSelection}
									isSelected={selectedIds.has(ingredient.id)}
									onToggleSelection={onSelectionToggle}
								/>
							</div>
						))}

						{/* Loading indicator at end when fetching more */}
						{isLoadingMore && (
							<div className="flex-[0_0_33.333%] pl-4">
								<Card className="flex h-full items-center justify-center">
									<CardContent className="flex flex-col items-center gap-2 py-8">
										<Loader2 className="h-8 w-8 animate-spin text-primary" />
										<p className="text-sm text-muted-foreground">Loading more...</p>
									</CardContent>
								</Card>
							</div>
						)}
					</div>
				</div>

				{/* Navigation Arrows - higher z-index, outside carousel viewport */}
				<Button
					variant="outline"
					size="icon"
					className="absolute left-0 top-1/2 z-50 -translate-y-1/2 bg-background shadow-lg hover:bg-accent"
					onClick={carousel.actions.scrollPrev}
					disabled={!carousel.fstate.canScrollPrev}
					aria-label="Previous slide"
				>
					<ChevronLeft className="h-5 w-5" />
				</Button>
				<Button
					variant="outline"
					size="icon"
					className="absolute right-0 top-1/2 z-50 -translate-y-1/2 bg-background shadow-lg hover:bg-accent"
					onClick={carousel.actions.scrollNext}
					// Disable right arrow when can't scroll OR no more pages to load
					disabled={!carousel.fstate.canScrollNext && !hasMore}
					aria-label="Next slide"
				>
					<ChevronRight className="h-5 w-5" />
				</Button>
			</div>

			{/* V4C: NO Pagination Controls (infinite scroll) */}
			{/* V4C: NO Dot Indicators (infinite scroll) */}
		</div>
	);
}
