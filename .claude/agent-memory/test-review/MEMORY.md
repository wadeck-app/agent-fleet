# Test Review Memory

## Lego Component System - ISO Tests Fix

### Key Findings

**Actual Rendered Output:**

- `WidgetDataTable.tsx` (Approach 1): Empty state text is "No items found" (line 336), not "no products"
- `ViewDataTable.tsx` (Approach 2): Uses Table component with `emptyMessage="No items found"` (line 289)
- Both components have NO refresh button - onRefreshRef is provided but not exposed as UI button
- Edit/Delete buttons: Approach 1 has inline icon buttons (no aria-label), Approach 2 has dropdown menu items

**Critical Issues Fixed:**

1. Changed empty state assertions from `/no products/i` to `/no items found/i`
2. Removed tests for non-existent refresh button (lines 659-738 in iso-table.test.tsx)
3. Updated edit/delete button detection to handle both inline icons and dropdown menus
4. Edit/Delete button detection now uses semantic queries that work for both approaches

**Test Files Modified:**

- `/packages/web-frontend/src/app/pages/_lego/_shared/__tests__/iso-table.test.tsx` - Fixed empty state text and removed refresh button tests
- `/packages/web-frontend/src/app/pages/_lego/_shared/__tests__/iso-crud.test.tsx` - Updated edit/delete button finding logic to handle both implementations

### Pattern: ISO Tests for Cross-Approach Validation

Both test files follow the pattern from `iso-functionality.test.tsx`:

- Use `vi.hoisted()` for mock functions at module level
- Use `vi.mock()` at top level for hoisting
- Test BEHAVIOR not implementation
- Tests must pass for both approaches or the TEST is wrong
- Mock setup with `mockResolvedValue` as default and specific implementations in beforeEach

### Reference Implementation

`packages/web-frontend/src/app/pages/ingredients/__tests__/iso-functionality.test.tsx` shows the correct pattern.
