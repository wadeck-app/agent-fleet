# React Examples

Comprehensive examples for React architecture, hooks patterns, and component composition in this project.

## Files Overview

### Architecture & Patterns

- **architecture.tsx** - Project structure and separation of concerns (components/hooks/services)
- **component.bad.tsx** - Anti-patterns: business logic in components
- **component.good.tsx** - Correct: pure components, logic in hooks
- **hooks.tsx** - Custom hooks patterns and structure
- **hooks-rules.tsx** - Rules of hooks with correct/incorrect examples
- **state-management.tsx** - State patterns, lifting state, derived state

### Advanced Topics

- **useeffect.tsx** - useEffect patterns, dependencies, cleanup
- **composition.tsx** - Component composition patterns
- **typescript.tsx** - TypeScript types for React
- **performance.tsx** - It's not needed to use "useMemo", "useCallback", "React.memo" because React Compiler is used.
- **testing.tsx** - Testing patterns for components and hooks

### Quick Reference

- **antipatterns.tsx** - Common mistakes with side-by-side fixes

## Key Principles

### Architecture (components/ vs hooks/ vs services/)

**components/**

- Pure UI rendering
- No business logic
- No useState for business state
- Props in, callbacks out

**hooks/**

- Business logic and state
- Reusable stateful logic
- Side effects
- Return state + actions

**services/**

- API calls
- External interactions
- No React hooks
- Pure functions or classes

### Component Best Practices

✅ **DO:**

- Keep components pure
- Extract logic to custom hooks
- Use composition
- Immutable state updates

❌ **DON'T:**

- Business logic in components
- Direct API calls
- Mutate state
- Skip hook rules

### Hook Best Practices

✅ **DO:**

- Always `use*` prefix
- Call at top level
- Specify dependencies
- Return consistent interface

❌ **DON'T:**

- Call conditionally
- Call in loops
- Skip dependencies
- Return inconsistent values

## Integration with Main Documentation

These examples are referenced from `../REACT_WOW.md`. The main doc provides conceptual guidance, these files provide runnable code.

## Usage

Copy patterns into your code, adapt to your needs, follow ✅ DO patterns, avoid ❌ DON'T patterns.
