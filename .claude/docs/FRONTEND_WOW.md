# Frontend Architecture - Best Practices Guide

## Technology Stack

### Core Framework
- **React 19** - UI library with hooks
- **TypeScript 5.3+** - Strict mode enforced
- **Radix UI** - Accessible primitive components
- **SCSS Modules** - Component-scoped styling
- **Vitest + React Testing Library** - Unit and integration tests
- **Storybook** - Component development and documentation
- **Playwright** - E2E testing

## Core Principles

### 1. Component Hierarchy

**MUST follow this strict hierarchy:**

1. **Generic Components** - Pure UI, zero business logic, based on Radix UI
2. **Feature Components** - Compose generic components with domain logic
3. **Page Components** - Purely compositional, bring components together
4. **Layout Components** - Handle structural positioning

**MUST:**
- Base all generic components on Radix UI primitives
- Keep business logic out of generic components
- Make page components compositional only (no logic)
- Handle all responsive behavior in layout components

**AVOID:**
- Business logic in generic components
- Direct styling in page components
- Mixing presentation and business logic

**Reference:** See `docs/examples/frontend/components/`

### 2. State Management Strategy

**Component communication rules:**

**MUST:**
- Communicate between components ONLY through props
- Lift shared state to parent page component
- Create dedicated context when page manages state for >4-5 components
- Justify and properly scope all context usage

**AVOID:**
- Direct component-to-component communication
- Global state for local features
- Context for <4 components (use props)

**Reference:**
- Props: `docs/examples/frontend/state/props-communication.tsx`
- Context: `docs/examples/frontend/state/context-usage.tsx`

### 3. Data Flow Architecture

**Layered structure (MUST follow for each feature):**

1. **apiClient** - Generic HTTP client (reusable)
2. **xxxRepository** - Feature-specific data access
3. **xxxService** - Business logic and data transformation
4. **useXxx** - Custom hook exposing service functionality
5. **Components** - Pure presentation consuming hooks via props

**MUST:**
- Keep components free of direct API calls
- Transform API data in service layer
- Expose functionality through custom hooks
- Pass hook data to components via props

**Reference:** See `docs/examples/frontend/data-flow/`

## File Conventions

**Generic Components:** `components/ui/<ComponentName>.tsx` (e.g., `Button.tsx`)
**Feature Components:** `components/features/<FeatureName>/<ComponentName>.tsx`
**Pages:** `pages/<PageName>Page.tsx` (e.g., `TasksPage.tsx`)
**Layouts:** `layouts/<LayoutName>.tsx` (e.g., `MainLayout.tsx`)
**Hooks:** `hooks/use<FeatureName>.ts` (e.g., `useTasks.ts`)
**Services:** `services/<FeatureName>Service.ts`
**Repositories:** `repositories/<FeatureName>Repository.ts`
**Styles:** `<ComponentName>.module.scss` (co-located with component)
**Tests:** `<FileName>.test.tsx` (co-located)
**Stories:** `<ComponentName>.stories.tsx` (co-located)

## Decision Rules

### When to Create Context

**Use context when:**
- Page manages state for >4-5 components
- Props drilling becomes unwieldy (>3 levels)
- State is truly shared across component tree

**Use props when:**
- <4 components need the state
- Props drilling is <3 levels
- State is localized to section of page

**Reference:** See `docs/examples/frontend/state/context-usage.tsx`

### Component Type Selection

**Generic component when:**
- UI pattern reusable across features
- Zero business logic needed
- Can be built on Radix UI primitive

**Feature component when:**
- Needs domain-specific logic
- Combines multiple generic components
- Specific to one feature/domain

**Page component when:**
- Top-level route component
- Needs to compose multiple features
- Manages shared state for children

**Layout component when:**
- Handles structural positioning only
- Manages responsive behavior
- Reusable across multiple pages

### Testing: Unit vs Integration vs E2E

**Unit tests when:**
- Testing hooks in isolation
- Testing services/utilities
- Testing data transformations
- **Target: 70% of test suite**

**Integration tests when:**
- Testing component interactions
- Testing data flow through hooks
- Testing context behavior
- **Target: 25% of test suite**

**E2E tests when:**
- Testing critical user journeys
- Testing cross-page flows
- **Target: 5% of test suite**

**Reference:** See `docs/examples/frontend/testing/`

## Component Architecture

### Generic Components

**MUST:**
- Build on Radix UI primitives
- Contain zero business logic
- Accept only presentation props
- Be fully reusable across features

**Reference:** See `docs/examples/frontend/components/generic-component.tsx`

### Feature Components

**MUST:**
- Compose generic components
- Receive data via props (from hooks)
- Handle domain-specific logic
- Maintain single responsibility

**Reference:** See `docs/examples/frontend/components/feature-component.tsx`

### Page Components

**MUST:**
- Be purely compositional
- Contain virtually zero styling (0-5 lines CSS max)
- Delegate to layout components for structure
- Manage shared state for children

**AVOID:**
- Business logic in pages
- Direct API calls in pages
- Styling logic in pages

**Reference:** See `docs/examples/frontend/components/page-component.tsx`

### Layout Components

**MUST:**
- Handle structural positioning only
- Manage responsive behavior
- Be reusable across pages
- Use SCSS modules for styling

**Reference:** See `docs/examples/frontend/components/layout-component.tsx`

## Data Flow Patterns

### API Client

**Pattern:** Generic HTTP client reusable across all features.

**MUST:**
- Implement generic request methods (GET, POST, PATCH, DELETE)
- Handle errors consistently
- Be framework-agnostic

**Reference:** See `docs/examples/frontend/data-flow/api-client.ts`

### Repository

**Pattern:** Feature-specific data access layer.

**MUST:**
- Encapsulate all API calls for a feature
- Return raw API data (no transformation)
- Have single responsibility (data fetching)

**AVOID:**
- Business logic in repositories
- Data transformation in repositories
- Calling other repositories

**Reference:** See `docs/examples/frontend/data-flow/repository.ts`

### Service

**Pattern:** Business logic and data transformation layer.

**MUST:**
- Transform API data for UI consumption
- Implement business rules
- Coordinate multiple repository calls if needed

**AVOID:**
- Direct API calls (use repository)
- UI concerns (formatting should be minimal)
- Service-to-service calls (use composition)

**Reference:** See `docs/examples/frontend/data-flow/service.ts`

### Custom Hook

**Pattern:** Expose service functionality to components.

**MUST:**
- Manage loading/error states
- Provide data and actions to components
- Be the only interface between service and UI

**AVOID:**
- Business logic in hooks (belongs in service)
- Direct API calls (use service)
- Side effects without cleanup

**Reference:** See `docs/examples/frontend/data-flow/custom-hook.ts`

## Testing Strategy

### Test Pyramid

**Distribution (MUST maintain):**
- 70% Unit tests (hooks, services, utilities)
- 25% Integration tests (component interactions)
- 5% E2E tests (critical user journeys)

### Unit Tests

**MUST test:**
- Hook behavior and state management
- Service logic and data transformations
- Utility functions

**Mock:**
- Service layer (when testing hooks)
- External dependencies

**Reference:** See `docs/examples/frontend/testing/unit-test-hook.test.ts`

### Integration Tests

**MUST test:**
- Component interactions
- Data flow through hooks
- Context state management
- User interactions with UI

**Reference:** See `docs/examples/frontend/testing/integration-test-component.test.tsx`

### Storybook Requirements

**Every component MUST have:**
- Corresponding `.stories.tsx` file
- All variants demonstrated
- Interaction tests using `@storybook/test`
- Accessibility validation
- Proper documentation and controls

**Reference:**
- Stories: `docs/examples/frontend/testing/storybook-stories.stories.tsx`
- Interactions: `docs/examples/frontend/testing/storybook-interaction-test.stories.tsx`

## Styling Conventions

### SCSS Modules

**MUST:**
- Each component has dedicated `.module.scss` file
- Use SCSS modules for scoping (not global styles)
- Co-locate styles with components
- Reference theme variables, never hardcode colors

**AVOID:**
- Global styles for components
- Inline styles (use SCSS modules)
- Hardcoded colors (use CSS custom properties)

**Reference:** See `docs/examples/frontend/styling/component-styles.module.scss`

### Theme System

**MUST:**
- Implement both dark and light themes
- Use CSS custom properties (`--color-*`) for all theme-dependent values
- Define global variables in centralized theme file
- Components reference variables, never hardcode

**Theme affects:**
- Brightness/contrast primarily
- Background/surface colors
- Text colors
- Border colors

**Reference:** See `docs/examples/frontend/styling/theme-system.scss`

### Responsive Design

**MUST:**
- Use mobile-first approach
- Use Pixel 9a dimensions (393px × 851px) as mobile baseline
- Standard desktop window sizes for desktop breakpoint
- Use SCSS mixins for breakpoint management

**Breakpoints:**
- Mobile: < 768px (default)
- Desktop: >= 768px
- Large Desktop: >= 1200px

**MUST:**
- Layout components handle responsive behavior
- Use flexbox/grid for layout
- Avoid fixed widths (use percentages/flex)

**Reference:** See `docs/examples/frontend/styling/responsive-layout.module.scss`

### Page Styling Rules

**MUST:**
- Pages contain minimal to zero styling (0-5 lines max)
- Delegate all structural styling to layout components
- Delegate all component styling to components themselves

**Reference:** See `docs/examples/frontend/styling/page-minimal-styling.tsx`

## Anti-Patterns

### ❌ Business Logic in Generic Components

**Problem:** Generic components become feature-specific, not reusable.

**Solution:** Extract logic to feature component, pass data via props.

### ❌ Direct Component-to-Component Communication

**Problem:** Tight coupling, hard to test, unpredictable data flow.

**Solution:** Use props, lift state to parent component.

**Reference:** See `docs/examples/frontend/state/props-communication.tsx`

### ❌ API Calls Directly in Components

**Problem:** Hard to test, violates separation of concerns, no data transformation.

**Solution:** Use data flow architecture (repository → service → hook → component).

**Reference:** See `docs/examples/frontend/data-flow/`

### ❌ Using Context for <4 Components

**Problem:** Unnecessary complexity, harder to understand data flow.

**Solution:** Use props for <4 components, context only for >4-5.

**Reference:** See `docs/examples/frontend/state/context-usage.tsx`

### ❌ Styling in Page Components

**Problem:** Pages become coupled to specific layouts, hard to reuse components.

**Solution:** Zero styling in pages, delegate to layout components.

**Reference:** See `docs/examples/frontend/styling/page-minimal-styling.tsx`

### ❌ Hardcoded Colors

**Problem:** Themes don't work, inconsistent design, hard to maintain.

**Solution:** Use CSS custom properties (`--color-*`) for all colors.

**Reference:** See `docs/examples/frontend/styling/theme-system.scss`

### ❌ Testing Implementation Details

**Problem:** Tests break when refactoring, brittle test suite.

**Solution:** Test behavior (user interactions, outputs), not implementation.

**Reference:** See `docs/examples/frontend/testing/integration-test-component.test.tsx`

### ❌ Missing Storybook Stories

**Problem:** No visual documentation, no isolated component development.

**Solution:** Create `.stories.tsx` for every component with all variants.

**Reference:** See `docs/examples/frontend/testing/storybook-stories.stories.tsx`

### ❌ Services with UI Concerns

**Problem:** Services become coupled to UI, hard to reuse/test.

**Solution:** Services return data, components handle formatting.

### ❌ Global State for Local Features

**Problem:** Unnecessary complexity, state pollution, hard to debug.

**Solution:** Scope state to feature context or parent component.

## Examples Reference

**Path:** `docs/examples/frontend/`

### Components
- `components/generic-component.tsx` - Pure UI, Radix UI-based
- `components/feature-component.tsx` - Domain logic with composition
- `components/page-component.tsx` - Compositional, zero styling
- `components/layout-component.tsx` - Structural positioning

### State Management
- `state/props-communication.tsx` - Component communication via props
- `state/context-usage.tsx` - Context for >4-5 components

### Data Flow
- `data-flow/api-client.ts` - Generic HTTP client
- `data-flow/repository.ts` - Feature-specific data access
- `data-flow/service.ts` - Business logic and transformation
- `data-flow/custom-hook.ts` - Service to component interface

### Testing
- `testing/unit-test-hook.test.ts` - Hook unit tests (70%)
- `testing/integration-test-component.test.tsx` - Component integration (25%)
- `testing/storybook-stories.stories.tsx` - Storybook variants
- `testing/storybook-interaction-test.stories.tsx` - Interaction tests

### Styling
- `styling/component-styles.module.scss` - SCSS module pattern
- `styling/theme-system.scss` - Dark/light theme with CSS variables
- `styling/responsive-layout.module.scss` - Mobile-first responsive
- `styling/page-minimal-styling.tsx` - Zero styling in pages
