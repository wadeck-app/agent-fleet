# Frontend Architecture - Quick Reference

**For agents:** This is the essential guide. Load detailed references only when needed.

For Playwright best practices, see `.claude/docs/playwright.md`.

## Validation Protocol

After changes: TS → Build → **Runtime (F12 console)** → Tests

**See:** `.claude/agents/frontend-dev.md`

## Tech Stack

- React 19 + TypeScript 5.3+
- Shadcn/ui (Radix UI) + Tailwind CSS
- Inter font + Lucide icons
- Vitest + Testing Library + Playwright + Storybook

## Core Principles

### 1. Component Hierarchy (Strict)

1. **Generic** - Pure UI, Shadcn/ui based, zero business logic
2. **Feature** - Domain logic, compose generic components
3. **Page** - Compositional only, manage shared state
4. **Layout** - Structure + responsive behavior

**Styling Distribution (Critical Rule):**

CSS/Tailwind classes should decrease dramatically as you move up the hierarchy:

| Level                              | Styling Amount | Examples                                             | Typical className Count    |
| ---------------------------------- | -------------- | ---------------------------------------------------- | -------------------------- |
| **Base** (primitives, forms)       | **Maximum**    | Button (89+ classes via CVA), Input, Card            | Many (centralized via CVA) |
| **Intermediate** (layouts, domain) | **Minimal**    | Page layout (~10 classes), Domain components         | Few (structural only)      |
| **End** (pages)                    | **Quasi none** | BooksPage (1-3 classes), IngredientsPage (0 classes) | 0-5 max                    |

**Key Principle:** Pages should delegate styling to components. Only structural classes (responsive width, container) are acceptable at page level.

**Reference:** `docs/examples/packages/frontend/components/`, `docs/examples/packages/frontend/styling/page-minimal-styling-tailwind.tsx`

### 2. State Management

**Props** - Use for <4 components
**Context** - Use for >4-5 components needing same state

**Reference:** `docs/examples/packages/frontend/state/`

### 3. Data Flow (Required for each feature)

```
apiClient → Repository → Service → Hook → Component
```

### 4. User feedback

All actions from the user MUST have a visible feedback (loading spinners, success messages, error messages, etc.)
The feedback must be non-blocking (e.g. toast notifications instead of modals) when possible.
When saving data, the frontend has to be optimistic and update the UI immediately, reverting only on error (with a toast)

**Reference:** `docs/examples/packages/frontend/data-flow/`

## File Conventions

**Default: Flat structure with PascalCase files**

```
components/ui/Button.tsx               # Generic (Shadcn/ui based)
pages/BooksPage.tsx                    # Simple pages
pages/Inventory/InventoryPage.tsx      # Advanced pages
pages/Inventory/components/InventoryTable.tsx # Feature-specific
layouts/MainLayout.tsx                 # Layouts
hooks/useInventory.ts                  # Custom hooks
services/InventoryService.ts           # Business logic
repositories/InventoryRepository.ts    # Data access
e2e/pages/<Name>Page.ts                # Page model for Playwright
e2e/test-integration/<Name>Page.<scenario>.spec.ts # Integration test for a page
e2e/test-storybook/<Component>.storybook.spec.ts # Storybook test for a component
<FileName>.test.tsx                    # Tests (co-located)
<Name>.stories.tsx                     # Stories (co-located)
```

**When to create a folder:**

- ✅ Component has custom hook: `useComponentName.ts`
- ✅ Component has types/schemas: `types.ts`, `schema.ts`
- ✅ Component has sub-components: `ComponentRow.tsx`
- ❌ Component is standalone < 200 lines with Tailwind only

## index.ts files

- Only for exporting multiple items from a folder
- Never use `export * from`, but always explicit exports

## Quick Decision Rules

### Component Type?

- **Generic:** Reusable UI, zero business logic, Shadcn/ui based
- **Feature:** Domain-specific, combines generics
- **Page:** Top-level route, compositional only
- **Layout:** Structure + responsive only

### Test Type?

- **Unit (70%):** Hooks, services, utilities, generic components
- **Integration (25%):** Page interactions
- **E2E (5%):** Critical user journeys

## Must/Avoid

### Generic Components

**MUST:**

- Start with Shadcn/ui components
- Use Tailwind utilities only
- Use Lucide icons
- Use Inter font
- Zero business logic

**AVOID:**

- Business logic
- Direct API calls
- Feature-specific behavior

**Reference:** `docs/examples/packages/frontend/components/generic-component.tsx`

### Feature Components

**MUST:**

- Compose generic components
- Receive data via props
- Handle domain logic
- Single responsibility

**Reference:** `docs/examples/packages/frontend/components/feature-component.tsx`

### Page Components

**MUST:**

- Be compositional (just compose components)
- Minimal styling (0-5 lines Tailwind max)
- Delegate to layouts
- Manage shared state if needed
- Each page must have their corresponding Page Object Model in e2e/pages/
- Each page must have a dedicated URL

**AVOID:**

- Business logic
- Direct API calls
- Styling (use layouts)

**Reference:** `docs/examples/packages/frontend/styling/page-minimal-styling-tailwind.tsx`

### Styling with Tailwind

**MUST:**

- Use Tailwind utilities exclusively
- Use `cn()` for conditional classes
- Use theme colors (`bg-primary`, never `bg-[#3b82f6]`)
- Use Inter via Tailwind font utilities
- Mobile-first responsive (Pixel 9a baseline: 393px)

**AVOID:**

- Inline styles
- Hardcoded colors
- CSS modules/separate style files
- Fixed widths

**References:**

- `docs/examples/packages/frontend/styling/tailwind-component.tsx` - cn() usage
- `docs/examples/packages/frontend/styling/theme-system-tailwind.css` - Theme setup
- `docs/examples/packages/frontend/styling/responsive-tailwind.tsx` - Responsive patterns
- `docs/examples/packages/frontend/styling/icon-usage.tsx` - Lucide icons

### Data Flow

**MUST:**

- Keep components free of API calls
- Transform data in service layer
- Expose via custom hooks
- Pass hook data to components via props

**AVOID:**

- Direct API calls in components
- Business logic in hooks (use service)
- Data transformation in repository

**References:**

- `docs/examples/packages/frontend/data-flow/api-client.ts`
- `docs/examples/packages/frontend/data-flow/repository.ts`
- `docs/examples/packages/frontend/data-flow/service.ts`
- `docs/examples/packages/frontend/data-flow/custom-hook.ts`

### Testing

**MUST:**

- Every component has `.stories.tsx`
- Mock service layer when testing hooks
- Test behavior, not implementation
- Maintain 70/25/5 pyramid
- Test only your component's scope (don't re-test internal components)

**References:**

- `docs/examples/packages/frontend/testing/unit-test-hook.test.ts`
- `docs/examples/packages/frontend/testing/integration-test-component.test.tsx`
- `docs/examples/packages/frontend/testing/storybook-stories.stories.tsx`
- `docs/examples/packages/frontend/testing/storybook-interaction-test.stories.tsx`

## Common Anti-Patterns

**For detailed anti-patterns with examples:** See `.claude/docs/frontend-antipatterns.md`

Quick list:

- Business logic in generic components
- Direct component-to-component communication
- API calls in components
- Context for <4 components
- Styling in page components
- Hardcoded colors
- Inline styles instead of Tailwind
- Not using cn() for conditional classes
- Testing implementation details
- Testing internal component behavior in parent tests
- Missing Storybook stories
- Services with UI concerns
- Global state for local features

## Example Files Reference

All examples: `docs/examples/packages/frontend/`

**Components:**

- `components/generic-component.tsx` - Shadcn/ui, Tailwind, Lucide
- `components/feature-component.tsx` - Domain logic
- `components/page-component.tsx` - Compositional
- `components/layout-component.tsx` - Structure

**State:**

- `state/props-communication.tsx` - Props pattern
- `state/context-usage.tsx` - Context pattern

**Data Flow:**

- `data-flow/api-client.ts` - HTTP client
- `data-flow/repository.ts` - Data access
- `data-flow/service.ts` - Business logic
- `data-flow/custom-hook.ts` - Service interface

**Testing:**

- `testing/unit-test-hook.test.ts` - Hook tests
- `testing/integration-test-component.test.tsx` - Integration tests
- `testing/storybook-stories.stories.tsx` - Story variants
- `testing/storybook-interaction-test.stories.tsx` - Interaction tests

**Styling:**

- `styling/tailwind-component.tsx` - cn() utility
- `styling/theme-system-tailwind.css` - Dark/light themes
- `styling/responsive-tailwind.tsx` - Mobile-first
- `styling/page-minimal-styling-tailwind.tsx` - Minimal page styling
- `styling/icon-usage.tsx` - Lucide patterns
