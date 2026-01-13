# Implementation Plan: Ingredients v4 - Carousel Page

**Date**: 2026-01-13_21-22
**Goal**: Create a new Ingredients v4 page displaying ingredients in a carousel with 3 cards visible, following v2/v3 patterns for maximum reusability and composability.

## Overview

Create `ingredients4` page using Embla Carousel with the same headless composable architecture as v2/v3 (Data2 shell + feature hooks). The carousel will display 3 ingredient cards at a time with arrow navigation and dot indicators, supporting full CRUD operations.

## User Requirements

- Display ingredients in carousel format (3 cards visible)
- Use Embla Carousel library (headless)
- Navigation: Arrows + Dots indicators
- Support CRUD operations (create, edit, delete) like v2/v3
- Maximize reusability and composability ("antifragile" approach)
- Follow existing patterns from v2/v3 pages

## Architecture Decisions

### 1. Carousel as Feature Hook
**Decision**: Create `useCarousel` hook following FeatureContract pattern
**Rationale**:
- Consistent with Data2 composable architecture
- Carousel state (current index, navigation) is a "feature" like pagination
- Embla API management isolated in hook
- Reusable across other carousel needs

### 2. Items Per View = Page Size
**Decision**: `pageSize` controls both carousel visible items AND backend fetch size
**Rationale**:
- Simple mental model (pageSize: 3 → fetch 3 items + show 3 cards)
- Leverages existing pagination infrastructure
- User can adjust via PageSizeSelector (3, 6, 9)

### 3. Responsive Strategy
**Decision**: Fixed items per viewport size (mobile: 1, tablet: 2, desktop: 3)
**Rationale**:
- Use media queries to adjust itemsPerView
- Embla handles slide recalculation on resize
- Tailwind breakpoints for consistency

### 4. Component Reuse
**Decision**: Clone `IngredientCard3` to `IngredientCard4` (minimal changes)
**Rationale**:
- Proven field-based design
- Same visibility/ordering features
- Isolated from v3 changes

## File Structure

```
packages/web-frontend/src/
├── app/pages/
│   ├── ingredients4/
│   │   ├── Ingredients4CarouselPage.tsx    # Main page (orchestrator)
│   │   ├── IngredientCarousel4.tsx         # Carousel displayer component
│   │   ├── IngredientCard4.tsx             # Single card (clone from v3)
│   │   └── useCarousel.ts                  # Carousel feature hook
│   └── ingredients/
│       ├── IngredientsService.ts           # Existing (reuse)
│       └── useIngredientsCrud.ts           # Existing (reuse)
└── framework/hooks2/
    └── (useCarousel.ts can be moved here later for framework-level reuse)
```

## Component Hierarchy

```
Ingredients4CarouselPage (Orchestrator)
├── Page Header (Title + Refresh + Actions)
│   └── ColumnVisibility, Add Button
├── Search Bar (useSimpleSearch)
├── Feature Info Panel (debug - remove in prod)
├── BulkActionBar (conditional on selection)
├── Data2 Shell
│   └── IngredientCarousel4 (Pure Displayer)
│       ├── Embla Carousel Container
│       │   └── IngredientCard4 × N (3 visible)
│       ├── Navigation Arrows (Previous/Next)
│       └── Dot Indicators (Slide N of M)
├── BulkDeleteWorkflow (Dialog)
├── IngredientDialog (Create/Edit)
└── AlertDialogWrapper (Delete Confirmation)
```

## Hook Composition (Page Level)

```typescript
const pagination = usePagination2({ pageSize: 3, storageId: 'ingredients4' });
const sorting = useSorting2({ storageId: 'ingredients4' });
const search = useSimpleSearch({ onSearchChange: () => pagination.actions.resetPage() });
const cache = useCacheControl2({ enabled: true });
const selection = useMultiSelect2();
const carousel = useCarousel({ itemsPerView: 3 }); // NEW
const fieldVisibility = useColumnVisibility(...);
const fieldOrder = useColumnOrder(...);
const { createIngredient, updateIngredient, deleteIngredient } = useIngredientsCrud();
```

## Implementation Steps

### Phase 1: Install Embla Carousel
1. Install dependency: `npm install embla-carousel-react`
2. Verify installation in `package.json`

### Phase 2: Create Carousel Feature Hook
**File**: `packages/web-frontend/src/app/pages/ingredients4/useCarousel.ts`

**Interface**:
```typescript
interface CarouselState {
  currentIndex: number;
  itemsPerView: number;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  emblaRef: RefCallback<HTMLDivElement>;
  scrollSnaps: number[]; // Dot indicators
}

interface CarouselActions {
  scrollPrev: () => void;
  scrollNext: () => void;
  scrollTo: (index: number) => void;
}

export type CarouselContract = FeatureContract<CarouselState> & {
  actions: CarouselActions;
};
```

**Key Features**:
- Uses `useEmblaCarousel` from embla-carousel-react
- Returns `emblaRef` for component to attach
- Manages scroll state (currentIndex, canScroll*)
- Provides navigation actions (prev, next, scrollTo)
- Follows FeatureContract pattern (fstate, actions, fillQuery)
- fillQuery is no-op (carousel is UI-only)

### Phase 3: Create Card Component
**File**: `packages/web-frontend/src/app/pages/ingredients4/IngredientCard4.tsx`

**Actions**:
1. Copy `IngredientCard3.tsx` to `IngredientCard4.tsx`
2. No changes needed (same field-based rendering)
3. Reuses: CardHeader, CardContent, CardFooter, field visibility/ordering

### Phase 4: Create Carousel Displayer Component
**File**: `packages/web-frontend/src/app/pages/ingredients4/IngredientCarousel4.tsx`

**Props** (following QueryResultDisplayerProps):
```typescript
interface IngredientCarousel4Props extends QueryResultDisplayerProps<Ingredient> {
  fields: Table2Column<Ingredient>[];
  onEdit: (item: Ingredient) => void;
  onDelete: (id: string) => void;
  carousel: CarouselContract;
  onSelectionToggle: (id: string) => void;
  _onSelectAll: (ids: string[]) => void;
}
```

**Structure**:
- Embla carousel container (attach emblaRef)
- Scrollable viewport with 3 cards visible
- Navigation arrows (disabled when can't scroll)
- Dot indicators (showing current slide)
- Maps data to IngredientCard4 components

**Responsive**:
```css
.carousel-container {
  grid-template-columns: repeat(1, minmax(0, 1fr)); /* mobile: 1 */
}
@media (min-width: 768px) {
  grid-template-columns: repeat(2, minmax(0, 1fr)); /* tablet: 2 */
}
@media (min-width: 1024px) {
  grid-template-columns: repeat(3, minmax(0, 1fr)); /* desktop: 3 */
}
```

### Phase 5: Create Main Page Component
**File**: `packages/web-frontend/src/app/pages/ingredients4/Ingredients4CarouselPage.tsx`

**Actions**:
1. Copy structure from `Ingredients3GridPage.tsx`
2. Replace grid-specific logic with carousel logic:
   - Use `useCarousel` hook
   - Pass carousel contract to IngredientCarousel4
   - Adjust pageSize options: `[3, 6, 9]` (multiples of 3)
3. Keep all other patterns:
   - Data2 shell with feature composition
   - Mutation → blur effect pattern
   - URL-based dialog routing
   - Bulk delete workflow
   - Search + cache control

**Key Patterns to Preserve**:
- `isMutating` ref + `useEffect` for blur coordination
- `isRefreshingAfterMutation` state
- `deletingIds` for strike-through effect
- Debounced search (300ms)
- Field visibility/ordering

### Phase 6: Add Routing
**File**: `packages/web-frontend/src/app/App.tsx`

**Actions**:
1. Import `Ingredients4CarouselPage`
2. Add routes:
```tsx
<Route path="/ingredients4" element={<Ingredients4CarouselPage />} />
<Route path="/ingredients4/:mode" element={<Ingredients4CarouselPage />} />
<Route path="/ingredients4/:id/:mode" element={<Ingredients4CarouselPage />} />
```

### Phase 7: Testing & Validation
1. Run type checking: `skill: check`
2. Manual testing:
   - Carousel navigation (arrows, dots)
   - CRUD operations (create, edit, delete)
   - Search + pagination interaction
   - Field visibility/ordering
   - Multi-select + bulk delete
   - Responsive behavior (resize browser)
3. Fix any issues

## Critical Files Reference

### Main Reference Files (READ for patterns)
- `packages/web-frontend/src/app/pages/ingredients3/Ingredients3GridPage.tsx` - Complete Data2 + CRUD pattern
- `packages/web-frontend/src/app/pages/ingredients3/IngredientCard3.tsx` - Card component structure
- `packages/web-frontend/src/framework/hooks2/usePagination2.ts` - FeatureContract pattern
- `packages/web-frontend/src/framework/components2/data/Data2.tsx` - Data orchestration

### Files to Modify
- `packages/web-frontend/src/app/App.tsx` - Add routes

### Files to Create
- `packages/web-frontend/src/app/pages/ingredients4/Ingredients4CarouselPage.tsx`
- `packages/web-frontend/src/app/pages/ingredients4/IngredientCarousel4.tsx`
- `packages/web-frontend/src/app/pages/ingredients4/IngredientCard4.tsx`
- `packages/web-frontend/src/app/pages/ingredients4/useCarousel.ts`

## Technical Details

### Embla Carousel Configuration
```typescript
const [emblaRef, emblaApi] = useEmblaCarousel({
  loop: false,              // No infinite loop
  align: 'start',           // Align slides to start
  slidesToScroll: 3,        // Scroll 3 cards at a time
  containScroll: 'trimSnaps' // Trim last snap if incomplete
});
```

### Data Flow
```
User clicks arrow
  → carousel.actions.scrollNext()
  → Embla API scrolls
  → emblaApi.on('select') fires
  → Update currentIndex state
  → Re-render with new active slide
```

**Note**: Carousel scrolling is independent of pagination. Pagination fetches pages of data, carousel displays current page's items.

### Responsive Media Queries
```typescript
// In Ingredients4CarouselPage.tsx
const isMobile = useMediaQuery('(max-width: 768px)');
const isTablet = useMediaQuery('(max-width: 1024px) and (min-width: 768px)');
const itemsPerView = isMobile ? 1 : isTablet ? 2 : 3;

const carousel = useCarousel({ itemsPerView });
```

## Success Criteria

✅ Carousel displays 3 cards at a time
✅ Arrow navigation works (prev/next)
✅ Dot indicators show current position
✅ Create/edit/delete operations work
✅ Search filters carousel items
✅ Multi-select + bulk delete works
✅ Field visibility/ordering works
✅ Responsive (1/2/3 cards based on screen size)
✅ Blur effect during mutations
✅ Type checking passes (`skill: check`)
✅ Follows v2/v3 patterns (composable, reusable)

## Notes

- **Composability**: useCarousel can be extracted to framework later for other carousels
- **Independence**: Carousel state doesn't affect backend queries (UI-only)
- **Consistency**: Same CRUD patterns as v2/v3 (no new concepts)
- **Testability**: Carousel hook can be tested independently
- **Performance**: Only 3 cards rendered at a time (no virtual scrolling needed)

## Dependencies

- **New**: `embla-carousel-react` (install via npm)
- **Existing**: All other dependencies from v3 (React, Radix UI, etc.)

## Estimated Complexity

- **Low**: Most code is cloned/adapted from v3
- **Medium**: useCarousel hook requires understanding Embla API
- **Low**: Displayer component follows v3 grid pattern

## Rollout Strategy

1. Implement in isolated `ingredients4/` folder (no impact on v1/v2/v3)
2. Test thoroughly with existing ingredients data
3. Use as proof-of-concept for carousel pattern
4. Extract useCarousel to framework if successful
