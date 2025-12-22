# React Best Practices for Agents

**Purpose:** Essential guide for React architecture, hooks patterns, and component composition in this project.

**For agents:** Load this when working in `packages/frontend/` directory.

## Core Principles

1. **Component purity** - Components must be idempotent, same input = same output
2. **Custom hooks for logic** - Extract stateful logic into reusable hooks
3. **Separation of concerns** - components/ vs hooks/ vs services/
4. **Composition over complexity** - Small, focused components
5. **Props down, events up** - Unidirectional data flow

---

## Project Architecture

### Directory Structure

```
packages/frontend/src/
├── components/       # Generic, reusable UI components (based on Radix)
├── features/         # Feature-specific components
├── hooks/           # Custom hooks (business logic)
├── services/        # API calls and external interactions
├── pages/           # Page-level components
└── utils/           # Pure utility functions
```

### Responsibility Separation

**components/** - Pure UI, no business logic

- Based on Radix UI primitives
- Accept props, render UI
- Emit events via callbacks
- **No useState for business logic**

**hooks/** - Business logic and state

- Custom hooks with `use*` prefix
- State management with useState/useReducer
- Side effects with useEffect
- Return state and update functions

**services/** - External interactions

- API calls
- LocalStorage access
- WebSocket connections
- No React hooks inside

**Example:** See `.claude/docs/examples/react/architecture.tsx`

---

## Component Best Practices

### ✅ DO

1. **Keep components pure** - No side effects during render
2. **Extract to custom hooks** - Move logic out of components
3. **Use composition** - Combine small components
4. **Props for configuration** - Pass data down
5. **Callbacks for events** - Bubble events up

### ❌ DON'T

- **useState in feature components** - Use custom hooks instead
- **Business logic in JSX** - Extract to hooks
- **Direct API calls** - Use services + hooks
- **Prop drilling** - Use composition or context
- **Mutations** - Always use immutable updates

**Examples:**

- Bad: `.claude/docs/examples/react/component.bad.tsx`
- Good: `.claude/docs/examples/react/component.good.tsx`

---

## Custom Hooks Patterns

### When to Create a Custom Hook

1. **Stateful logic** that can be reused
2. **Complex state management** in multiple components
3. **Side effects** that need to be shared
4. **API integration** with loading/error states

### Hook Structure

**Naming:** Always start with `use*`

**Return:** Consistent interface

- State values
- Update functions
- Loading/error states
- Action functions

**Location:** `packages/frontend/src/hooks/`

**Example:** See `.claude/docs/examples/react/hooks.tsx`

---

## Rules of Hooks - CRITICAL

### ✅ DO

1. **Call hooks at top level** - Never in loops, conditions, or nested functions
2. **Call from React functions** - Components or custom hooks only
3. **Use dependency arrays** - Always specify useEffect dependencies
4. **Follow naming convention** - `use*` prefix for custom hooks

### ❌ DON'T

- Call hooks conditionally
- Call hooks in loops
- Call hooks after early returns
- Call hooks from regular functions

**Example:** `.claude/docs/examples/react/hooks-rules.tsx`

---

## State Management

### State Location Decision Tree

1. **Single component?** → useState in that component
2. **Shared by siblings?** → Lift to common parent
3. **Complex logic?** → Extract to custom hook
4. **Global state?** → Context or state management library

### State Best Practices

**Keep state minimal** - DRY principle

- Don't duplicate data that can be computed
- Don't store what can be derived from props
- Use derived state instead of mirroring props

**Immutable updates** - Never mutate directly

- Arrays: `[...arr, newItem]` not `arr.push(newItem)`
- Objects: `{ ...obj, key: value }` not `obj.key = value`

**Example:** See `.claude/docs/examples/react/state-management.tsx`

---

## useEffect Best Practices

### When to Use useEffect

1. **Synchronizing with external systems** - APIs, WebSockets, timers
2. **Side effects after render** - DOM manipulations, subscriptions
3. **Cleanup required** - Unsubscribe, clear timers

### When NOT to Use useEffect

1. **Transforming data for rendering** - Use derived state instead
2. **Handling user events** - Use event handlers
3. **Initializing state** - Use lazy initialization

### Dependency Array Rules

**Always specify dependencies** - ESLint will help

**Common patterns:**

- `[]` - Run once on mount
- `[dep1, dep2]` - Run when dependencies change
- No array - Run on every render (rarely needed)

**Example:** See `.claude/docs/examples/react/useeffect.tsx`

---

## Component Composition

### Composition Patterns

1. **Container/Presentational** - Separate logic from UI
2. **Compound Components** - Related components working together
3. **Render Props** - Share logic via function props
4. **Children as function** - Flexible composition

### Props Patterns

**Destructure props** - Clear interface

```typescript
function MyComponent({ title, onAction }: Props) { ... }
```

**Default props** - Use TypeScript defaults or destructuring

```typescript
function MyComponent({ size = 'medium' }: Props) { ... }
```

**Rest props** - Pass through to child

```typescript
function MyComponent({ title, ...rest }: Props) {
  return <div {...rest}>{title}</div>;
}
```

**Example:** See `.claude/docs/examples/react/composition.tsx`

---

## TypeScript with React

### Component Types

**Function components:**

```typescript
type Props = { title: string; count: number };
function MyComponent({ title, count }: Props) { ... }
```

**Event handlers:**

```typescript
const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => { ... };
```

**Children:**

```typescript
type Props = { children: React.ReactNode };
```

**Example:** See `.claude/docs/examples/react/typescript.tsx`

---

## Common Anti-Patterns

### 1. useState in Feature Components

❌ **Bad:** Business logic in component
✅ **Good:** Extract to custom hook

### 2. Prop Drilling

❌ **Bad:** Passing props through many levels
✅ **Good:** Context or better composition

### 3. Derived State

❌ **Bad:** Storing computed values in state
✅ **Good:** Calculate during render

### 4. Missing Cleanup

❌ **Bad:** useEffect without cleanup
✅ **Good:** Return cleanup function

### 5. Mutating State

❌ **Bad:** `arr.push(item)`
✅ **Good:** `setArr([...arr, item])`

**See:** `.claude/docs/examples/react/antipatterns.tsx` for detailed examples

---

## Performance Optimization

**⚠️ IMPORTANT: This project uses React Compiler**

React Compiler automatically optimizes components by adding `useMemo`, `React.memo`, and similar optimizations. **Do NOT manually add these** unless absolutely necessary.

**Only add `useCallback` when ESLint requires it** (e.g., for dependency arrays).

### When to Optimize

1. **Measured performance issue** - Profile first
2. **Large lists** - Virtualization
3. **Heavy computations** - Let React Compiler handle it

### React Compiler Handles

- ✅ Automatic memoization (`useMemo`)
- ✅ Component memoization (`React.memo`)
- ✅ Most callback optimizations

### Manual Optimization (Rare)

**useCallback** - Only when ESLint requires it for dependency arrays

**Example:** See `.claude/docs/examples/react/performance.tsx`

---

## Testing Patterns

### What to Test

1. **User interactions** - Clicks, inputs, navigation
2. **Conditional rendering** - Different states
3. **Error states** - Error boundaries, loading states
4. **Accessibility** - ARIA attributes, keyboard navigation

### Testing Hooks

Use `@testing-library/react` and `@testing-library/react-hooks`

**Example:** See `.claude/docs/examples/react/testing.tsx`

---

## Summary for Agents

**When working in packages/frontend/:**

1. **Architecture:**
    - components/ = UI only (no business logic)
    - hooks/ = Business logic and state
    - services/ = API calls (no React)

2. **Components:**
    - Keep pure (same input = same output)
    - Extract logic to custom hooks
    - Use composition over complexity

3. **Hooks:**
    - Always `use*` prefix
    - Call at top level only
    - Specify dependencies for useEffect

4. **State:**
    - Keep minimal (don't duplicate)
    - Immutable updates only
    - Lift state when needed

5. **Never:**
    - useState for business logic in components
    - Mutate state directly
    - Call hooks conditionally
    - Skip useEffect dependencies

**Result:** Clean, maintainable, testable React code following project architecture.

---

## Examples Index

All code examples are in `.claude/docs/examples/react/`:

- `architecture.tsx` - Project structure and separation of concerns
- `component.bad.tsx` - Anti-patterns in components
- `component.good.tsx` - Well-structured components
- `hooks.tsx` - Custom hooks patterns
- `hooks-rules.tsx` - Rules of hooks with examples
- `state-management.tsx` - State patterns and lifting state
- `useeffect.tsx` - useEffect patterns and cleanup
- `composition.tsx` - Component composition patterns
- `typescript.tsx` - TypeScript types for React
- `antipatterns.tsx` - Common mistakes with fixes
- `performance.tsx` - Optimization patterns
- `testing.tsx` - Testing patterns
- `README.md` - Examples overview
