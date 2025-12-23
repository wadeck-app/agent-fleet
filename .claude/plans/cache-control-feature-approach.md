# Approche Feature pour le Cache Control

## 🎯 Vision: Pattern Headless Composable

Au lieu d'un `cacheControl` inline, on crée une **feature complète** qui suit le `FeatureContract`:

```typescript
// Approche Inline (❌ Non recommandée)
<Data2
  cacheControl={{ cacheId: refreshCount }}  // ← Spécifique à Data2
  pagination={pagination}
  search={search}
/>

// Approche Feature (✅ Recommandée)
const cache = useCacheControl2();

<Data2
  cache={cache}          // ← Feature composable comme pagination!
  pagination={pagination}
  search={search}
/>
```

---

## 📋 Contrat de Feature: `CacheControlContract`

### Interface (new type contract)

```typescript
// packages/web-frontend/src/framework/types/contracts/CacheControlContract.ts

export interface CacheControlState {
	/** Current cache ID (incremented on refresh) */
	cacheId: number;
	/** Whether a refresh is currently in progress */
	isRefreshing: boolean;
}

export interface CacheControlActions {
	/** Increment cacheId to force refresh */
	refresh: () => void;
	/** Reset cacheId to 0 */
	reset: () => void;
	/** Set cacheId to specific value */
	setCacheId: (id: number) => void;
	/** Mark refresh as in-progress */
	setIsRefreshing: (refreshing: boolean) => void;
}

export interface CacheControlQuery {
	cacheId?: number;
}

/**
 * Cache control feature contract following FeatureContract pattern
 */
export type CacheControlContract = FeatureContract<CacheControlState> & {
	actions: CacheControlActions;
};
```

### Hook Implementation

````typescript
// packages/web-frontend/src/framework/hooks2/useCacheControl2.ts
import { useCallback, useMemo, useState } from 'react';

import type { CacheControlContract } from '@framework/types/contracts';

export interface UseCacheControl2Options {
	/** Initial cache ID (default: 0) */
	initialCacheId?: number;
	/** Whether to include cacheId in query (default: true) */
	enabled?: boolean;
}

/**
 * ===========================================================================================
 * USE CACHE CONTROL2 - Headless Composable Cache Control Feature
 * ===========================================================================================
 *
 * Feature hook for managing cache busting and explicit refresh control.
 * Follows the same pattern as usePagination2, useSearch2, etc.
 *
 * Example usage:
 * ```typescript
 * const cache = useCacheControl2({ enabled: true });
 *
 * // Access state
 * console.log(cache.state.cacheId); // 0
 * console.log(cache.state.isRefreshing); // false
 *
 * // Call actions
 * cache.actions.refresh(); // ← Increment cacheId to force refetch
 *
 * // Get backend query
 * const query = cache.fillQuery(baseQuery);
 *
 * // Use in Data2 shell
 * <Data2 cache={cache} pagination={pagination} search={search}>
 *   <Table2 onRefresh={cache.actions.refresh} />
 * </Data2>
 * ```
 *
 * ===========================================================================================
 */
export function useCacheControl2(options?: UseCacheControl2Options): CacheControlContract {
	const { initialCacheId = 0, enabled = true } = options ?? {};

	// State
	const [cacheId, setCacheId] = useState(initialCacheId);
	const [isRefreshing, setIsRefreshing] = useState(false);

	// State object (current UI state)
	const state = useMemo(
		() => ({
			cacheId,
			isRefreshing,
		}),
		[cacheId, isRefreshing]
	);

	// Frozen state (memoized, stable reference for useEffect deps)
	const fstate = state; // Already memoized via state

	// Actions (all state-modifying functions)
	const actions = useMemo(
		() => ({
			/** Increment cacheId to force refresh */
			refresh: () => {
				setCacheId(prev => prev + 1);
			},

			/** Reset cacheId to initial value */
			reset: () => {
				setCacheId(initialCacheId);
			},

			/** Set cacheId to specific value */
			setCacheId: (id: number) => {
				if (id < 0) return;
				setCacheId(id);
			},

			/** Mark refresh as in-progress */
			setIsRefreshing: (refreshing: boolean) => {
				setIsRefreshing(refreshing);
			},
		}),
		[initialCacheId]
	);

	// Fill backend query parameters
	// Only includes cacheId if enabled
	const fillQuery = useCallback(
		(query: Record<string, unknown>) => {
			if (enabled) {
				query.cacheId = cacheId;
			}
		},
		[cacheId, enabled]
	);

	return {
		state,
		fstate,
		actions,
		fillQuery,
	};
}
````

---

## 🔧 Intégration dans Data2

### Modification de Data2Props

```typescript
// packages/web-frontend/src/framework/components2/data/Data2.tsx

export interface Data2Props<T> {
	fetchData: (query: Record<string, unknown>) => Promise<{
		items: T[];
		pagination?: PaginationData;
	}>;

	// Existing features
	pagination?: FeatureContract<any> | null;
	sorting?: FeatureContract<any> | null;
	search?: FeatureContract<any> | null;
	filter?: FeatureContract<any> | null;

	// ← NEW: Cache control feature
	cache?: FeatureContract<any> | null;

	children: ReactElement<QueryResultDisplayerProps<T>> | ((props: QueryResultDisplayerProps<T>) => ReactNode);
	loadingComponent?: ReactNode;
	errorComponent?: (error: string) => ReactNode;
}
```

### Modification du useEffect

```typescript
export function Data2<T>({
	fetchData,
	pagination,
	sorting,
	search,
	filter,
	cache, // ← NEW
	children,
	loadingComponent,
	errorComponent,
}: Data2Props<T>) {
	// ... existing state ...

	// Compose query from features (including cache)
	const query = useMemo(() => {
		try {
			return buildQuery(pagination, sorting, search, filter, cache) as Record<string, unknown>;
		} catch (err) {
			console.error('Failed to build query:', err);
			throw err;
		}
	}, [pagination, sorting, search, filter, cache]); // ← Add cache to deps

	// useEffect naturally triggers when cache.fillQuery changes (via cacheId)
	useEffect(() => {
		// ... fetch logic ...
	}, [fetchData, query]); // ← query now includes cacheId

	// ... rest of component ...
}
```

---

## 📖 Utilisation dans les pages

### Simple: Bouton Refresh

```typescript
// packages/web-frontend/src/app/pages/ingredients2/Ingredients2Page.tsx

import { useCacheControl2 } from '@framework/hooks2/useCacheControl2';
import { usePagination2 } from '@framework/hooks2/usePagination2';
import { useSearch2 } from '@framework/hooks2/useSearch2';
// ... other imports ...

export function Ingredients2Page() {
  const pagination = usePagination2({
    pageSize: 10,
    storageId: STORAGE_ID,
    initialPage: 1,
  });

  const search = useSearch2({
    paramName: 'q',
    onSearchChange: () => pagination.actions.resetPage(),
  });

  const categoryFilter = useCategoryFilter2({
    categories: AVAILABLE_CATEGORIES,
    storageId: STORAGE_ID,
  });

  // ← NEW: Cache control feature
  const cache = useCacheControl2({ enabled: true });

  const fetchIngredients = useCallback(async (query: IngredientsListQuery) => {
    // ... fetch logic ...
  }, []);

  return (
    <Page>
      <PageHeader
        title="Ingredients (v2)"
        action={
          <>
            <Button onClick={cache.actions.refresh} disabled={cache.state.isRefreshing}>
              {cache.state.isRefreshing ? 'Refreshing...' : '🔄 Refresh'}
            </Button>
            <Button onClick={handleCreateNew}>
              <Plus className="mr-2 h-4 w-4" />
              Add Ingredient
            </Button>
          </>
        }
      />

      {/* Search & Filter Bar */}
      <div className="mb-4 flex flex-col gap-4 sm:flex-row">
        {/* ... existing search/filter UI ... */}
      </div>

      {/* Data Shell with cache feature */}
      <Data2
        fetchData={fetchIngredients}
        pagination={pagination}
        sorting={sorting}
        search={search}
        filter={categoryFilter}
        cache={cache}  // ← Pass cache like any other feature!
      >
        <IngredientTable2 onEdit={handleEdit} onDelete={handleDelete} />
      </Data2>
    </Page>
  );
}
```

### Advanced: Auto-Refresh after Create

```typescript
export function Ingredients2Page() {
	const cache = useCacheControl2({ enabled: true });
	const { deleteIngredient } = useIngredients({
		page: pagination.state.currentPage,
		pageSize: pagination.state.pageSize,
	});

	const handleDelete = async (id: string) => {
		if (confirm('Delete this ingredient?')) {
			cache.actions.setIsRefreshing(true);
			try {
				await deleteIngredient(id);
			} finally {
				cache.actions.setIsRefreshing(false);
				cache.actions.refresh(); // ← Auto-refresh list after delete
			}
		}
	};

	// ... rest of component
}
```

### Advanced: Polling / Auto-Refresh

```typescript
export function Ingredients2Page() {
	const cache = useCacheControl2({ enabled: true });

	// Auto-refresh every 30 seconds
	useEffect(() => {
		const interval = setInterval(() => {
			cache.actions.refresh();
		}, 30000);

		return () => clearInterval(interval);
	}, [cache.actions]);

	// ... rest of component
}
```

---

## 🧪 Tests

### Test Structure

```typescript
// packages/web-frontend/src/framework/hooks2/useCacheControl2.test.ts
import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { useCacheControl2 } from './useCacheControl2';

describe('useCacheControl2', () => {
	describe('contract shape', () => {
		it('should return correct FeatureContract shape', () => {
			const { result } = renderHook(() => useCacheControl2());

			expect(result.current).toHaveProperty('state');
			expect(result.current).toHaveProperty('fstate');
			expect(result.current).toHaveProperty('actions');
			expect(result.current).toHaveProperty('fillQuery');
			expect(typeof result.current.fillQuery).toBe('function');
		});
	});

	describe('refresh action', () => {
		it('should increment cacheId when refresh() called', () => {
			const { result } = renderHook(() => useCacheControl2());

			expect(result.current.state.cacheId).toBe(0);

			act(() => {
				result.current.actions.refresh();
			});

			expect(result.current.state.cacheId).toBe(1);

			act(() => {
				result.current.actions.refresh();
			});

			expect(result.current.state.cacheId).toBe(2);
		});
	});

	describe('fillQuery', () => {
		it('should add cacheId to query when enabled', () => {
			const { result } = renderHook(() => useCacheControl2({ enabled: true }));

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query.cacheId).toBe(0);

			act(() => {
				result.current.actions.refresh();
			});

			const query2: Record<string, unknown> = {};
			result.current.fillQuery(query2);

			expect(query2.cacheId).toBe(1);
		});

		it('should not add cacheId to query when disabled', () => {
			const { result } = renderHook(() => useCacheControl2({ enabled: false }));

			const query: Record<string, unknown> = {};
			result.current.fillQuery(query);

			expect(query.cacheId).toBeUndefined();
		});
	});
});
```

---

## 🏗️ Avantages de l'approche Feature

### ✅ Cohérence

- Suit le **même pattern** que `usePagination2`, `useSearch2`, `useSorting2`
- Pas d'exceptions ou de cas spéciaux
- Composable et testable

### ✅ Flexibilité

- On/off facilement: `enabled: true/false`
- Intégration optionnelle: `cache?: FeatureContract`
- Peut être combiné avec d'autres features

### ✅ Type Safety

- Full TypeScript support
- Autocomplete dans l'IDE
- Compile-time errors si mal utilisé

### ✅ Réutilisabilité

- Même hook peut être utilisé dans plusieurs pages
- Patterns etablis pour polling, auto-refresh, manual refresh

### ✅ Séparation des préoccupations

- Cache control = **une responsabilité**
- Data2 = orchestration générique
- Page = wiring des features

### ✅ Testabilité

- Unit tests pour le hook
- Integration tests pour Data2 + cache
- Snapshot tests pour les pages

---

## 📊 Comparaison: Inline vs Feature

| Aspect              | Inline (`cacheControl={ }`) | Feature (`useCacheControl2()`) |
| ------------------- | --------------------------- | ------------------------------ |
| **Pattern**         | Ad-hoc                      | Headless composable            |
| **Cohérence**       | ❌ Spécifique à Data2       | ✅ Comme autres features       |
| **Testabilité**     | ⚠️ Besoin de mock Data2     | ✅ Hook indépendant            |
| **Réutilisabilité** | ❌ Juste pour Data2         | ✅ N'importe quel contexte     |
| **Type Safety**     | ⚠️ Record<string, unknown>  | ✅ Strongly typed              |
| **Flexibilité**     | ❌ Couplé à Data2           | ✅ Optionnel et composable     |
| **Maintenance**     | ❌ Plus de cas spéciaux     | ✅ Un pattern unique           |

---

## 🚀 Plan d'implémentation

### Phase 1: Infrastructure (30 min)

- ✅ Créer `CacheControlContract` type
- ✅ Créer `useCacheControl2` hook
- ✅ Ajouter tests unitaires
- ✅ Exporter dans `hooks2/index.ts`

### Phase 2: Intégration Data2 (30 min)

- ✅ Ajouter `cache?` prop à `Data2Props`
- ✅ Intégrer dans `buildQuery()`
- ✅ Ajouter aux dépendances du `useEffect`
- ✅ Tester avec Data2.test.tsx

### Phase 3: Page Integration (30 min)

- ✅ Ajouter `useCacheControl2` à `Ingredients2Page`
- ✅ Ajouter bouton Refresh
- ✅ Tester avec DevTools (Network tab)

### Phase 4: Documentation (20 min)

- ✅ Documenter dans `.claude/docs/`
- ✅ Ajouter exemples (manual, auto, polling)
- ✅ Ajouter au QUICKSTART

---

## 📝 Résumé

**L'approche Feature c'est:**

1. ✅ Un hook `useCacheControl2()` qui retourne un `FeatureContract`
2. ✅ Intégration dans `Data2` via prop optionnelle `cache`
3. ✅ Même pattern que `usePagination2`, `useSearch2`, etc.
4. ✅ Type-safe, testable, réutilisable
5. ✅ Composable avec les autres features

**Résultat final:**

```typescript
const cache = useCacheControl2();
const pagination = usePagination2({ pageSize: 10 });
const search = useSearch2({ paramName: 'q' });

<Data2
  fetchData={fetchData}
  cache={cache}
  pagination={pagination}
  search={search}
>
  <Table onRefresh={cache.actions.refresh} />
</Data2>
```

C'est **aussi simple** que les autres features, mais avec tous les avantages! 🎉
