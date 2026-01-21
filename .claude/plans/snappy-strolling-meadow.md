# Plan: Test Suite for Ingredients v2/v5 ISO-Functionality

## Goal

Create a comprehensive test suite that validates 100% functional equivalence between:

- **Ingredients v2** (`Ingredients2TablePage`) - Data2-based architecture
- **Ingredients v5** (`IngredientsV5Page`) - useCrudPage hook architecture

Tests must run **identical scenarios** against both implementations using **parameterized testing** (describe.each pattern) to automatically detect any behavioral differences.

**User's requirement**: "detect everything automatically without ping-pong of test/correction"

---

## Test Architecture Overview

### Core Pattern: Parameterized Testing with Page Object Pattern

```typescript
describe.each([
  { version: 'v2', Component: Ingredients2TablePage, path: '/ingredients2' },
  { version: 'v5', Component: IngredientsV5Page, path: '/ingredients5' }
])('Ingredients $version - Feature Tests', ({ version }) => {
  // Same test scenarios for both versions
  it('should do X', () => { ... });
});
```

### Key Design Decisions

1. **Page Object Pattern**: Abstract implementation differences between v2 (Data2) and v5 (useCrudPage)
2. **Service-Layer Mocking**: Mock IngredientsService to ensure identical mock data
3. **Fake Timers**: Use vi.useFakeTimers() for debounce testing (300ms delay)
4. **Single Test File**: One source of truth prevents test drift between versions
5. **100% Coverage**: All 80+ features from feature-inventory.md

---

## File Structure

```
packages/web-frontend/src/app/pages/ingredients/
├── __tests__/
│   ├── iso-functionality.test.tsx       # NEW: Main test suite (parameterized)
│   ├── IngredientPageObject.ts          # NEW: Page Object interface + implementations
│   ├── ingredientMocks.ts               # NEW: Mock data & service setup
│   └── ingredientTestHelpers.ts         # NEW: Test utilities (timers, setup)
├── IngredientsService.ts                # EXISTING: Service to mock
└── useIngredients.ts                    # EXISTING: Hook interface
```

---

## Implementation Phases

### Phase 1: Test Infrastructure (Foundation)

**Create**: `packages/web-frontend/src/app/pages/ingredients/__tests__/ingredientMocks.ts`

Mock data fixtures and service setup:

```typescript
export const mockIngredients = {
  chickenBreast: withMetadata({ id: '1', name: 'Chicken Breast', calories: 165, ... }),
  brownRice: withMetadata({ id: '2', name: 'Brown Rice', calories: 112, ... }),
  // ... 10-15 mock ingredients
};

export function setupIngredientServiceMocks() {
  const mocks = {
    getIngredients: vi.fn().mockResolvedValue(createMockListResponse(mockIngredientList)),
    getIngredient: vi.fn(),
    createIngredient: vi.fn(),
    updateIngredient: vi.fn(),
    deleteIngredient: vi.fn(),
    bulkDeleteIngredients: vi.fn(),
  };

  vi.mock('@app/pages/ingredients/IngredientsService', () => ({
    ingredientsService: mocks,
  }));

  return { mocks, cleanup: () => vi.clearAllMocks() };
}
```

**Create**: `packages/web-frontend/src/app/pages/ingredients/__tests__/ingredientTestHelpers.ts`

Timer utilities for debounce testing:

```typescript
export function setupFakeTimers() {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
	});
}

export async function advanceDebounce(ms = 300) {
	await vi.advanceTimersByTimeAsync(ms);
}
```

---

### Phase 2: Page Object Pattern (Abstraction Layer)

**Create**: `packages/web-frontend/src/app/pages/ingredients/__tests__/IngredientPageObject.ts`

Define interface and version-specific implementations:

```typescript
/**
 * Page Object Pattern - Unified interface for v2 and v5
 */
export interface IngredientPageObject {
  // Rendering
  render(): void;
  rerender(): void;
  unmount(): void;

  // Search
  searchFor(query: string): Promise<void>;
  clearSearch(): Promise<void>;
  getSearchQuery(): string;
  getDebouncedSearchQuery(): string;

  // Table
  getTableRows(): HTMLElement[];
  sortByColumn(key: string, shiftKey?: boolean): Promise<void>;
  selectRow(id: string): Promise<void>;
  selectAllRows(): Promise<void>;

  // Pagination
  goToPage(page: number): Promise<void>;
  changePageSize(size: number): Promise<void>;
  getCurrentPage(): number;

  // CRUD Actions
  clickAddButton(): Promise<void>;
  clickEditButton(id: string): Promise<void>;
  clickDeleteButton(id: string): Promise<void>;
  clickBulkDeleteButton(): Promise<void>;
  confirmDeleteDialog(): Promise<void>;

  // State Queries
  isLoading(): boolean;
  isRefreshing(): boolean;
  getIngredientCount(): number;
  getSelectedCount(): number;
  getCacheId(): string;
  getSortConfigs(): Array<{ key: string; direction: 'asc' | 'desc' }>;

  // Active Features Panel
  getActiveFeaturesPanel(): {
    search: string;
    sort: string;
    cacheId: string;
  };
}

/**
 * V2 implementation - wraps Ingredients2TablePage
 */
class IngredientsV2PageObject implements IngredientPageObject {
  render() {
    this.container = render(
      <MemoryRouter initialEntries={['/ingredients2']}>
        <Routes>
          <Route path="/ingredients2" element={<Ingredients2TablePage />} />
          <Route path="/ingredients2/:mode" element={<Ingredients2TablePage />} />
          <Route path="/ingredients2/:id/:mode" element={<Ingredients2TablePage />} />
        </Routes>
      </MemoryRouter>
    );
  }

  async searchFor(query: string) {
    const input = screen.getByPlaceholderText(/search ingredients/i);
    await userEvent.type(input, query);
  }

  // ... implement all interface methods
}

/**
 * V5 implementation - wraps IngredientsV5Page
 */
class IngredientsV5PageObject implements IngredientPageObject {
  // Similar implementation but for v5 component
}

/**
 * Factory function
 */
export function createIngredientPageObject(version: 'v2' | 'v5'): IngredientPageObject {
  return version === 'v2'
    ? new IngredientsV2PageObject()
    : new IngredientsV5PageObject();
}
```

**Critical**: Page Object must hide implementation differences:

- v2: Uses Data2 wrapper with manual hooks (usePagination2, useSorting2, useSimpleSearch)
- v5: Uses useCrudPage hook with unified state management
- Tests interact with **observable behavior** only (DOM, user interactions)

---

### Phase 3: Parameterized Test Suite (Main Tests)

**Create**: `packages/web-frontend/src/app/pages/ingredients/__tests__/iso-functionality.test.tsx`

Structure with 7 feature categories (from feature-inventory.md):

```typescript
import { describe, beforeEach, it, expect, vi } from 'vitest';
import { setupIngredientServiceMocks, mockIngredients } from './ingredientMocks';
import { createIngredientPageObject } from './IngredientPageObject';
import { setupFakeTimers, advanceDebounce } from './ingredientTestHelpers';

const { mocks, cleanup } = setupIngredientServiceMocks();

describe.each([
  { version: 'v2' as const, basePath: '/ingredients2' },
  { version: 'v5' as const, basePath: '/ingredients5' },
])('Ingredients $version - Iso-functionality', ({ version, basePath }) => {

  let page: IngredientPageObject;

  beforeEach(() => {
    cleanup();
    page = createIngredientPageObject(version);
    page.render();
  });

  // ========================================================================
  // 1. HEADER SECTION (6 tests)
  // ========================================================================
  describe('Header Section', () => {
    it('should display correct title', () => {
      const expectedTitle = version === 'v2' ? 'Ingredients v2 table' : 'Ingredients v5';
      expect(screen.getByText(expectedTitle)).toBeInTheDocument();
    });

    it('should show refresh button', () => { ... });
    it('should refresh data when refresh button clicked', async () => { ... });
    it('should show isRefreshing indicator', async () => { ... });
    it('should show column visibility dropdown', () => { ... });
    it('should show add ingredient button', () => { ... });
  });

  // ========================================================================
  // 2. SEARCH SECTION (7 tests)
  // ========================================================================
  describe('Search Section', () => {
    setupFakeTimers();

    it('should debounce search queries (300ms)', async () => {
      await page.searchFor('chicken');
      expect(mocks.getIngredients).toHaveBeenCalledTimes(1); // Only initial load

      await advanceDebounce(300);

      expect(mocks.getIngredients).toHaveBeenCalledWith(
        expect.objectContaining({ search: 'chicken' })
      );
    });

    it('should show clear button when search has value', async () => { ... });
    it('should clear search when clear button clicked', async () => { ... });
    it('should reset to page 1 when search changes', async () => { ... });
    // ... more search tests
  });

  // ========================================================================
  // 3. ACTIVE FEATURES PANEL (5 tests)
  // ========================================================================
  describe('Active Features Panel', () => {
    it('should show search (UI / Debounced)', async () => {
      await page.searchFor('chicken');
      const panel = page.getActiveFeaturesPanel();
      expect(panel.search).toContain('chicken / ');

      await advanceDebounce(300);
      expect(panel.search).toContain('chicken / chicken');
    });

    it('should show sort configs', async () => { ... });
    it('should show cache ID', () => { ... });
    // ... more panel tests
  });

  // ========================================================================
  // 4. BULK ACTIONS (6 tests)
  // ========================================================================
  describe('Bulk Actions', () => {
    it('should show bulk action bar when rows selected', async () => { ... });
    it('should show correct count in bulk action bar', async () => { ... });
    it('should delete selected items', async () => { ... });
    // ... more bulk action tests
  });

  // ========================================================================
  // 5. TABLE (12 tests)
  // ========================================================================
  describe('Table', () => {
    it('should sort by column on header click', async () => { ... });
    it('should toggle sort direction on second click', async () => { ... });
    it('should support multi-column sort with shift key', async () => { ... });
    it('should paginate results', async () => { ... });
    it('should change page size', async () => { ... });
    it('should show refreshing state (blur effect)', async () => { ... });
    it('should show deleting state (strike-through)', async () => { ... });
    it('should handle row selection', async () => { ... });
    it('should toggle column visibility', async () => { ... });
    // ... more table tests
  });

  // ========================================================================
  // 6. DIALOGS (15+ tests)
  // ========================================================================
  describe('Dialogs', () => {
    describe('Create Dialog', () => {
      it('should open create dialog when add button clicked', async () => { ... });
      it('should create ingredient on submit', async () => { ... });
      it('should close dialog after successful create', async () => { ... });
      // ... more create tests
    });

    describe('Edit Dialog', () => {
      it('should open edit dialog when edit button clicked', async () => { ... });
      it('should prefill form with existing data', async () => { ... });
      it('should update ingredient on submit', async () => { ... });
      it('should refresh ingredient data in edit mode', async () => { ... });
      // ... more edit tests
    });

    describe('Delete Confirmation Dialog', () => {
      it('should open delete confirmation when delete button clicked', async () => { ... });
      it('should delete ingredient on confirm', async () => { ... });
      it('should not delete on cancel', async () => { ... });
      // ... more delete tests
    });

    describe('Bulk Delete Workflow', () => {
      it('should open bulk delete workflow', async () => { ... });
      it('should perform bulk delete', async () => { ... });
      // ... more bulk delete tests
    });
  });

  // ========================================================================
  // 7. STATE MANAGEMENT (4 tests)
  // ========================================================================
  describe('State Management', () => {
    it('should persist pagination state in localStorage', async () => {
      await page.goToPage(3);
      page.unmount();
      page.render();
      expect(page.getCurrentPage()).toBe(3);
    });

    it('should persist sort state in localStorage', async () => { ... });
    it('should persist column visibility in localStorage', async () => { ... });
    it('should clear selection on unmount', () => { ... });
  });

  // ========================================================================
  // 8. EDGE CASES (5 tests)
  // ========================================================================
  describe('Edge Cases', () => {
    it('should handle empty state', () => { ... });
    it('should handle API errors', async () => { ... });
    it('should handle create errors', async () => { ... });
    it('should handle delete errors', async () => { ... });
    it('should handle loading state', () => { ... });
  });
});
```

**Total**: ~60+ test scenarios × 2 versions = ~120+ test cases

---

## Test Coverage Strategy

### Feature Coverage Matrix

All 80+ features from `.claude/temp/feature-inventory.md` must be tested:

1. **Header Section** (5 features): title, refresh button, isRefreshing, column visibility, add button
2. **Search Section** (3 features): search input, clear button, debounce (300ms)
3. **Active Features Panel** (4 features): search display, sort display, cache ID, grid layout
4. **Bulk Actions** (4 features): bulk action bar, delete button, selection count, cancel
5. **Table** (11 features): sorting, multi-sort, pagination, page size, column visibility, row selection, select all, refreshing state, deleting state
6. **Dialogs** (5 features): create dialog, edit dialog, delete confirmation, bulk delete workflow, dialog refresh
7. **State Management** (4 features): cache control, selection, mutations tracking, localStorage persistence
8. **Edge Cases** (5 features): empty state, API errors, create errors, delete errors, loading state

### Verification Approach

Add coverage verification test:

```typescript
describe('Feature Coverage Verification', () => {
  it('should have 100% feature coverage', () => {
    // Automated check that all features from inventory are tested
    const requiredFeatures = 80;
    const actualTestCount = /* count from test results */;
    expect(actualTestCount).toBeGreaterThanOrEqual(requiredFeatures);
  });
});
```

---

## Mock Strategy Details

### IngredientsService Mock

Mock **all service methods** at module level:

- `getIngredients(params)`: Returns paginated list
- `getIngredient(id)`: Returns single ingredient
- `createIngredient(data)`: Creates new ingredient
- `updateIngredient(id, data)`: Updates existing ingredient
- `deleteIngredient(id)`: Deletes ingredient
- `bulkDeleteIngredients(ids)`: Bulk delete operation

### Mock Data

Create 10-15 realistic fixtures:

```typescript
export const mockIngredients = {
  chickenBreast: { id: '1', name: 'Chicken Breast', calories: 165, protein: 31, ... },
  brownRice: { id: '2', name: 'Brown Rice', calories: 112, protein: 2.6, ... },
  broccoli: { id: '3', name: 'Broccoli', calories: 55, protein: 3.7, ... },
  // ... 7-12 more
};
```

### Timer Mocking

For debounce testing:

```typescript
vi.useFakeTimers();
await page.searchFor('chicken');
await vi.advanceTimersByTimeAsync(300); // Debounce delay
vi.useRealTimers();
```

---

## Critical Files Summary

### Files to Create (4 new files)

1. **`packages/web-frontend/src/app/pages/ingredients/__tests__/iso-functionality.test.tsx`**
    - Main test suite with ~60+ parameterized test scenarios
    - Uses describe.each to run against both v2 and v5
    - ~800-1000 lines

2. **`packages/web-frontend/src/app/pages/ingredients/__tests__/IngredientPageObject.ts`**
    - Page Object Pattern interface and implementations
    - IngredientsV2PageObject and IngredientsV5PageObject classes
    - ~400-600 lines

3. **`packages/web-frontend/src/app/pages/ingredients/__tests__/ingredientMocks.ts`**
    - Mock data fixtures (10-15 ingredients)
    - Service mock setup function
    - Mock response builders
    - ~200-300 lines

4. **`packages/web-frontend/src/app/pages/ingredients/__tests__/ingredientTestHelpers.ts`**
    - Timer utilities (setupFakeTimers, advanceDebounce)
    - Common test setup functions
    - ~50-100 lines

### Files Referenced (no changes)

- `packages/web-frontend/src/app/pages/ingredients2/Ingredients2TablePage.tsx` - v2 implementation
- `packages/web-frontend/src/app/pages/ingredients5/IngredientsV5Page.tsx` - v5 implementation
- `packages/web-frontend/src/app/pages/ingredients/IngredientsService.ts` - Service to mock
- `packages/web-frontend/src/app/pages/books/BooksPage.test.tsx` - Reference for test patterns

---

## Verification Plan

### Running Tests

```bash
# Run test suite
npm run test -- iso-functionality.test.tsx

# Run with coverage
npm run test -- iso-functionality.test.tsx --coverage

# Run only v2 tests (for debugging)
npm run test -- iso-functionality.test.tsx -t "v2"

# Run only v5 tests (for debugging)
npm run test -- iso-functionality.test.tsx -t "v5"
```

### Expected Output

```
PASS  ingredients/__tests__/iso-functionality.test.tsx
  Ingredients v2 - Iso-functionality
    Header Section
      ✓ should display correct title (15ms)
      ✓ should show refresh button (8ms)
      ... (60+ more tests)

  Ingredients v5 - Iso-functionality
    Header Section
      ✓ should display correct title (12ms)
      ✓ should show refresh button (9ms)
      ... (60+ more tests)

Test Suites: 1 passed, 1 total
Tests:       120 passed, 120 total
Time:        12.345 s
```

### Success Criteria

- ✅ All 120+ tests pass (60+ scenarios × 2 versions)
- ✅ 100% feature coverage verified
- ✅ No behavioral differences between v2 and v5
- ✅ Tests complete in <30 seconds
- ✅ Zero false positives/negatives

### If Tests Fail

Tests revealing behavioral differences indicate:

1. **Bug in v5**: Missing feature or incorrect behavior → Fix v5
2. **Bug in v2**: Existing bug that v5 fixed → Document and decide
3. **Expected difference**: Intentional improvement in v5 → Document and adjust test

---

## Implementation Order

1. **Phase 1**: Test infrastructure (mocks, helpers) - Foundation first
2. **Phase 2**: Page Object Pattern - Abstraction layer
3. **Phase 3**: Test suite skeleton - Structure with empty tests
4. **Phase 4**: Implement tests category by category (Header → Search → ... → Edge Cases)
5. **Phase 5**: Run tests, fix bugs, verify coverage

**Estimated effort**: ~4-6 hours for complete implementation

---

## Notes

- **Test framework**: Vitest with jsdom, React Testing Library, @testing-library/user-event
- **Co-location**: Tests live in `ingredients/__tests__/` since they test both v2 and v5
- **Maintainability**: Page Object Pattern ensures tests remain stable when implementation changes
- **Performance**: Fake timers make debounce tests instant (no waiting 300ms per test)
- **Reliability**: Mocking at service layer ensures deterministic tests
