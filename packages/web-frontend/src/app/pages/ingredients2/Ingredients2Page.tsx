/**
 * ===========================================================================================
 * INGREDIENTS2 PAGE - Headless Composable Architecture
 * ===========================================================================================
 *
 * This page demonstrates the headless composable architecture with independent features:
 * - Each feature (pagination, sorting, search, filter, cache) is a headless hook
 * - Features are composed via buildQuery() and orchestrated by Data2
 * - UI components receive injected props from Data2
 * - Features can be added/removed without affecting each other (antifragile)
 *
 * Architecture pattern:
 * 1. Headless hooks return: { state, fstate, actions, fillQuery() }
 * 2. Data2 composes queries and manages fetch lifecycle
 * 3. Table2 receives data + feature callbacks via props injection
 * 4. Page wires features together but remains minimal
 *
 * Data Flow:
 * Hooks → buildQuery() → Data2 → fetchData → Table2 (injected props)
 *
 * Key differences from v1 (IngredientsPage):
 * - No useIngredients() for list data (Data2 handles it)
 * - Simpler hooks with stable references (fstate)
 * - Features are truly independent
 * - Explicit composition instead of implicit coupling
 *
 * ===========================================================================================
 */
import { useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

import { Data2 } from '@framework/components2/data/Data2';
import { Input } from '@framework/components/forms/Input';
import { Page } from '@framework/components/layout/Page';
import { Button } from '@framework/components/primitives/Button';
import { useCacheControl2 } from '@framework/hooks2/useCacheControl2';
import { useDebounce } from '@framework/hooks2/useDebounce';
import { usePagination2 } from '@framework/hooks2/usePagination2';
import { useSimpleSearch } from '@framework/hooks2/useSimpleSearch';
import { useSorting2 } from '@framework/hooks2/useSorting2';
import type { Ingredient, IngredientsListQuery } from '@shared';
import { Plus, RefreshCw, X } from 'lucide-react';

import { ingredientsService } from '../ingredients/IngredientsService';
import { useIngredients } from '../ingredients/useIngredients';
import { IngredientTable2 } from './IngredientTable2';

const STORAGE_ID = 'ingredients2' as const;

export function Ingredients2Page() {
	const navigate = useNavigate();

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
	const fetchIngredients = useCallback(async (query: IngredientsListQuery) => {
		const response = await ingredientsService.getIngredients({
			page: query.page,
			pageSize: query.pageSize,
			sortBy: query.sortBy,
			sortOrder: query.sortOrder,
			search: query.search, // From simple search
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
	}, []); // No dependencies - ingredientsService is stable

	// ═══════════════════════════════════════════════════════════════════════════════════════
	// ACTIONS - Domain-specific operations
	// ═══════════════════════════════════════════════════════════════════════════════════════

	// Use existing hook for delete functionality (will refactor later to use optimistic updates)
	const { deleteIngredient } = useIngredients({
		page: pagination.fstate.currentPage,
		pageSize: pagination.fstate.pageSize,
	});

	const handleEdit = (ingredient: Ingredient) => {
		navigate(`/ingredients2/${ingredient.id}/edit`);
	};

	const handleDelete = async (id: string) => {
		if (confirm('Delete this ingredient?')) {
			await deleteIngredient(id);
			// Data2 will auto-refresh via dependency tracking
		}
	};

	const handleCreateNew = () => {
		navigate('/ingredients2/new');
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

			{/* Data Shell + Table */}
			<Data2 fetchData={fetchIngredients} pagination={pagination} sorting={sorting} search={search} cache={cache}>
				<IngredientTable2 onEdit={handleEdit} onDelete={handleDelete} />
			</Data2>
		</Page>
	);
}
