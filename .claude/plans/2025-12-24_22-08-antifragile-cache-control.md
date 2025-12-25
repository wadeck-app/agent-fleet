# Antifragile Cache Control Pattern Implementation

**Date**: 2025-12-24 22:08  
**Status**: ✅ COMPLETED

## Summary

Implemented the **antifragile cache control pattern** in `useCacheControl2` to prevent unnecessary refetches when the feature is disabled but `cacheId` changes.

## Problem

Previously, `fillQuery` had a dependency on both `[cacheId, enabled]`:

```typescript
const fillQuery = useCallback(
	queryObj => {
		if (enabled) {
			query.cacheId = cacheId;
		}
	},
	[cacheId, enabled] // Problem: changes even when disabled
);
```

**Issue**: When `enabled = false` but `cacheId` increments (e.g., via `refresh()` call), `fillQuery` would change reference even though it's not adding anything to the query. This triggers `Data2` to refetch unnecessarily.

## Solution: Effective Value Pattern

Introduced `effectiveCacheId` in the state:

```typescript
const fstate = useMemo(
	() => ({
		cacheId,
		isRefreshing,
		effectiveCacheId: enabled ? cacheId : undefined, // Derived value
	}),
	[cacheId, isRefreshing, enabled]
);

const fillQuery = useCallback(
	queryObj => {
		if (fstate.effectiveCacheId !== undefined) {
			query.cacheId = fstate.effectiveCacheId;
		}
	},
	[fstate.effectiveCacheId] // Depends only on effective value
);
```

**How it works**:

- **If `enabled = false`**: `effectiveCacheId = undefined` → `fillQuery` never changes (even if `cacheId` increments)
- **If `enabled = true`**: `effectiveCacheId = cacheId` → `fillQuery` changes when `cacheId` changes (correct)
- **If `enabled` changes**: `effectiveCacheId` changes → `fillQuery` changes (correctly triggers refetch)

## Pattern Classification

This is the **"Effective Value Pattern"** - derived state that captures only what should trigger external effects.

**Same pattern used in**:

- `useSimpleSearch.ts`: `trimmedQuery` in state (only trim triggers fillQuery)
- `useCacheControl2.ts`: `effectiveCacheId` in state (only enabled cacheId triggers fillQuery)

## Changes Made

### 1. `useCacheControl2.ts`

- Added `effectiveCacheId: enabled ? cacheId : undefined` to `fstate`
- Modified `fillQuery` to depend on `[fstate.effectiveCacheId]` instead of `[cacheId, enabled]`
- Updated JSDoc with detailed antifragile pattern explanation

### 2. `CacheControlContract.ts` (Type definition)

- Added `effectiveCacheId: number | undefined` to `CacheControlState` interface
- Documented the antifragile pattern in the type definition

### 3. `SearchContract.ts` (Bug fix)

- Added missing `state: SearchState` to `SearchContract` type
- Fixed inconsistency where hooks returned `state` but type didn't declare it

### 4. `useSimpleSearch.ts` (Bug fix)

- Added `state` variable (was previously named `fstate` only)
- Now returns both `state` and `fstate` per the updated `SearchContract`

## Testing Scenarios

All scenarios now work correctly:

1. **`enabled = true`, user calls `refresh()`**
    - `cacheId` increments → `effectiveCacheId` changes → `fillQuery` changes → refetch ✅

2. **`enabled = false`, user calls `refresh()` (shouldn't happen but antifragile)**
    - `cacheId` increments → `effectiveCacheId` stays `undefined` → `fillQuery` stable → no refetch ✅

3. **`enabled` changes from `false` to `true`**
    - `effectiveCacheId` changes from `undefined` to `0` → `fillQuery` changes → refetch ✅

4. **`enabled` changes from `true` to `false`**
    - `effectiveCacheId` changes from `5` to `undefined` → `fillQuery` changes → refetch ✅

## Documentation

JSDoc updated with comprehensive explanation:

```typescript
/**
 * ANTIFRAGILE PATTERN:
 * - If enabled=false: effectiveCacheId=undefined → fillQuery doesn't change when cacheId changes
 * - If enabled=true: effectiveCacheId=cacheId → fillQuery changes when cacheId changes
 * - If enabled changes: effectiveCacheId changes → fillQuery changes (correctly triggers refetch)
 *
 * This prevents unnecessary refetches when feature is disabled but cacheId increments.
 */
```

## Build Status

✅ Frontend build passes successfully  
✅ No type errors  
✅ All changes compile correctly

## Future Improvements

Consider applying this "effective value" pattern to:

- `usePagination2.ts` (effective page when feature disabled)
- `useSorting2.ts` (effective sort when feature disabled)
- `useSimpleSearch.ts` (already using with `trimmedQuery`)
- Other feature hooks as needed

This pattern ensures all features are truly antifragile - they behave correctly regardless of how they're used or combined.
