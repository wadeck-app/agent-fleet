# TODO: Nested Tabs URL State Management Story

## Problem

Currently, we have complex bidirectional synchronization between React state and URL parameters using `useUrlState`. This creates race conditions, double flushes, and flash-loads when switching between nested tabs (Projects → Workspaces → Views).

## Proposed Solution

Implement a clean unidirectional data flow pattern:

```
URL (source of truth) → State → Display
User Action → URL Update (explicit)
```

### Architecture Principles

1. **URL as Single Source of Truth**
    - Read URL params at page load
    - Parse and validate params
    - No automatic state-to-URL sync

2. **Data Loading Based on URL**
    - Load projects
    - Auto-select from URL or first available
    - Load workspaces for selected project
    - Auto-select workspace from URL or first available
    - Load data for selected workspace

3. **User Actions Update URL Explicitly**
    - Click on project tab → `setSearchParams({ projectId })`
    - Click on workspace tab → `setSearchParams({ projectId, workspaceId })`
    - Click on view tab → `setSearchParams({ projectId, workspaceId, view })`
    - No automatic synchronization, no effects writing to URL

### Benefits

- ✅ Eliminates race conditions
- ✅ No double flushes
- ✅ No flash-loads
- ✅ Predictable data flow
- ✅ Simpler code (no complex batching/flush logic)

### Implementation Story

#### Phase 1: Simple Tabs (Current Refactor)

- Remove `useUrlState` bidirectional sync
- Read URL params directly with `useSearchParams`
- User clicks explicitly update URL
- Test with Projects → Workspaces → Views

#### Phase 2: Nested Tab Groups

Handle complex scenarios with multiple levels of nesting:

**Example 1: Scripts Panel with Layout**

```
?projectId=X&workspaceId=Y&view=scripts&layout=split&panels=scriptA,scriptB
```

**Example 2: Tasks with Filters**

```
?projectId=X&workspaceId=Y&view=tasks&status=active&priority=high
```

**Design Questions:**

1. How to handle parent-child relationships?
    - When projectId changes, should workspaceId be cleared?
    - When view changes from 'scripts' to 'tasks', should layout/panels params be cleared?

2. How to handle default values?
    - If no view specified, default to 'tasks'
    - If no layout specified when view=scripts, default to 'single'
    - Should defaults appear in URL or only on user interaction?

3. How to handle invalid combinations?
    - projectId=X but workspaceId=Y doesn't belong to X
    - view=scripts but workspace has no scripts configured
    - Should we redirect? Show error? Auto-correct?

4. How to preserve unrelated params?
    - User on `?projectId=X&debug=true`
    - Clicks workspace → should become `?projectId=X&workspaceId=Y&debug=true`
    - Need to merge params intelligently

**Proposed API:**

```typescript
interface UrlStateManager {
	// Read current state
	get(key: string): string | null;

	// Update with automatic cleanup of child params
	set(
		updates: Record<string, string | null>,
		options?: {
			clearChildren?: boolean; // Auto-clear nested params
			preserveOthers?: boolean; // Keep unrelated params
		}
	): void;

	// Define param hierarchy
	defineHierarchy(config: {
		parent: string;
		children: string[];
		onParentChange?: (parent: string | null) => Record<string, string | null>;
	}): void;
}

// Usage
urlState.defineHierarchy({
	parent: 'projectId',
	children: ['workspaceId', 'view'],
	onParentChange: projectId => {
		// When project changes, reset workspace and view
		return { workspaceId: null, view: null };
	},
});

urlState.defineHierarchy({
	parent: 'view',
	children: ['layout', 'panels'],
	onParentChange: view => {
		// When view changes away from 'scripts', clear script-specific params
		if (view !== 'scripts') {
			return { layout: null, panels: null };
		}
		return {};
	},
});
```

#### Phase 3: History & Navigation

- Browser back/forward should work correctly
- Deep linking should work (paste URL → correct page state)
- URL should be bookmarkable

### Testing Strategy

1. **Unit tests** for URL parsing/updating logic
2. **Integration tests** with agent-browser:
    - Navigate through nested tabs
    - Verify URL updates
    - Test browser back/forward
    - Test deep linking
3. **Manual testing** of complex scenarios

### References

- Current issue: `.claude/plans/[current-plan-name].md`
- Related: `useUrlState` hook refactor
- Similar patterns: React Router loaders, Remix URL state management

## Status

- [ ] Phase 1: Simple tabs refactor (IN PROGRESS)
- [ ] Phase 2: Nested tab groups design
- [ ] Phase 3: History & navigation
- [ ] Documentation & examples
- [ ] Migration guide for existing pages

## Notes

- Keep `useUrlState` for simple cases (single param, no nesting)
- Create `useTabNavigation` or similar for complex nested scenarios
- Document best practices and anti-patterns
