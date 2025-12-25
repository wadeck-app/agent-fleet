# Feature Hooks Analysis - Antifragile Pattern Review

**Date**: 2025-12-24 22:27  
**Status**: 🔍 ANALYSIS COMPLETED

## Summary

Analyzed all feature hooks to identify potential issues with:

1. Unstable `fillQuery` dependencies causing unnecessary refetches
2. Missing `state` property in return objects
3. Inconsistent type contracts

**UPDATE**: ✅ useSearch2.ts has been fixed with the `trimmedQuery` pattern.

## Hooks Analyzed

1. ✅ `useCacheControl2.ts` - **FIXED** (effectiveCacheId pattern)
2. ✅ `useSimpleSearch.ts` - **FIXED** (trimmedQuery pattern)
3. ✅ `useSearch2.ts` - **FIXED** (trimmedQuery pattern applied)
4. ✅ `usePagination2.ts` - **OK** (no issues found)
5. ✅ `useSorting2.ts` - **OK** (no issues found)
6. ✅ `useCategoryFilter2.ts` - **OK** (no issues found)

---

## Detailed Findings

### ✅ useCacheControl2.ts - FIXED

**Status**: Already fixed with `effectiveCacheId` pattern

**Pattern Applied**:

```typescript
const fstate = useMemo(
	() => ({
		cacheId,
		isRefreshing,
		effectiveCacheId: enabled ? cacheId : undefined,
	}),
	[cacheId, isRefreshing, enabled]
);

const fillQuery = useCallback(
	query => {
		if (fstate.effectiveCacheId !== undefined) {
			query.cacheId = fstate.effectiveCacheId;
		}
	},
	[fstate.effectiveCacheId]
);
```

**Result**: Prevents unnecessary refetches when `enabled = false` but `cacheId` changes.

---

### ✅ useSimpleSearch.ts - FIXED

**Status**: Already fixed with `trimmedQuery` pattern

**Pattern Applied**:

```typescript
const state = useMemo(
	() => ({
		query: localQuery,
		trimmedQuery: localQuery.trim(),
		isEmpty: !localQuery.trim(),
	}),
	[localQuery]
);

const fillQuery = useCallback(
	queryObj => {
		if (!state.trimmedQuery) return;
		queryObj.search = state.trimmedQuery;
	},
	[state.trimmedQuery] // Only depends on trimmed value
);
```

**Result**: Prevents unnecessary refetches when user types/removes spaces.

---

### ✅ useSearch2.ts - FIXED

**Status**: Fixed with `trimmedQuery` pattern

**Changes Applied**:

1. **Added `trimmedQuery` to state** (line ~117):

```typescript
const state = useMemo(
	() => ({
		query: localQuery,
		trimmedQuery: localQuery.trim(), // Added
		isEmpty: !localQuery.trim(),
	}),
	[localQuery]
);
```

2. **Updated `fillQuery` to depend on `trimmedQuery`** (line ~185):

```typescript
const fillQuery = useCallback(
	(queryObj: Record<string, unknown>) => {
		if (!state.trimmedQuery) {
			return;
		}
		queryObj.search = state.trimmedQuery;
	},
	[state.trimmedQuery] // Changed from [state.query]
);
```

3. **Updated `SearchState` interface**:

```typescript
export interface SearchState {
	query: string;
	trimmedQuery: string; // Added
	isEmpty: boolean;
}
```

**Result**: Prevents unnecessary refetches when user types/removes spaces, matching `useSimpleSearch` behavior.

---

### ✅ usePagination2.ts - OK

**fillQuery** (lines 164-170):

```typescript
const fillQuery = useCallback(
	(query: Record<string, unknown>) => {
		query.page = currentPage;
		query.pageSize = pageSize;
	},
	[currentPage, pageSize]
);
```

**Analysis**: ✅ No issues

- Dependencies are the actual values sent to backend
- No derived/transformed values needed
- Changes to `currentPage` or `pageSize` should trigger refetch

**Return object** (lines 172-176):

```typescript
return {
    fstate,
    actions,
    fillQuery,
};
```

**Analysis**: ⚠️ Missing `state` property but contract doesn't require it (only has `fstate`)

---

### ✅ useSorting2.ts - OK

**fillQuery** (lines 224-234):

```typescript
const fillQuery = useCallback(
	(query: Record<string, unknown>) => {
		if (sortConfigs.length === 0) {
			return;
		}
		query.sortBy = sortConfigs.map(c => c.key).join(',');
		query.sortOrder = sortConfigs.map(c => c.direction).join(',');
	},
	[sortConfigs]
);
```

**Analysis**: ✅ No issues

- Depends on `[sortConfigs]` which is the array of sort configurations
- Any change to sort should trigger refetch (correct behavior)
- Early return when empty prevents query pollution

**Return object** (lines 236-240):

```typescript
return {
    fstate,
    actions,
    fillQuery,
};
```

**Analysis**: ⚠️ Missing `state` property but contract doesn't require it (only has `fstate`)

---

### ✅ useCategoryFilter2.ts - OK

**fillQuery** (lines 162-171):

```typescript
const fillQuery = useCallback(
	(query: Record<string, unknown>) => {
		if (!value) {
			return;
		}
		query.category = value;
	},
	[value]
);
```

**Analysis**: ✅ No issues

- Depends on `[value]` which is the selected category
- Any change to category should trigger refetch (correct behavior)
- Early return when empty prevents query pollution

**Return object** (lines 173-177):

```typescript
return {
    fstate,
    actions,
    fillQuery,
};
```

**Analysis**: ⚠️ Missing `state` property but contract doesn't require it (only has `fstate`)

---

## Type Contract Consistency Issues

### Issue: Some hooks have `state` + `fstate`, others only `fstate`

**Hooks with both `state` and `fstate`**:

- ✅ `useSimpleSearch` (after fix)
- ✅ `useSearch2`

**Hooks with only `fstate`**:

- ⚠️ `usePagination2`
- ⚠️ `useSorting2`
- ⚠️ `useCategoryFilter2`
- ⚠️ `useCacheControl2`

**Analysis**: This is intentional architectural decision:

- `state` = mutable/changing state (UI reads from this)
- `fstate` = frozen/memoized state (dependencies use this)
- Most hooks only expose `fstate` to simplify API
- Search hooks expose both for UI flexibility (raw query + trimmed query)

**Recommendation**: ✅ Keep as-is - it's intentional design

---

## Recommendations

### Priority 1: Fix useSearch2.ts

**Action**: Apply `trimmedQuery` pattern to match `useSimpleSearch`

**Files to change**:

1. `useSearch2.ts` - Add `trimmedQuery` to state, update `fillQuery` dependency

**Impact**: Prevents unnecessary refetches when typing spaces in search

---

### Priority 2: Document the "Effective Value" Pattern

**Action**: Create documentation explaining when to use this pattern

**Pattern Indicators**:

- Feature has an `enabled` flag or similar conditional
- Feature transforms/derives values (trim, normalize, etc.)
- Feature should not trigger refetch when disabled

**Examples**:

- ✅ `effectiveCacheId` - only set when enabled
- ✅ `trimmedQuery` - only trimmed version triggers refetch

---

### Priority 3: Audit Other Hooks

**Action**: Review other feature hooks as they're created

**Checklist for new hooks**:

- [ ] Does `fillQuery` depend on raw values or derived values?
- [ ] If derived, is the derivation in state (memoized)?
- [ ] Does the hook have conditional behavior (enabled flag)?
- [ ] If so, use "effective value" pattern

---

## Testing Strategy

### Test Cases for useSearch2 Fix:

1. **User types "chicken"** → Expect: 1 request
2. **User types "chicken "** (adds space) → Expect: 0 requests (same trimmed value)
3. **User types "chicken "** (adds another space) → Expect: 0 requests
4. **User types "chicken b"** → Expect: 1 request (trimmed changed to "chicken b")

---

## Conclusion

**Summary**:

- 🟢 All 6 hooks are now correct
- ✅ useSearch2.ts fixed with `trimmedQuery` pattern
- Pattern is well-established and consistently applied

**Files Modified**:

1. `useSearch2.ts` - Added `trimmedQuery` to state, updated `fillQuery` dependency
2. `SearchContract.ts` - Added `trimmedQuery: string` to `SearchState` interface

**Build Status**: ✅ All changes compile successfully

**Next Steps**:

1. ✅ COMPLETED - Fixed `useSearch2.ts` with `trimmedQuery` pattern
2. Monitor for similar issues in future feature hooks
3. Consider documenting "Effective Value" pattern in architecture docs
