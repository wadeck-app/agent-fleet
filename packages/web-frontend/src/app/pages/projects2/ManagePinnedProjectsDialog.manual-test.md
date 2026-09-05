# Manual Test Plan - Optimistic Updates with Delays

## Setup: Add Artificial Delay

Temporarily modify the API calls to add delays to observe optimistic states.

### In `ProjectsV2Page.tsx` (or wherever the handlers are):

```typescript
const handlePin = async (projectId: string) => {
	console.log('[TEST] Starting pin:', projectId);

	// Add 2 second delay to see optimistic state
	await new Promise(resolve => setTimeout(resolve, 2000));

	await actualPinFunction(projectId);
	console.log('[TEST] Pin completed:', projectId);
};
```

## Test Scenarios

### Scenario 1: PIN with Delay

**Expected Behavior:**

1. Click ← on "Project Gamma" in Available (right) panel
2. **IMMEDIATELY:** Project Gamma should appear in Pinned (left) panel
3. **IMMEDIATELY:** Project Gamma should show opacity-50 + pointer-events-none (loading state)
4. **WAIT 2 seconds**
5. **AFTER API:** Loading state clears, project stays in position (or moves if server assigns different order)

**Current Bug:**

- Project appears in left panel immediately 
- NO loading state visible 
- After API, project jumps to different position 

### Scenario 2: UNPIN with Delay

**Expected Behavior:**

1. Click → on "Project Alpha" in Pinned (left) panel
2. **IMMEDIATELY:** Project Alpha should appear in Available (right) panel
3. **IMMEDIATELY:** Project Alpha should show opacity-50 (loading state)
4. **WAIT 2 seconds**
5. **AFTER API:** Loading state clears, project stays in Available

**Current Behavior:**

- Works correctly 

### Scenario 3: REORDER with Delay

**Expected Behavior:**

1. Drag "Project Beta" above "Project Alpha"
2. **IMMEDIATELY:** Projects reorder
3. **IMMEDIATELY:** ALL pinned projects show opacity-50 (reordering state)
4. **WAIT 2 seconds**
5. **AFTER API:** Reordering state clears

**Current Bug:**

- Projects reorder immediately 
- NO reordering state visible 

## Debug Checklist

### Check 1: Is loadingItems set correctly?

Add console.log to ManagePinnedProjectsDialog:

```typescript
console.log('[DEBUG] loadingItems:', Array.from(loadingItems));
console.log('[DEBUG] reorderingItems:', Array.from(reorderingIds));
```

### Check 2: Are actions passed to renderer?

Add console.log in leftItemRenderer:

```typescript
leftItemRenderer={(project, actions) => {
  console.log('[DEBUG] Rendering', project.name, 'actions:', actions);
  return <DualListItem ... />
}}
```

### Check 3: Does DualListItem receive props?

Add console.log in DualListItem component:

```typescript
console.log('[DualListItem]', label, 'isLoading:', isLoading, 'isReordering:', isReordering);
```

### Check 4: Are CSS classes applied?

In DualListItem, log the className:

```typescript
console.log('[DualListItem] containerClasses:', containerClasses);
```

## Expected Logs for PIN

```
[TEST] Starting pin: project-3
[DEBUG] loadingItems: ['project-3']
[DEBUG] Rendering Project Gamma actions: { isLoading: true, isReordering: false }
[DualListItem] Project Gamma isLoading: true isReordering: false
[DualListItem] containerClasses: flex items-center gap-2 rounded-sm transition-colors hover:bg-accent pointer-events-none opacity-50
... wait 2 seconds ...
[TEST] Pin completed: project-3
[DEBUG] loadingItems: []
[DEBUG] Rendering Project Gamma actions: { isLoading: false, isReordering: false }
```

If logs don't match this, we found the bug!
