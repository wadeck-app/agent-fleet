# Component Architecture Guidelines

**Status:** ✅ Active
**Last Updated:** 2025-01-23
**Audit Score:** A (91/100)

---

## Overview

This document defines architectural standards for React components following a **three-tier pattern** with **inverted CSS distribution** where base components handle most styling.

### Core Principles

- **Single Responsibility** - One clear purpose per component
- **Composition over Inheritance** - Build complex UIs from simple pieces
- **Zero Business Logic in Base** - Primitives are pure presentation
- **Hook-Based Logic** - Extract state management to custom hooks
- **Antifragile Design** - Components improve when encountering new use cases

---

## Three-Tier Architecture

### Tier 1: Base Components (Primitives)

**Location:** `packages/web-frontend/src/framework/components/primitives/`

**Characteristics:**

- Zero business logic, pure presentation
- Maximum CSS (50-90+ classes via CVA)
- Type-safe with TypeScript interfaces
- Use Class Variance Authority (CVA) for variants

**Reference Implementations:**

- `Button.tsx` - 6 variants × multiple sizes (95% grade) - **CVA pattern reference**
- `Badge.tsx` - 9 variants (success, warning, info, etc.)
- `Card.tsx` - Size variants with CVA + React Context for variant sharing
- `Input.tsx`, `Select.tsx`, `Checkbox.tsx`

### Tier 2: Intermediate Components

**Locations:**

- `framework/components/layout/` - Layout components
- `framework/components/forms/` - Form components
- `app/components/domain/` - Domain components

**Characteristics:**

- Minimal CSS (5-10 classes, structural only)
- Compose base components
- May contain presentation logic
- No direct API calls

**Reference Implementations:**

- `app/components/domain/EntityDialog.tsx` - Generic dialog wrapper (A+ grade)
- `framework/components/advanced/CrudTable.tsx` - Generic CRUD table
- `framework/components/layout/FilterGrid.tsx` - CVA grid layout

### Tier 3: Pages (End Components)

**Location:** `packages/web-frontend/src/app/pages/`

**Characteristics:**

- 0-5 CSS classes (quasi-none)
- Pure composition of lower-tier components
- Logic via custom hooks only
- No direct API calls (use hooks)

**Reference Implementations:**

- `app/pages/ingredients5/IngredientsV5Page.tsx` (A+ - 97%) - **Gold standard** using composite hook
- `app/pages/interventions/InterventionsV2Page.tsx` (A+ - 96%) - Complex orchestration
- `app/pages/projects/ProjectsPage.tsx` (A+ - 95%) - CRUD with filters

---

## CSS Distribution Pattern

**Inverted Pyramid:**

```
Base (Primitives)        █████████ Maximum CSS (50-90+ classes via CVA)
Intermediate             ███ Minimal CSS (5-10 classes, structural)
Pages (End)              ▓ Quasi-none (0-5 classes)
```

**Rationale:** Centralized styling in base components propagates everywhere, ensuring consistency and maintainability.

---

## Component Patterns

### Pattern 1: Composite Hooks (Gold Standard)

**When:** Simple CRUD pages with standard operations
**Example:** `app/pages/ingredients5/IngredientsV5Page.tsx`
**Hook:** `framework/hooks/useCrudPage.ts`

**Benefits:** Eliminates ~200 lines of boilerplate per page

---

### Pattern 2: Data2 Composable Hooks

**When:** Complex pages with filtering, sorting, pagination, real-time updates
**Example:** `app/pages/tasks/TasksPage.tsx`
**Hooks Used:** `useAsyncData`, `usePagination`, `useSorting`, `useSearch`, `useBulkSelection`, `useRealtimeRefresh`

**Benefits:** Highly flexible, each concern in separate hook (SRP)

---

### Pattern 3: Generic Type-Safe Components

**When:** Similar components with different entity types
**Example:** `app/components/domain/EntityDialog.tsx`

**Benefits:** Eliminates 80+ lines per entity, type-safe across all types

---

### Pattern 4: Context for Variant Sharing

**When:** Component with subcomponents needing shared variant state
**Example:** `framework/components/primitives/Card.tsx`

**Implementation:** Uses React Context to share `size` variant between Card, CardHeader, CardTitle, CardContent, CardFooter

**Benefits:** Subcomponents automatically adapt, no prop drilling

---

## Gold Standard Examples

### Top 3 Implementations

1. **IngredientsV5Page (A+ - 97%)** - `app/pages/ingredients5/IngredientsV5Page.tsx`
    - Uses `useCrudPage` composite hook
    - 5 classes total (all structural)
    - Zero business logic

2. **InterventionsV2Page (A+ - 96%)** - `app/pages/interventions/InterventionsV2Page.tsx`
    - 16+ hooks perfectly orchestrated
    - Bulk actions + filtering + real-time updates

3. **EntityDialog (A+ - 98%)** - `app/components/domain/EntityDialog.tsx`
    - Generic with type parameters
    - Eliminates 80+ lines of duplication

---

## Anti-Patterns to Avoid

### ❌ Anti-Pattern 1: Direct API Calls in Pages

**Bad:** `useEffect(() => { api.getData().then(setData); }, []);` in page
**Good:** `const { data } = useData();` via custom hook

**Why:** Pages should be pure composition. API logic must be testable in isolation.

---

### ❌ Anti-Pattern 2: Business Logic in Base Components

**Bad:** Validation, async state management in primitives
**Good:** Extract to custom hooks, move component to `features/` directory

**Reference:** `framework/features/inline-editing/EditableText.tsx` uses `framework/hooks/useEditableText.ts`

---

### ❌ Anti-Pattern 3: Excessive CSS in Pages

**Bad:** 16+ Tailwind classes mixing layout + styling in pages
**Good:** Extract to intermediate layout component

**Reference:** `app/pages/flows/flow-editor/FlowEditorPage.tsx` (needs refactoring)

---

### ❌ Anti-Pattern 4: God Components (>500 lines)

**Bad:** Single component with 50+ states, 100+ handlers, 300+ JSX lines
**Good:** Extract state to hooks, UI to sub-components

**Why:** Components >400 lines should be refactored

---

## Grading System

### Score Calculation

| Grade  | Score   | Meaning                                   |
| ------ | ------- | ----------------------------------------- |
| **A+** | 95-100% | Perfect, gold standard, example to follow |
| **A**  | 85-94%  | Very good, minor improvements only        |
| **B**  | 75-84%  | Good, recommended improvements            |
| **C**  | 65-74%  | Acceptable, improvements necessary        |
| **D**  | <65%    | Non-compliant, refactoring required       |

### Evaluation Criteria

**For Pages (app/pages/\*):**

1. CSS Usage (40%) - Should have 0-5 classes
2. Hook Composition (30%) - Logic in custom hooks
3. API Calls (20%) - No direct API calls
4. Business Logic (10%) - Delegated to hooks/components

**For Base Components (primitives):**

1. Styling Centralization (30%) - CVA or equivalent
2. Zero Business Logic (40%) - Pure presentation
3. Reusability (20%) - Works across all contexts
4. Type Safety (10%) - Clear TypeScript interfaces

**For Intermediate Components:**

1. Minimal Styling (30%) - Structural only
2. Composition (40%) - Uses base components
3. Encapsulation (20%) - Clear responsibility
4. Independence (10%) - No page dependencies

---

## Migration Guide

### Migrating Legacy Pages to Gold Standard

**Step 1:** Extract API calls to custom hooks
**Step 2:** Extract state management to composable hooks
**Step 3:** Extract layout to intermediate components
**Step 4:** Use composite hooks when possible (e.g., `useCrudPage`)

**Reference Migration:** See audit report in `.claude/plans/mossy-herding-boole.md` for detailed examples

---

## Resources

- **Full Audit Report:** `.claude/plans/mossy-herding-boole.md` (includes detailed scorecards for 88 components)
- **Frontend Architecture:** `.claude/docs/frontend.md`
- **CVA Documentation:** [https://cva.style/](https://cva.style/)

---

## Quick Reference

### File Locations by Pattern

- **Base Primitives:** `framework/components/primitives/`
- **Intermediate Layouts:** `framework/components/layout/`
- **Domain Components:** `app/components/domain/`
- **Feature Components:** `framework/features/{feature-name}/`
- **Pages:** `app/pages/`
- **Custom Hooks:** `framework/hooks/` or `app/hooks/`

### When to Use Each Tier

- **Primitives:** Creating reusable UI elements (buttons, inputs, cards)
- **Intermediate:** Combining primitives for specific features (dialogs, tables, grids)
- **Pages:** Orchestrating features into complete user experiences

---

## Changelog

- **2025-01-23** - Initial version based on comprehensive audit (A grade, 91/100)
- Sprint 1-3 completed: All Priority 1-3 actions implemented
- Refactored for context engineering: Reduced from 720 to ~250 lines by referencing code instead of duplicating
