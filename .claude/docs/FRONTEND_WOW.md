# Frontend Architecture - Quick Reference

**For agents:** This is the essential guide. Load detailed references only when needed.

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

**Reference:** `docs/examples/frontend/components/`

### 2. State Management

**Props** - Use for <4 components
**Context** - Use for >4-5 components needing same state

**Reference:** `docs/examples/frontend/state/`

### 3. Data Flow (Required for each feature)

```
apiClient → Repository → Service → Hook → Component
```

**Reference:** `docs/examples/frontend/data-flow/`

## File Conventions

```
components/ui/<Name>.tsx              # Generic (Shadcn/ui based)
components/features/<Feature>/<Name>.tsx  # Feature-specific
pages/<Name>Page.tsx                  # Pages
layouts/<Name>.tsx                    # Layouts
hooks/use<Feature>.ts                 # Custom hooks
services/<Feature>Service.ts          # Business logic
repositories/<Feature>Repository.ts   # Data access
<FileName>.test.tsx                   # Tests (co-located)
<Name>.stories.tsx                    # Stories (co-located)
```

## Quick Decision Rules

### Context vs Props?
- **Props:** <4 components, <3 levels drilling
- **Context:** >4-5 components, >3 levels drilling

### Component Type?
- **Generic:** Reusable UI, zero business logic, Shadcn/ui based
- **Feature:** Domain-specific, combines generics
- **Page:** Top-level route, compositional only
- **Layout:** Structure + responsive only

### Test Type?
- **Unit (70%):** Hooks, services, utilities
- **Integration (25%):** Component interactions
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

**Reference:** `docs/examples/frontend/components/generic-component.tsx`

### Feature Components

**MUST:**
- Compose generic components
- Receive data via props
- Handle domain logic
- Single responsibility

**Reference:** `docs/examples/frontend/components/feature-component.tsx`

### Page Components

**MUST:**
- Be compositional (just compose components)
- Minimal styling (0-5 lines Tailwind max)
- Delegate to layouts
- Manage shared state if needed

**AVOID:**
- Business logic
- Direct API calls
- Styling (use layouts)

**Reference:** `docs/examples/frontend/styling/page-minimal-styling-tailwind.tsx`

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
- `docs/examples/frontend/styling/tailwind-component.tsx` - cn() usage
- `docs/examples/frontend/styling/theme-system-tailwind.css` - Theme setup
- `docs/examples/frontend/styling/responsive-tailwind.tsx` - Responsive patterns
- `docs/examples/frontend/styling/icon-usage.tsx` - Lucide icons

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
- `docs/examples/frontend/data-flow/api-client.ts`
- `docs/examples/frontend/data-flow/repository.ts`
- `docs/examples/frontend/data-flow/service.ts`
- `docs/examples/frontend/data-flow/custom-hook.ts`

### Testing

**MUST:**
- Every component has `.stories.tsx`
- Mock service layer when testing hooks
- Test behavior, not implementation
- Maintain 70/25/5 pyramid

**References:**
- `docs/examples/frontend/testing/unit-test-hook.test.ts`
- `docs/examples/frontend/testing/integration-test-component.test.tsx`
- `docs/examples/frontend/testing/storybook-stories.stories.tsx`
- `docs/examples/frontend/testing/storybook-interaction-test.stories.tsx`

## Common Anti-Patterns

**For detailed anti-patterns with examples:** See `.claude/docs/FRONTEND_ANTIPATTERNS.md`

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
- Missing Storybook stories
- Services with UI concerns
- Global state for local features

## Example Files Reference

All examples: `docs/examples/frontend/`

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
