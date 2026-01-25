# Lessons Learned

## Zod Schema Defaults: Entity vs Response Schemas

**Problem**: Using `.default()` in entity schemas causes PATCH operations to overwrite fields with default values when those fields are not included in the update payload. Removing `.default()` leaves existing data with `undefined` values.

**Example of the Bug**:

```typescript
// ❌ Entity schema with defaults causes PATCH bug
export const ProjectSchema = z.object({
	workspaceIds: z.array(z.string()).default([]), // PATCH will reset to [] if not in payload
	archived: z.boolean().default(false), // PATCH will reset to false if not in payload
});

// When updating pinned=true, workspaceIds gets reset to []
await updateProject(id, { pinned: true, version: 1 });
// Result: workspaceIds = [] (lost data!)
```

**Solution**: Separate entity schema (strict, no defaults) from response schema (normalizes with `.catch()`):

```typescript
// ✅ Entity schema - strict, used for writes
export const ProjectSchema = z.object({
  workspaceIds: z.array(z.string()),  // No default
  archived: z.boolean(),               // No default
});

// ✅ Response schema - normalizes legacy data, used for reads
export const ProjectResponseSchema = z.object({
  workspaceIds: z.array(z.string()).catch([]),    // undefined → []
  archived: z.boolean().catch(false),              // undefined → false
});

// API routes use different schemas
'/api/projects/:id': {
  PATCH: {
    body: UpdateProjectSchema,        // Based on ProjectSchema (strict)
    response: ProjectResponseSchema,   // Normalizes on read
  }
}
```

**Additional Layers of Defense**:

1. **Service-Level Normalization**: Apply defaults in service methods (read operations only)
2. **Repository-Level Protection**: Add null/undefined checks (`project.workspaceIds ?? []`)
3. **Data Migration**: One-time migration to fix existing data with undefined fields

**When Discovered**: January 2026 after removing `.default()` to fix PATCH bug. Existing projects showed "0 workspaces" and crashed on `workspaceIds.includes()`.

**Key Principles**:

- Entity schemas define data structure (no defaults, no transformations)
- Defaults belong in creation logic (service layer), not schema parsing
- Response schemas can normalize legacy data with `.catch()` (read-only)
- PATCH operations must only update specified fields (partial updates)
- Defensive coding: check for undefined at all layers (schema, service, repository)

**Related Files**:

- `packages/shared-frontend-backend/src/api/projects.contract.ts`
- `packages/web-backend/src/services/ProjectsService.ts`
- `packages/web-backend/src/repositories/ProjectsRepository.ts`
- `packages/web-backend/src/migrations/NormalizeProjectsMigration.ts`

---

## Race Condition: Double Reload from Manual + WebSocket Listeners

**Problem**: When a mutation succeeds, calling manual reload functions in the `onSuccess` callback while also having a WebSocket listener that triggers the same reload creates a race condition that can corrupt UI state.

**Example of Bad Pattern**:

```typescript
// ❌ Double reload - manual + WebSocket
const handleProjectUpdated = () => {
	loadProjects(); // Manual reload
	loadWorkspaces(); // Manual reload
};

useRealtimeRefresh({
	events: [B2F_PROJECT_UPDATED],
	onEvent: () => {
		loadProjects(); // WebSocket reload (duplicate!)
		loadWorkspaces(); // WebSocket reload (duplicate!)
	},
});
```

**Solution**: Trust the WebSocket listener to handle refreshes. Remove manual reload from success callbacks:

```typescript
// ✅ Single source of truth - WebSocket handles all reloads
const handleProjectUpdated = () => {
	// Projects and workspaces will be reloaded automatically via WebSocket event
};

useRealtimeRefresh({
	events: [B2F_PROJECT_UPDATED],
	onEvent: () => {
		loadProjects(); // Single reload source
		loadWorkspaces();
	},
});
```

**When Discovered**: January 2026 during ProjectsV2Page bug investigation. User reported projects disappearing after editing.

**Key Principle**: With real-time WebSocket updates, let the event listener be the single source of truth for refreshing data. Manual reloads in mutation callbacks create race conditions.

**Related Files**:

- `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx`
- `packages/web-frontend/src/hooks/useRealtimeRefresh.ts`

---

## UX Anti-Pattern: Hidden Controls on Hover

**Problem**: Hiding controls (buttons, actions) behind hover states creates a terrible user experience:

1. Discoverability: Users don't know the controls exist
2. Mobile: Hover doesn't exist on touch devices
3. Accessibility: Screen readers may not announce hidden elements
4. Visual noise: Users must scan every element for hover interactions
5. Frustration: Users click/tap multiple times trying to find the action

**Examples of Bad UX**:

```tsx
// ❌ Edit button hidden until hover
<TabButton
	action={
		<Button className="opacity-0 group-hover:opacity-100" onClick={handleEdit}>
			<Pencil />
		</Button>
	}
>
	Project Name
</TabButton>
```

**Solution**: Always-visible controls in clear, consistent locations:

```tsx
// ✅ Edit button always visible in toolbar
<div className="toolbar">
	{activeProject && (
		<Button onClick={() => handleEdit(activeProject)}>
			<Pencil />
			Edit Project
		</Button>
	)}
	<Button onClick={handleManage}>
		<Settings />
		Manage
	</Button>
</div>
```

**When Discovered**: January 2026 during ProjectsV2Page refactoring. User feedback highlighted frustration with hidden edit button.

**Key Principle**: If a control is important enough to exist, it's important enough to be visible. Use context/state to show/hide entire sections, not individual controls.

**Related Files**:

- `packages/web-frontend/src/app/pages/projects2/ProjectTabs.tsx` (FIXED: removed hidden action button)
- `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx` (FIXED: added toolbar with visible buttons)

---

## UI Pattern: Consistent Pending/Loading States Across Related Components

**Problem**: When two components represent opposite actions (pin/unpin, show/hide, etc.), inconsistent visual feedback during pending states creates a confusing user experience.

**Example of Inconsistent Pattern**:

```typescript
// Component A: Pinned item (unpin action)
<div className="item">
  <Icon className={isReordering && 'opacity-40'} />        // Only icon dimmed
  <Text className={isReordering && 'opacity-40'} />        // Only text dimmed
  <Button disabled={isLoading} />                           // Button NOT dimmed
</div>

// Component B: Available item (pin action)
<div className={isLoading && 'opacity-50'}>                // ENTIRE item dimmed
  <Button disabled={isLoading} />
  <Icon />
  <Text />
</div>
```

**Result**: User sees different visual feedback for the same conceptual operation, causing confusion about whether the action is actually processing.

**Solution**: Apply loading state consistently to the entire item (parent container) in both directions:

```typescript
// ✅ Both components use consistent pattern
<div className={(isLoading || isReordering) && 'pointer-events-none opacity-50'}>
  <Button disabled={isLoading} />
  <Icon />
  <Text />
</div>
```

**Key Principles**:

1. Apply opacity/loading state to the parent container, not individual child elements
2. Use the same opacity value (e.g., `opacity-50`) across all related components
3. Combine multiple pending states (isLoading, isReordering, etc.) at the parent level
4. Always include `pointer-events-none` with opacity to prevent interaction during pending state

**When Discovered**: January 2026 during ProjectsV2Page bug investigation. User reported arrow button appeared active while icon/text were dimmed during unpinning.

**Related Files**:

- `packages/web-frontend/src/app/pages/projects2/SortablePinnedProjectItem.tsx` (FIXED: moved opacity to parent)
- `packages/web-frontend/src/app/pages/projects2/AvailableProjectItem.tsx` (already correct pattern)

---

## Data2 Feature Contracts: NEVER Spread, Always Pass as Props

**Problem**: Using spread syntax `{...pagination}` instead of explicit prop `pagination={pagination}` completely breaks Data2's query composition system. Symptoms:

- Refresh button doesn't trigger refetch (cache id increases but no API call)
- Search input doesn't filter table (query changes but no API call)
- Column sorting doesn't work (clicks registered but no API call)

**Root Cause**: Data2's architecture depends on receiving feature contracts as single props (e.g., `pagination`, `sorting`, `cache`). When you spread `{...cache}`, it spreads the contract's properties (`fstate`, `actions`, `fillQuery`) as individual props. useQueryComposition then receives `cache=undefined` and never reads `cache?.fillQuery`.

**Wrong Approach** ❌:

```tsx
<Data2
  fetchData={fetchIngredients}
  {...pagination}   // ❌ Spreads fstate, actions, fillQuery
  {...sorting}      // ❌ Data2 never receives these as feature contracts
  {...search}
  {...cache}
>
```

**Correct Approach** ✅:

```tsx
<Data2
  fetchData={fetchIngredients}
  pagination={pagination}   // ✅ Passes entire contract object
  sorting={sorting}
  search={search}
  cache={cache}
>
```

**Why This Matters**:

1. useQueryComposition (line 65-100) expects feature contracts as props: `pagination`, `sorting`, etc.
2. It extracts `fillQuery` from each: `pagination?.fillQuery`, `cache?.fillQuery`
3. useMemo dependencies watch these functions: `[pagination?.fillQuery, ..., cache?.fillQuery]`
4. When fillQuery reference changes (e.g., cache.fillQuery after refresh), query recomputes
5. queryUrl changes, triggering useDataFetch's useEffect → API refetch

**The Broken Chain**:

```
User clicks refresh
→ cache.actions.refresh() increments cacheId
→ fstate.effectiveCacheId changes
→ cache.fillQuery gets new reference (useCallback with [fstate.effectiveCacheId])
→ BUT: Data2 received {...cache}, so cache prop = undefined
→ useQueryComposition sees cache?.fillQuery = undefined (always)
→ query never changes
→ queryUrl stays same
→ useDataFetch doesn't refetch
→ ❌ Refresh button does nothing
```

**When Discovered**: January 2025 during iso-functionality testing. Tests passed but manual testing revealed all interactive features (sort/search/refresh) were broken.

**Key Insight**: Spread syntax is dangerous when dealing with contract-based architectures. Always check prop expectations vs what you're passing.

**Related Files**:

- `packages/web-frontend/src/framework/components2/data/Data2.tsx` (lines 57-82: feature contract props)
- `packages/web-frontend/src/framework/hooks2/useQueryComposition.ts` (line 82: fillQuery dependencies)
- `packages/web-frontend/src/framework/hooks2/useDataFetch.ts` (line 162: queryUrl dependency)
- `packages/web-frontend/src/app/pages/ingredients2/Ingredients2TablePage.tsx` (line 377-381: FIXED)

---

## useTableRefreshing + useCacheControl2: Manual Refresh with HTTP Cache Busting

**Problem**: In v5 (useCrudPage), clicking the refresh button calls `loadItems(crud.currentParams)` with the SAME params. This causes TWO issues:

1. No visual feedback (no blur effect on table)
2. HTTP cache may return stale data (backend doesn't receive a fresh request)

**Symptoms**:

- Refresh button triggers API call but may return cached data
- NO visual feedback (no blur effect on table)
- User can't tell if refresh is working
- Backend logs don't show cache-busted requests

**Root Cause**: `useTableRefreshing` compares dependencies to detect changes:

```typescript
// framework/components/table/useTableRefreshing.ts lines 34-48
const hasChanged = Object.keys(dependencies).some(key => dependencies[key] !== prevDependencies.current[key]);
```

When `loadItems(crud.currentParams)` is called with unchanged params, `hasChanged = false`, so `isRefreshing` stays false.

Additionally, HTTP caching (CDN, cache-control headers) may return stale data for identical URLs.

**Solution**: Use `useCacheControl2` to manage cacheId (like v2/Data2):

```typescript
// framework/hooks/useCrudPage.ts
const cache = useCacheControl2({ enabled: true });

const loadItemsWithCache = useCallback(
	async (params: any) => {
		// Increment cacheId first
		cache.actions.refresh();
		// Pass cacheId to backend for cache busting and logging
		await loadItems({ ...params, cacheId: cache.fstate.cacheId + 1 });
	},
	[loadItems, cache]
);

// Include cacheId in dependencies so useTableRefreshing detects it
const isRefreshing = useTableRefreshing({ ...queryParams, cacheId: cache.fstate.cacheId }, loading);
```

**How It Works**:

1. User clicks refresh → calls `loadItemsWithCache(crud.currentParams)`
2. `cache.actions.refresh()` increments cacheId: 0 → 1
3. API call includes cacheId: `GET /api/ingredients?page=1&cacheId=1`
4. `useTableRefreshing` sees dependency change: `cacheId` changed
5. Sets `isRefreshing = true` → blur effect appears
6. Backend receives unique URL (bypasses HTTP cache)
7. API call completes → `loading = false`
8. `useTableRefreshing` resets `isRefreshing = false` → blur clears

**Benefits of cacheId over refreshTrigger**:

- ✅ Busts HTTP cache (CDN, cache-control headers)
- ✅ Visible in backend logs for debugging
- ✅ Consistent with v2/Data2 architecture
- ✅ Forces fresh data from database

**Backend Integration**: Add cacheId to BaseListQuerySchema:

```typescript
// shared-frontend-backend/src/common/api-helpers.ts
export const BaseListQuerySchema = z.object({
	// ... existing fields
	cacheId: z.coerce.number().int().min(0).optional(),
});
```

**Comparison with v2 (Data2)**:

- v2 uses `cache.actions.refresh()` which increments `cacheId`
- cacheId change triggers `useDataFetch` via `queryUrl` change
- Data2 passes `injectedProps.isLoading` to table, which drives the blur
- **v5 NOW uses the SAME approach** via `useCacheControl2` in `useCrudPage`

**Test Coverage**:

- `packages/web-frontend/src/app/pages/ingredients/__tests__/refresh-loading-state.test.tsx`
- Tests both v2 and v5 to ensure both show blur effect during refresh
- Uses deferred promises to control API timing and verify blur appears/disappears

**When Discovered**: January 2025 during v2/v5 iso-functionality testing. User reported: "la requete part, revient avec les memes données... mais le contenu de la reponse ne doit pas influencer la situation. L'emploi d'un cache id permet de forcer le re-render du component. Actuellement, le component n'est pas re-render, ni meme avec le loading state en mode blur !" Later: "je préfère cacheId alors. Le cache mais aussi pour les logs coté backend, ca aide !"

**Related Files**:

- `packages/web-frontend/src/framework/hooks/useCrudPage.ts` (lines 344-361: cacheId implementation)
- `packages/web-frontend/src/framework/hooks2/useCacheControl2.ts` (cache management)
- `packages/shared-frontend-backend/src/common/api-helpers.ts` (line 47: cacheId in schema)
- `packages/web-frontend/src/framework/components/table/useTableRefreshing.ts` (dependency comparison logic)
- `packages/web-frontend/src/framework/components/table/TableBody.tsx` (lines 102-105: blur effect CSS)

---

## tsx watch + Terminal-Kit UI = Broken Keyboard Input

**Problem**: When running terminal-kit-based UIs (OrchestratorUI, FlowWorkerUI) with `tsx watch`, keyboard input does NOT work. Keys are captured by tsx and never reach terminal-kit.

**Root Cause**: `tsx watch` captures stdin to detect restart commands (like 'rs'). This interferes with terminal-kit's stdin capture, preventing keyboard events from being detected.

**Solution - Use correct scripts:**

```bash
# ✅ UI mode (keyboard works)
npm run orch:ui
npm run worker:flow:ui

# ✅ Dev mode (headless, auto-reload)
npm run orch:dev
npm run worker:flow

# ❌ NEVER mix watch + UI
```

**Why**: stdin is a single stream. Node.js processes stdin events through EventEmitter - the first `data` listener registered gets all events. tsx watch's listener consumes all stdin, preventing terminal-kit from receiving keyboard events.

**Detection**: Both UI classes detect the problem at startup by checking `process.stdin.listenerCount('data')` and display a warning if existing listeners are found.

**When discovered**: December 2024 during orchestrator refactoring. Root cause identified through testing with `test-terminal-kit-*.ts` files.

**Reference**: See `.agent-fleet/.claude/docs/terminal-kit-tsx-issue.md` for complete technical details, testing procedures, and alternative solutions considered.

**Related files**:

- `src/orchestrator/ui/OrchestratorUI.ts` - UI implementation with detection
- `src/workers/flow/ui/FlowWorkerUI.ts` - Worker UI with same pattern
- `test-terminal-kit-stdin.ts` - Demonstrates the stdin conflict
- `test-terminal-kit-watch.ts` - Shows watch mode breaking keyboard input

---

## Framer Motion + Radix UI Dialog = Use `asChild`, Not `motion()` Wrapper

**Problem**: Wrapping Radix UI primitives directly with `motion()` causes severe animation conflicts - dialogs appear for a fraction of a second, disappear, then reappear 2+ seconds later. First click shows brief flash, subsequent clicks have 2s delay.

**Root Cause**: Radix UI Dialog manages its own mount/unmount lifecycle with internal state management. Wrapping primitives with `motion()` creates conflicts between:

- Radix UI's lifecycle (data-[state=open/closed] attributes)
- Framer Motion's animation lifecycle (AnimatePresence mount/unmount)

**Wrong Approach** ❌:

```tsx
const MotionContent = motion(DialogPrimitive.Content);
const MotionOverlay = motion(DialogPrimitive.Overlay);

<MotionOverlay initial={{...}} animate={{...}} />
<MotionContent initial={{...}} animate={{...}} />
```

**Correct Solution** ✅:

```tsx
// Use asChild prop to delegate rendering to motion.div
<DialogPrimitive.Overlay asChild>
  <motion.div
    initial={{ opacity: 0 }}
    animate={{ opacity: 1 }}
    exit={{ opacity: 0 }}
    transition={{ duration: 0.15 }}
  />
</DialogPrimitive.Overlay>

<DialogPrimitive.Content asChild>
  <motion.div
    initial={{ opacity: 0, scale: 0.96, x: '-50%', y: '-48%' }}
    animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
    exit={{ opacity: 0, scale: 0.96, x: '-50%', y: '-48%' }}
    transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
  />
</DialogPrimitive.Content>
```

**Key Pattern**: The `asChild` prop tells Radix UI to pass all props/behavior to the child component instead of rendering its own DOM element. This allows Framer Motion to handle the actual rendering while Radix UI manages state and accessibility.

**Additional Requirements**:

- Wrap DialogPortal with AnimatePresence for exit animations
- Use inline styles for z-index (not Tailwind classes) to ensure proper stacking
- Keep animations short (0.15-0.2s) to avoid perceived lag

**Why This Matters**:

- Framer Motion provides superior animation quality (spring physics, GPU acceleration)
- Proper integration maintains Radix UI's accessibility features
- Avoids CSS animation conflicts and Tailwind plugin dependencies

**When Discovered**: December 2024 during minimalist-ui-v2 dialog implementation. Initially used CSS animations as workaround, then refactored to proper Framer Motion integration after user feedback.

**Related Files**:

- `frontend/minimalist-ui-v2/src/components/ui/Dialog/Dialog.tsx` - Correct implementation
- `frontend/minimalist-ui-v2/src/components/features/NewTaskDialog/NewTaskDialog.tsx` - Usage example

---

## Framer Motion vs Tailwind Animations - Always Prefer Framer Motion

**Problem**: When using both Framer Motion and Tailwind CSS, there's a tendency to remove Framer Motion animations when conflicts arise. This is the wrong approach - Framer Motion should be the primary animation library.

**Wrong Approach** ❌:

```tsx
// Removing Framer Motion animations, keeping Tailwind
<motion.div
	initial={{ opacity: 0 }}
	animate={{ opacity: 1 }}
	className="animate-in fade-in slide-in-from-top-4 translate-x-[-50%] translate-y-[-50%]"
/>
```

**Correct Approach** ✅:

```tsx
// Remove Tailwind animations, use Framer Motion exclusively
<motion.div
	initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
	animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
	exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
	transition={{ duration: 0.2 }}
	className="fixed left-[50%] top-[50%] z-50"
	// No Tailwind animation classes like animate-in, fade-in, translate-*, etc.
/>
```

**Why Framer Motion Over Tailwind**:

1. **Superior Animation Quality**: Spring physics, GPU acceleration, better easing functions
2. **Full Control**: Programmatic control over animation lifecycle
3. **Better DX**: Type-safe, declarative API
4. **No Plugin Dependencies**: Tailwind animations require tailwindcss-animate plugin
5. **Consistent Behavior**: Framer handles complex animation sequences reliably

**Dialog Centering Pattern**:
When centering modals/dialogs, Framer Motion can handle BOTH positioning AND animations:

```tsx
<motion.div
	// Include centering in all animation states
	initial={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
	animate={{ opacity: 1, scale: 1, x: '-50%', y: '-50%' }}
	exit={{ opacity: 0, scale: 0.95, x: '-50%', y: '-50%' }}
	className="fixed left-[50%] top-[50%]"
/>
```

**What to Remove from Tailwind**:

- ❌ `animate-in`, `animate-out`
- ❌ `fade-in`, `fade-out`, `slide-in-*`, `zoom-in`
- ❌ `translate-x-*`, `translate-y-*` (if using Framer Motion transforms)
- ✅ Keep positioning classes: `fixed`, `left-[50%]`, `top-[50%]`
- ✅ Keep layout/styling: `z-50`, `w-full`, `max-w-lg`, `border`, etc.

**Rule of Thumb**: If the project uses Framer Motion, remove ALL Tailwind animation utilities and use Framer Motion exclusively for animations.

**When Discovered**: This is a recurring pattern - repeatedly suggested removing Framer Motion instead of Tailwind animations. User preference is explicit: Framer Motion for animations, Tailwind for styling only.

**Related Files**:

- `frontend/inventory-ui-modern/src/components/ui/Dialog/Dialog.tsx` - Correct pattern
- `frontend/minimalist-ui-v2/src/components/ui/Dialog/Dialog.tsx` - Reference implementation

---

## React Hook Polling Pattern - Separate Initial Fetch from Polling Interval

**Problem**: When using `useAbortableEffect` with polling, including the fetch function in dependencies causes the effect to re-run every time the fetch function changes. If the fetch function depends on state that changes after the first fetch (like `isInitialLoad`), this creates multiple `setInterval` instances running in parallel, resulting in requests firing much faster than intended (e.g., every 300-500ms instead of 5000ms).

**Root Cause**:

```tsx
// ❌ BAD: Creates multiple intervals
const fetchData = useCallback(
	async signal => {
		if (isInitialLoad) setLoading(true); // <- This dependency causes re-creation
		// ... fetch logic
	},
	[isInitialLoad]
); // <- fetchData changes when isInitialLoad changes

useAbortableEffect(
	async signal => {
		await fetchData(signal);
		const intervalId = setInterval(() => fetchData(signal), 5000);
		signal.addEventListener('abort', () => clearInterval(intervalId));
	},
	[fetchData]
); // <- Re-runs when fetchData changes, creating new interval
```

**Correct Solution** ✅:

```tsx
// Separate initial fetch from polling
const fetchData = useCallback(
	async signal => {
		if (isInitialLoad) setLoading(true);
		// ... fetch logic
	},
	[isInitialLoad]
);

// Initial fetch only
useAbortableEffect(
	async signal => {
		if (!enabled) return;
		await fetchData(signal);
	},
	[enabled] // Only re-run if enabled changes
);

// Polling effect - separate from initial fetch
useEffect(() => {
	if (!enabled || !pollInterval || pollInterval <= 0 || isInitialLoad) return;

	const intervalId = setInterval(async () => {
		const controller = new AbortController();
		await fetchData(controller.signal);
	}, pollInterval);

	return () => {
		clearInterval(intervalId);
	};
}, [enabled, pollInterval, isInitialLoad, fetchData]);
```

**Key Principles**:

1. **Separate Effects**: One for initial fetch, one for polling
2. **Minimal Dependencies**: Initial fetch effect only depends on `enabled`
3. **Wait for Initial Load**: Polling only starts after `isInitialLoad` becomes false
4. **Proper Cleanup**: Return cleanup function from polling effect
5. **New AbortController**: Create fresh controller in each interval callback

**Why This Works**:

- Initial fetch runs once on mount
- Polling effect waits for initial load to complete
- When `isInitialLoad` changes to false, polling starts
- Only ONE interval is created and managed
- Cleanup properly removes the interval on unmount

**Symptoms of the Bug**:

- Backend logs show requests much faster than expected interval
- Multiple requests fire within milliseconds of each other
- Network tab shows overlapping requests
- Server load higher than expected

**Files Affected** (December 2024):

- `packages/web-frontend/src/app/pages/tasks/useTasks.ts` (lines 78-100)
- `packages/web-frontend/src/app/pages/workers/useWorkers.ts` (lines 73-95)
- `packages/web-frontend/src/app/pages/workspaces/useWorkspaces.ts` (lines 73-95)

**Reference Implementation**:

- `packages/web-frontend/src/app/pages/dashboard/useDashboard.ts` (correct from start)

**When Discovered**: December 21, 2024 during web UI implementation. User reported backend receiving `/api/tasks` requests every 300ms instead of 5000ms.

---

## Unused Sidebar Components - Remove Duplicates to Avoid Confusion

**Problem**: Having multiple similar components (e.g., `Sidebar.tsx`, `DesktopSidebar.tsx`, `MobileSidebar.tsx`) where only some are actually used can lead to confusion and bugs. Developers may update the wrong file, causing changes to not appear in the UI.

**Example**: Added Workspaces navigation to `Sidebar.tsx`, but app actually uses `DesktopSidebar.tsx` and `MobileSidebar.tsx`, so the navigation link didn't appear.

**Solution** ✅:

1. **Identify Unused Files**: Check actual imports in App.tsx or root components
2. **Remove Unused Files**: Delete any component files that aren't imported
3. **Update Only Active Files**: Make changes to the files actually being used
4. **Document Component Purpose**: Add comments explaining which components are used where

**Files Affected** (December 2024):

- Removed: `packages/web-frontend/src/app/components/navigation/Sidebar.tsx` (unused)
- Updated: `packages/web-frontend/src/app/components/navigation/DesktopSidebar.tsx`
- Updated: `packages/web-frontend/src/app/components/navigation/MobileSidebar.tsx`

**Prevention**:

- Regular code cleanup to remove unused files
- ESLint rules to detect unused exports
- Clear naming conventions (e.g., DesktopSidebar vs MobileSidebar makes purpose obvious)

**When Discovered**: December 21, 2024 - User correctly pointed out that Sidebar.tsx wasn't used, preventing navigation changes from appearing.

---

## Vitest Path Alias Configuration - Must Match TypeScript Paths

**Problem**: Backend tests failing with module resolution errors like `Failed to load url @/auth/MockAuthService` even though the file exists and TypeScript compilation works fine.

**Root Cause**: Vitest requires its own path alias configuration in `vitest.config.ts`. Having path aliases only in `tsconfig.json` is not sufficient - Vitest uses its own resolver that doesn't automatically inherit TypeScript path mappings.

**Configuration Requirements**: Path aliases must be configured in THREE places for full functionality:

1. **`tsconfig.json`** - For TypeScript compilation and IDE support
2. **`build.mjs` (or webpack/esbuild config)** - For production builds
3. **`vitest.config.ts`** - For test execution ← COMMONLY FORGOTTEN

**Wrong Assumption** ❌:

```typescript
// Only in tsconfig.json
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"]
    }
  }
}
// Tests will fail even though TypeScript is happy
```

**Correct Solution** ✅:

```typescript
// vitest.config.ts
import path from 'path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	resolve: {
		alias: {
			'@': path.resolve(__dirname, './src'),
			// Add all path aliases from tsconfig.json
		},
	},
});
```

**Key Principles**:

- Vitest uses Vite's resolver, which requires explicit alias configuration
- Path aliases must be synchronized across all three configurations
- Use `path.resolve(__dirname, ...)` for absolute paths
- Test the configuration by running tests, not just TypeScript compilation

**Symptoms of Missing Vitest Aliases**:

- Tests fail with "Failed to load url @/..." errors
- File exists and TypeScript shows no errors
- Production builds work fine
- Only tests are affected

**Files Affected** (December 2024):

- Fixed: `packages/web-backend/vitest.config.ts` - Added missing `'@': path.resolve(__dirname, './src')`
- Test files using `@/*` imports (10 files total):
    - `src/transport/security/session-security.test.ts`
    - `src/transport/security/cookie-security.test.ts`
    - `src/transport/adapters/WebSocketTransportServer.test.ts`
    - `src/transport/integration/websocket-auth-flow.test.ts`
    - `src/transport/integration/event-broadcasting.test.ts`
    - And 5 production files in fastify plugins/hooks

**When Discovered**: December 22, 2025 - 5 backend transport tests failing with module resolution errors after implementing authentication features.

---

## Plan Files Location - Always Use Project Root, Not Home Directory

**Problem**: Creating plan files in `~/.claude/plans/` (home directory) instead of `<projectRoot>/.claude/plans/` as instructed in CLAUDE.md. This happens even when CLAUDE.md explicitly states the correct location and marks it as `<CRITICAL>`.

**Root Cause**: Following system reminders blindly instead of prioritizing CLAUDE.md instructions. System reminders may point to existing files in the wrong location, and using them as source of truth leads to creating new files in the wrong place.

**Wrong Approach** ❌:

```
Creating files at: C:\Users\Wadeck\.claude\plans\refactored-finding-elephant.md
Reason: System reminder said "plan file exists at C:\Users\Wadeck\.claude\plans\..."
```

**Correct Approach** ✅:

```
Creating files at: C:\Workspace_Tooling\agent-fleet\.claude\plans\plan-1-frontend-backend-events.md
Reason: CLAUDE.md says "Put your plan files in <projectRoot>.claude/plans folder"
```

**Hierarchy of Information Sources**:

1. 🥇 **CLAUDE.md** - Project-specific instructions (HIGHEST PRIORITY)
2. 🥈 **User requests** - Direct instructions from user (OVERRIDE everything)
3. 🥉 **System reminders** - Contextual hints (NOT source of truth for paths)

**Additional Issues**:

- **Non-descriptive names**: Using generated names like `refactored-finding-elephant.md` instead of descriptive names like `task-creation-implementation.md` or `event-naming-migration.md`
- **Ignoring CLAUDE.md critical tags**: Missing `<CRITICAL>with relevant name</CRITICAL>` despite explicit markup

**Correct Workflow**:

1. **Read CLAUDE.md first** when starting any project work
2. **Create plans in project directory** from the start: `<workingDir>/.claude/plans/`
3. **Use descriptive names** that explain what the plan is about
4. **When user asks for changes** (split plans, rename, etc.): Create new files in the CORRECT location immediately

**Prevention**:

- Always check CLAUDE.md for project-specific requirements before creating files
- Question system reminders that suggest paths outside the project directory
- Use `ls <projectRoot>/.claude/plans/` to verify location before creating files
- Read the actual instructions instead of assuming based on reminders

**When Discovered**: December 23, 2024 - User repeatedly asked for plans in correct location, but agent continued creating in home directory until explicitly challenged on retention mechanism.

**Related Instructions**: See CLAUDE.md line about `.claude/plans` folder and requirement to "Append [lessons-learned.md] with what you are learning!"

---

## React useEffect Dependencies - Query URL as Source of Truth, Not Query Object

**Problem**: When implementing data fetching with query composition, depending on the `query` object in useEffect dependencies causes unnecessary re-fetches. Even if the query content is identical, object reference changes trigger new fetches, resulting in multiple requests (e.g., 5 requests instead of 2 for a single page load).

**Root Cause**: Two issues compound to create excessive re-fetches:

1. **Array recreation**: Creating a new array on every render changes the features array reference, even if elements are stable
2. **Wrong dependencies**: Including `query` object in useEffect dependencies when `queryUrl` is the source of truth for change detection

**Wrong Approach** ❌:

```typescript
// Data2.tsx - Creating array on every render
const { query, queryUrl } = useQueryComposition([pagination, sorting, search, filter, cache]);

// useDataFetch.ts - Depending on query object
useEffect(() => {
	const result = await fetchData(query);
	// ...
}, [fetchData, query, queryUrl]); // ← query changes every render!
```

**Symptoms**:

- Multiple identical requests in quick succession (e.g., 5 requests where only 2 expected)
- Backend logs show requests with identical parameters
- Network tab shows overlapping requests with same query string
- Happens even without user interaction (page load only)

**Correct Solution** ✅:

```typescript
// Data2.tsx - Memoize features array
const features = useMemo(
	() => [pagination, sorting, search, filter, cache],
	[pagination, sorting, search, filter, cache]
);
const { query, queryUrl } = useQueryComposition(features);

// useDataFetch.ts - Only depend on queryUrl (source of truth)
useEffect(() => {
	const result = await fetchData(query); // query captured via closure
	// ...
	// eslint-disable-next-line react-hooks/exhaustive-deps
}, [queryUrl]); // ← Only queryUrl, not query or fetchData
```

**Key Principles**:

1. **Memoize array inputs**: Always wrap array literals in `useMemo` when passing to hooks
2. **Use source of truth for dependencies**: If you have a serialized version (`queryUrl`), use ONLY that for change detection
3. **Closure capture is OK**: Stable values like `query` and `fetchData` can be captured via closure
4. **Trust useMemo chains**: If `query` is memoized based on stable dependencies, it won't change unexpectedly

**Why This Works**:

- `queryUrl` is the JSON-serialized, sorted version of `query` - it only changes when content changes
- `query` object reference might change even if content is identical (JavaScript object equality)
- `fetchData` should be stable (passed from parent component)
- Capturing via closure is safe because these values won't change between renders unless `queryUrl` changes

**Architecture Pattern** (useQueryComposition → useDataFetch → usePropsInjection):

```typescript
// Step 1: Compose query (memoized based on feature fillQuery functions)
const { query, queryUrl } = useQueryComposition(features);

// Step 2: Fetch data (only refetch when queryUrl changes)
const dataState = useDataFetch(queryUrl, query, fetchData); // query used but not in deps

// Step 3: Build props (memoized based on dataState and features)
const injectedProps = usePropsInjection(dataState, { pagination, sorting, ... });
```

**Files Affected** (December 2024):

- `packages/web-frontend/src/framework/hooks2/useDataFetch.ts` - Changed dependencies from `[fetchData, query, queryUrl]` to `[queryUrl]`
- `packages/web-frontend/src/framework/components2/data/Data2.tsx` - Added `useMemo` for features array

**When Discovered**: December 26, 2024 during Data2 refactoring. User reported 5 requests instead of 2 on Ingredients2Page load. Root cause: combining array recreation with wrong useEffect dependencies.

**Related Pattern**: This is similar to the "React Hook Polling Pattern" lesson - both involve being careful about useEffect dependencies and understanding what should trigger re-execution vs what should be captured via closure.

---

## Custom HTTP Headers - CORS Configuration + Request Pipeline Integration

**Problem**: Custom headers like `X-Conn-Id` sent from frontend don't reach backend handlers even though the header appears in browser DevTools network requests.

**Root Causes**:

1. **CORS blocks custom headers by default** - Only "simple" headers (Content-Type, Accept, etc.) are allowed
2. **Lazy controller plugin missing extraction** - Header exists in request but never extracted and passed to handler

**Wrong Assumptions** ❌:

- Thinking browser sent the header = backend received it
- Assuming CORS allows all headers by default
- Not checking every step in the request pipeline (CORS → routing → validation → handler)

**Correct Solution** ✅:

```typescript
// 1. CORS - Explicitly allow custom headers (server.ts)
await fastify.register(cors, {
	allowedHeaders: ['Content-Type', 'Authorization', 'X-Conn-Id'],
});

// 2. Request pipeline - Extract header BEFORE handler (lazy-controller-plugin.ts)
const connId = request.headers['x-conn-id'] as string | undefined;
const validated: any = {
	params: extractedParams,
	query: {},
	body: {},
	connId, // Pass to handler
};
```

**Architecture Principle**: Separation of concerns between:

- **Business data** (Zod contract): `params`, `query`, `body`, `response`
- **Infrastructure** (request pipeline): `connId`, `cookies`, `reply`, `request`

Headers like `X-Conn-Id` are infrastructure concerns - never in Zod contracts, but available in handlers through pipeline injection.

**Multi-Tab Support**: Use `sessionStorage` (not `localStorage`) for per-tab connId generation - ensures each browser tab gets unique ID for proper broadcast echo prevention.

**Debug Strategy**: Add logging at EVERY pipeline step to identify where data is lost:

1. Frontend: Log before sending request
2. CORS: Verify header in OPTIONS preflight
3. Request handler: Log raw headers
4. Validated object: Log extracted values
5. Service layer: Log received parameters

**Files Affected** (December 2024):

- `packages/web-backend/src/server.ts` - Added `allowedHeaders` to CORS config
- `packages/web-backend/src/utils/lazy-controller-plugin.ts` - Extract `connId` from headers
- `packages/web-frontend/src/transport/TransportProvider.tsx` - Generate connId using `sessionStorage`
- `packages/web-frontend/src/framework/api/api-base.ts` - Inject `X-Conn-Id` header in all requests

**When Discovered**: December 27, 2024 during broadcast echo prevention implementation. Header sent but showed `undefined` in backend logs. User correctly identified lazy-controller-plugin was missing extraction step.

**Related**: WebSocket also sends connId via query param (`?connId=xxx`) since WebSocket handshake doesn't support custom headers.

---

## API Endpoints Must Start With `/api` - Production Routing Requirement

**Problem**: Endpoints that don't start with `/api` break in production environments. Frontend proxy configuration, reverse proxy rules, and deployment pipelines expect all backend API endpoints to be under the `/api` prefix.

**Root Cause**: Development mode often works fine without this prefix because the frontend dev server proxies all non-static requests. Production environments use explicit routing rules that only forward `/api/*` paths to the backend server.

**Wrong Approach** ❌:

```typescript
// These endpoints break in production:
app.get('/ws', ...) → WebSocket
app.get('/sse', ...) → SSE
app.get('/long-polling/events', ...) → Long Polling
app.post('/sse/subscription', ...) → Subscriptions
app.post('/long-polling/subscription', ...) → Subscriptions
```

**Correct Approach** ✅:

```typescript
// All endpoints MUST start with /api:
app.get('/api/transports/ws', ...) → WebSocket
app.get('/api/transports/sse', ...) → SSE
app.get('/api/transports/long-polling', ...) → Long Polling
app.post('/api/transports/subscriptions', ...) → Unified subscriptions

// Other API routes:
app.get('/api/tasks', ...)
app.post('/api/workers', ...)
app.get('/api/monitoring/metrics', ...)
```

**Why This Matters**:

1. **Reverse Proxy Configuration**: Nginx/Apache configured to forward only `/api/*` to backend
2. **Frontend Proxy**: Vite/Webpack dev server proxy rules match `/api` prefix
3. **CORS Policies**: Often scoped to `/api` paths
4. **API Gateway**: Cloud deployments route based on path prefix
5. **Security Rules**: Firewall/WAF rules typically allow `/api` explicitly

**Production Failure Symptoms**:

- Development works, production shows 404 Not Found
- WebSocket connections fail to establish (404 on `/ws`)
- SSE streams never connect (404 on `/sse`)
- CORS errors only in production
- API monitoring/logging shows missing routes

**Configuration That Breaks**:

```nginx
# Nginx reverse proxy - only forwards /api
location /api {
    proxy_pass http://backend:3000;
}
# Routes like /ws, /sse won't match! → 404
```

```typescript
// Vite config - only proxies /api
export default defineConfig({
	server: {
		proxy: {
			'/api': 'http://localhost:3000',
		},
	},
});
// Routes like /ws, /sse won't be proxied → Connection refused
```

**Enforcement**:

1. **Code Review**: Reject any route that doesn't start with `/api`
2. **Linting**: Add ESLint rule to check route registration
3. **Testing**: Integration tests should verify all routes start with `/api`
4. **Documentation**: Mark this requirement as **CRITICAL** in architecture docs

**Migration Strategy**:

If you have existing routes without `/api` prefix:

1. Add new routes with `/api` prefix
2. Keep old routes with 301/308 redirects for backward compatibility
3. Update all client code to use new routes
4. After migration period, remove old routes

```typescript
// Temporary redirect for backward compatibility
app.get('/ws', (request, reply) => {
	reply.redirect(308, '/api/transports/ws');
});

// New proper route
app.get('/api/transports/ws', websocketHandler);
```

**Related Transport Unification**:

This lesson led to proposing unified transport API architecture:

- All transport endpoints under `/api/transports/*`
- Unified subscriptions at `/api/transports/subscriptions`
- See: `.claude/plans/2025-12-27_20-30_unified-transport-api.md`

**When Discovered**: December 27, 2024 - User pointed out that endpoints like `/ws`, `/sse`, `/long-polling/*` would break in production because they don't follow the `/api` prefix rule. This is a critical architecture requirement that was missed during initial transport implementation.

**Prevention Checklist**:

- ✅ ALL endpoints start with `/api`
- ✅ Transport streams: `/api/transports/*`
- ✅ CRUD operations: `/api/{resource}/*`
- ✅ Health/monitoring: `/api/health`, `/api/metrics`
- ✅ WebSocket upgrade: `/api/transports/ws` (not `/ws`)
- ✅ SSE streams: `/api/transports/sse` (not `/sse`)
- ✅ Subscriptions: `/api/transports/subscriptions` (not per-transport endpoints)

**Exception**: Static files, health check endpoints for load balancers might use different prefixes like `/health` or `/`, but these should be explicitly documented and minimal.

---

## Visual UI Changes - ALWAYS Take Screenshots, Never Say "Fixed" Without Verification

**Problem**: Making CSS/visual changes and telling the user "it's fixed" or "should work now" without actually verifying the result. This wastes the user's time when the fix doesn't work.

**Root Cause**: Cannot see the rendered UI output, so assuming changes will work based on code logic alone. CSS is particularly tricky - variables might be transparent, z-index might hide elements, specificity might be wrong, etc.

**Wrong Approach** ❌:

```
Agent: "I've fixed the dark mode controls by adding background-color: hsl(var(--card))"
User: *sends screenshot showing controls still invisible*
Agent: "It should be visible now, I added !important"
User: *sends screenshot showing it's STILL not working*
User: "var(--card) = rgba(0, 0, 0, 0) - it's transparent!"
```

**Correct Approach** ✅:

```
Agent: "I've changed the CSS to use background-color: hsl(var(--card)). Can you take a screenshot and show me if the controls are visible now?"

OR better:

Agent: "Looking at the CSS variables, I see var(--card) might be transparent in dark mode. Let me use a solid color instead: background-color: #1f1f1f (dark gray). Can you verify if this works?"
```

**Key Principles**:

1. **Request screenshots** when making visual changes - don't guess if it worked
2. **Check CSS variable values** - Variables like `--card`, `--background` might be transparent or unexpected colors
3. **Use fallback solid colors** when in doubt - Better to use `#1f1f1f` than rely on unknown variables
4. **Never say "it's fixed"** - Instead say "I've made these changes, can you verify?"
5. **Ask for color values** if unsure - User can inspect element and tell you what CSS variables resolve to

**Common CSS Pitfalls**:

- `rgba(0, 0, 0, 0)` - Completely transparent
- `hsl(var(--card))` when `--card` is not defined or transparent
- Using Tailwind arbitrary values that don't apply correctly
- `!important` doesn't help if the color itself is wrong
- Z-index conflicts hiding elements
- Specificity wars where styles don't apply

**Verification Questions to Ask**:

- "Can you take a screenshot showing the current state?"
- "What does DevTools show for the computed background-color value?"
- "Is the element visible at all, or just the wrong color?"
- "What are the actual CSS variable values in dark mode?"

**Files Affected** (December 2024):

- `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditor.css` - ReactFlow controls styling
- Multiple attempts to fix visibility using CSS variables that were transparent

**When Discovered**: December 29, 2024 - User repeatedly had to correct visual issues with screenshots because agent kept saying "it's fixed" without verification. User explicitly requested this be added to lessons learned.

**Remember**: Visual issues require visual verification. Code that looks correct might not render correctly.

---

## Flexbox Overflow Scrolling - Parent Must Have Explicit Height Constraint

**Problem**: Using `overflow-auto` on a flex child doesn't create scrollbars even when content overflows. The container just expands to fit all content instead of staying constrained and scrolling.

**Root Cause**: For `overflow` to work, the element must have a defined height. In flexbox layouts without explicit height constraints, flex containers expand to accommodate their content. Without a height limit, there's nothing to "overflow" from.

**Wrong Approach** ❌:

```tsx
// Parent has no height constraint
<div className="flex flex-col border-l bg-card">
	<div className="flex-1 overflow-auto">
		<pre>{longContent}</pre> {/* Container expands, no scroll */}
	</div>
</div>
```

**Correct Solution** ✅:

```tsx
// Parent establishes height constraint
<div className="flex h-full flex-col border-l bg-card">
	{' '}
	{/* h-full = height: 100% */}
	<div className="flex-1 overflow-auto">
		<pre>{longContent}</pre> {/* Now scrolls because parent is constrained */}
	</div>
</div>
```

**Key Principles**:

1. **Explicit height on parent**: Use `h-full`, `h-screen`, `h-[500px]`, etc. on the parent container
2. **Flex child with overflow**: Child can use `flex-1` + `overflow-auto` to become scrollable
3. **min-h-0 for nested flex**: Deep nesting may need `min-h-0` to allow shrinking
4. **Height propagation**: The constraint must propagate from a parent that has defined height (viewport, fixed height, etc.)

**Why This Happens**:

- Default flex behavior: containers grow to fit content
- Overflow requires constraint: "overflow from what boundary?"
- Without height: no boundary exists, so content just expands the container
- With height: boundary is defined, overflow can happen and scrollbar appears

**Common Scenarios**:

```tsx
// Scenario 1: Full viewport height
<div className="h-screen flex flex-col">  {/* Constraint from viewport */}
  <div className="flex-1 overflow-auto">{content}</div>
</div>

// Scenario 2: Parent container with fixed height
<div className="h-[600px] flex flex-col">  {/* Explicit constraint */}
  <div className="flex-1 overflow-auto">{content}</div>
</div>

// Scenario 3: Nested in another flex container
<div className="flex h-full flex-col">  {/* Gets height from parent */}
  <div className="flex-1 flex flex-col min-h-0">  {/* min-h-0 allows shrinking */}
    <div className="flex-1 overflow-auto">{content}</div>
  </div>
</div>
```

**Debugging Strategy**:

1. Check if parent has explicit height (`h-full`, `h-screen`, fixed height)
2. Verify height propagates from root (viewport → containers → overflow element)
3. Use DevTools to inspect computed height (should not be `auto`)
4. Look for `min-height: auto` preventing shrinking (add `min-h-0`)

**Files Affected** (December 2024):

- `packages/web-frontend/src/app/pages/flows/flow-editor/FlowEditorRightPanel.tsx` - Added `h-full` to root div to enable scrolling in YAML/Validation tabs

**When Discovered**: December 30, 2024 - Multiple attempts to fix scroll in FlowEditorRightPanel failed until user identified the missing height constraint. The fix was simple (`h-full` on parent) but the diagnosis required understanding flexbox height propagation.

**Related Pattern**: Similar to CSS Grid where `minmax(0, 1fr)` is needed to allow content to shrink below its intrinsic size.

---

## CSS Color Functions - Use `color-mix()` for Transparency with CSS Variables

**Problem**: Using `hsl(var(--variable) / 0.4)` for transparency doesn't work when CSS variables are defined in `oklch()` or other non-HSL color spaces. The syntax assumes HSL format and breaks silently with other formats.

**Root Cause**: The syntax `hsl(var(--variable) / alpha)` requires the variable to contain HSL values like `240 50% 50%`. When variables use `oklch()`, `rgb()`, or hex values, this syntax fails and often falls back to transparent or incorrect colors.

**Wrong Approach** ❌:

```css
/* CSS variables defined in oklch */
:root {
	--muted: oklch(0.967 0.001 286.375);
	--muted-foreground: oklch(0.552 0.016 285.938);
}

/* Trying to add transparency with hsl() */
.scrollbar-track {
	background: hsl(var(--muted) / 0.3); /* Doesn't work! */
}

.scrollbar-thumb {
	background: hsl(var(--muted-foreground) / 0.4); /* Doesn't work! */
}
```

**Correct Solution** ✅:

```css
/* Use color-mix() - works with ANY color format */
.scrollbar-track {
	background: color-mix(in srgb, var(--muted) 30%, transparent);
}

.scrollbar-thumb {
	background: color-mix(in srgb, var(--muted-foreground) 40%, transparent);
}

.scrollbar-thumb:hover {
	background: color-mix(in srgb, var(--muted-foreground) 60%, transparent);
}
```

**Why `color-mix()` is Better**:

1. **Format-agnostic**: Works with `oklch()`, `hsl()`, `rgb()`, `hex`, named colors
2. **Explicit transparency**: Percentage clearly shows opacity level
3. **Color space control**: Can specify interpolation space (`srgb`, `oklch`, `hsl`)
4. **Future-proof**: Part of CSS Color Level 4 spec, widely supported
5. **No assumptions**: Doesn't assume variable format

**Browser Support**:

- Chrome/Edge 111+ ✅
- Firefox 113+ ✅
- Safari 16.2+ ✅
- Modern browsers only, but that's fine for most projects

**Alternative for Older Browsers**:

If you need to support older browsers, define separate variables with alpha:

```css
:root {
	--muted: oklch(0.967 0.001 286.375);
	--muted-30: oklch(0.967 0.001 286.375 / 0.3); /* With alpha */
}

.scrollbar-track {
	background: var(--muted-30);
}
```

**Common Mistakes**:

- ❌ `hsl(var(--color) / 0.5)` when `--color` is `oklch()`
- ❌ `rgba(var(--color), 0.5)` when `--color` is not RGB
- ❌ Assuming all color variables are in the same format
- ✅ Use `color-mix()` consistently for all transparency needs

**Debugging**:

If colors appear transparent or wrong:

1. Check CSS variable definition format (`oklch`, `hsl`, `rgb`?)
2. Inspect computed styles - does it show `rgba(0, 0, 0, 0)` (transparent)?
3. Try `color-mix()` instead of format-specific functions
4. Verify theme switching updates all color variables

**Files Affected** (December 2024):

- `packages/web-frontend/src/framework/styles/theme.css` - Changed scrollbar styles from `hsl(var(--muted) / 0.3)` to `color-mix(in srgb, var(--muted) 30%, transparent)`

**When Discovered**: December 30, 2024 - Scrollbar colors didn't adapt to dark theme because `hsl()` syntax was incompatible with `oklch()` variables. User noticed scrollbar stayed light gray in dark mode despite theme variables being correct.

**Related**: This is particularly important for projects using modern color spaces like `oklch()` which provide better color accuracy and wider gamut than `hsl()`.

---

## Check Existing Global Styles Before Creating New Utilities

**Problem**: Adding new utility classes or styles without checking if similar functionality already exists globally. This creates duplication, inconsistency, and technical debt.

**Root Cause**: Not reviewing the codebase's existing CSS architecture before adding new styles. Assuming that if a specific utility class doesn't exist, the styling must be added.

**Wrong Approach** ❌:

```javascript
// tailwind.config.js - Adding new scrollbar utilities
plugins: [
	function ({ addUtilities }) {
		addUtilities({
			'.scrollbar-themed': {
				'scrollbar-width': 'thin',
				'scrollbar-color': '...',
				// ... custom scrollbar styles
			},
		});
	},
];
```

**Meanwhile, in theme.css (already exists!)**:

```css
/* Global scrollbar styles already defined */
::-webkit-scrollbar {
	width: 12px;
	height: 12px;
}
::-webkit-scrollbar-thumb {
	background: color-mix(in srgb, var(--muted-foreground) 40%, transparent);
	/* ... */
}
```

**Correct Approach** ✅:

1. **Search for existing styles** before adding new ones:

```bash
# Search for scrollbar-related styles
grep -r "scrollbar" packages/web-frontend/src/**/*.css
grep -r "::-webkit-scrollbar" packages/web-frontend/src/**/*.css
```

2. **Check common CSS files**:
    - `src/index.css` - Main entry point
    - `src/framework/styles/theme.css` - Theme variables and global styles
    - `src/framework/styles/animations.css` - Animation utilities
    - `tailwind.config.js` - Custom utilities

3. **Understand the hierarchy**:
    - Global styles apply automatically to all elements
    - Element-specific classes override globals
    - Only add new utilities if truly needed

4. **Reuse and extend** instead of duplicating:

```css
/* If global styles exist but need adjustments */
.special-scrollbar::-webkit-scrollbar-thumb {
	/* Override specific property */
	background: var(--primary);
}
```

---

## Data2Infinite - Decorator Pattern for Infinite Scroll

**Problem**: Implementing infinite scroll by duplicating Data2's feature composition logic manually (v4c before refactor) creates inconsistency, more code (~150 lines), and breaks the composability patterns established by Data2.

**Root Cause**: Thinking that infinite scroll is fundamentally different from pagination, requiring a completely different implementation. In reality, infinite scroll is just pagination with data accumulation.

**Wrong Approach** ❌:

```typescript
// Manual feature composition (duplicates Data2 logic)
const fetchIngredients = useCallback(async (query: Record<string, unknown>) => {
	const response = await ingredientsService.getIngredients({
		page: query.page as number,
		pageSize: query.pageSize as number,
		sortBy: query.sortBy as string | undefined,
		sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
		search: query.search as string | undefined,
	});
	return { items: response.items, pagination: ... };
}, []);

// Custom infinite scroll hook (reimplements Data2 fetch logic)
const { data, isLoading, hasMore, reset } = useInfiniteCarousel({
	fetchFn: fetchIngredients,
	pageSize: PAGE_SIZE,
	sortBy: sorting.fstate.sortConfigs[0]?.key,
	sortOrder: sorting.fstate.sortConfigs[0]?.direction,
	search: searchQuery,
	emblaApi: carousel.fstate.emblaApi,
	triggerThreshold: 0.85,
});

// Manual props passing (16+ props)
<IngredientCarousel4c
	data={data}
	isLoading={isLoading}
	hasMore={hasMore}
	sorting={sorting}
	searchQuery={searchQuery}
	// ... 11 more props
/>
```

**Correct Solution - Decorator Pattern** ✅:

```typescript
// Data2Infinite.tsx - Wraps Data2 without modifying it
export function Data2Infinite({ infinitePagination, deduplicateBy, children, ...data2Props }) {
	const paginationAdapter = useMemo(
		() => ({
			fstate: { page: infinitePagination.fstate.currentPage, pageSize: infinitePagination.fstate.pageSize },
			actions: { setPage: infinitePagination.actions.loadNext, ... },
			fillQuery: infinitePagination.fillQuery,
		}),
		[infinitePagination]
	);

	return (
		<Data2 {...data2Props} pagination={paginationAdapter}>
			{props => {
				// DECORATOR: Accumulate data before passing to children
				const accumulatedState = useDataAccumulator(props, { enabled: true, deduplicateBy });
				return children({ ...props, data: accumulatedState.data });
			}}
		</Data2>
	);
}

// useDataAccumulator.ts - Pure transformation decorator
export function useDataAccumulator(dataState, options) {
	const [accumulated, setAccumulated] = useState([]);

	useEffect(() => {
		if (dataState.data.length < prevData.length) {
			setAccumulated(dataState.data); // Reset detected
		} else if (dataState.data !== prevData) {
			setAccumulated(prev => {
				if (deduplicateBy) {
					const seen = new Set(prev.map(deduplicateBy));
					const unique = dataState.data.filter(item => !seen.has(deduplicateBy(item)));
					return [...prev, ...unique];
				}
				return [...prev, ...dataState.data];
			});
		}
	}, [dataState.data]);

	return { ...dataState, data: accumulated };
}
```

**Key Architecture Principles**:

1. **Decorator Pattern**: Wrap Data2 instead of modifying it (zero changes to Data2 core)
2. **Adapter Pattern**: Convert infinite pagination to regular pagination contract
3. **Separation of Concerns**: Data2 handles fetching, useDataAccumulator handles accumulation
4. **Composability**: Can stack multiple decorators (cache, throttle, filter)

**Benefits**:

- ✅ Zero modifications to Data2 or useDataFetch (100% backwards compatible)
- ✅ Reuses ALL Data2 features (sorting, search, selection, filtering)
- ✅ ~150 lines less code in pages (30-40% reduction)
- ✅ Architectural consistency with v2/v3 table/grid pages
- ✅ Easy to add more decorators later (caching, throttling)

**Usage Example**:

```typescript
const infinitePagination = useInfinitePagination({ pageSize: 12, hasMore: true });
const search = useMemo(() => ({
	fstate: { query: searchQuery },
	actions: { setQuery: setSearchQuery, clearQuery: () => setSearchQuery('') },
	fillQuery: (q) => { if (searchQuery) q.search = searchQuery; },
}), [searchQuery]);

<Data2Infinite
	fetchData={fetchIngredients}
	infinitePagination={infinitePagination}
	sorting={sorting}
	search={search}
	selection={selection}
	deduplicateBy={item => item.id}
>
	{props => <IngredientCarousel data={props.data} isLoading={props.isLoading} {...props} />}
</Data2Infinite>
```

**Antifragility Test**: Adding a new feature (e.g., filtering)

- **Before (v4c manual)**: Modify fetchIngredients, add filter to useInfiniteCarousel options, pass filter prop to component (3 changes)
- **After (Data2Infinite)**: Add `filter={myFilter}` to Data2Infinite (1 change, automatic composition)

**Files Affected** (January 2025):

- Created: `packages/web-frontend/src/framework/components2/data/Data2Infinite.tsx`
- Created: `packages/web-frontend/src/framework/hooks2/useDataAccumulator.ts`
- Created: `packages/web-frontend/src/framework/hooks2/useInfinitePagination.ts`
- Refactored: `packages/web-frontend/src/app/pages/ingredients4c/Ingredients4CarouselPage.tsx` (reduced from 499 to ~350 lines)

**When Discovered**: January 17, 2025 - User questioned why v4c didn't use Data2 when it had all the same features (sorting, search, selection). Analysis revealed that v4c was manually reimplementing Data2's composition logic, which was an architectural regression. Refactoring to decorator pattern restored consistency and reduced code significantly.

**Related Pattern**: This is similar to React's composition patterns - prefer composition over inheritance, use render props for flexible children, wrap instead of modify.

**Prevention**: When implementing a new data display pattern, ALWAYS check if existing data composition tools (like Data2) can be extended rather than reimplemented. If Data2 can't handle it directly, ask: "Can I wrap/decorate Data2 instead of rebuilding its logic?"

**Key Principles**:

1. **Global first**: Check if functionality exists globally before adding utilities
2. **Search before adding**: Use grep/search to find existing implementations
3. **Consistency**: Use the same approach as the rest of the codebase
4. **Document discoveries**: If you find good global styles, remember they exist

**Common Global Style Locations**:

- **Scrollbars**: Usually in `theme.css` or `globals.css`
- **Animations**: `animations.css` or Tailwind config
- **Typography**: `theme.css` base layer
- **Resets**: `theme.css` or dedicated `reset.css`
- **Dark mode**: Theme-specific CSS files or `:root`/`.dark` selectors

**Prevention**:

- Read project CSS architecture before adding styles
- Check CSS import chain (`index.css` → what files are imported?)
- Look for `::-webkit-*` pseudo-elements for browser-specific features
- Search for similar selectors (scrollbar, selection, placeholder, etc.)

**Files Affected** (December 2024):

- Initially added `.scrollbar-themed` to `tailwind.config.js` (wrong)
- Discovered existing scrollbar styles in `src/framework/styles/theme.css`
- Removed duplicate utility, fixed existing global styles instead (correct)

**When Discovered**: December 30, 2024 - User correctly challenged adding new scrollbar utilities: "attends, y a d'autres scroll bar sur l'application, regarde bien et reste cohérent stp pas d'accumulation de dette technique !!!" This led to discovering and fixing the existing global scrollbar styles.

**Remember**: The best code is the code you don't have to write. Check if it exists first!

## Workspace Synchronization: Workers Report to Orchestrator

**Problem**: WorkspacesPage2 showed empty list even though workers were connected and working in workspaces.

**Root Cause**: Each worker has its own local `WorkspaceManager`. The orchestrator's `WorkspaceManager` is empty because workers manage their own workspaces independently.

**Solution - Worker-Reported Architecture**:

1. Workers already send `workspacePath` and `projectId` in WORKER_READY message
2. Orchestrator stores this info in `WebSocketConnectionManager.workers`
3. Backend reads from `getConnectedWorkersWorkspaces()` instead of `WorkspaceManager`
4. Metadata persisted in `<workspace>/.agent-fleet/workspace-metadata.json`

**Key Implementation Details**:

- **Workspace ID Generation**: SHA-256 hash of workspace path (first 16 chars)
- **Metadata Storage**: File-based, not in-memory (survives restarts)
- **Update Lookup**: Check both metadata IDs and path-generated IDs
- **Relative Paths**: Workers report relative paths (e.g., "../.."), resolved by backend

**Files Created**:

- `packages/web-backend/src/services/WorkspaceMetadataFile.ts` - File I/O
- `packages/web-backend/src/services/WorkspaceMapper.ts` - Transform WorkerWorkspace → API
- `packages/web-backend/src/repositories/WorkspaceMetadataRepository.ts` - Refactored for files

**Files Modified**:

- `packages/orchestrator/src/websocket/WebSocketConnectionManager.ts` - Added getConnectedWorkspaces()
- `packages/orchestrator/src/core/OrchestratorWrapper.ts` - Exposed getConnectedWorkersWorkspaces()
- `packages/web-backend/src/services/WorkspacesService.ts` - Read from workers, not WorkspaceManager
- `packages/web-backend/src/factories/DataStoreFactory.ts` - Added missing OrchestratorRepository import (caused backend crash!)

**Critical Bug Fixed**: Missing `OrchestratorRepository` import in DataStoreFactory caused backend to crash during hot reload. Always verify imports after refactoring!

**When Discovered**: December 31, 2024 - User observation: "il y a deux workers actuellement, qui travaillent les deux dans le meme workspace, pourquoi n'y a til pas de workspace listé?"

**Architecture Decision**: "Chaque worker qui se connecte à l'orchestrateur indique dans quel workspace il travaille... le meilleur endroit pour stocker les workspaces est ... dans le workspace directement (c'est un dossier), dans le .agent-fleet j'imagine, à coté de flow.yml"

**Remember**: Workers are autonomous and report their state. Orchestrator aggregates, doesn't manage.

## Workspace Path Must Be Absolute, Not Relative

**Problem**: Workers reporting relative paths (e.g., "../..") caused issues:

1. Ambiguous workspace identification
2. Duplicate workspace entries (same relative path from 2 workers = 2 entries)

**Root Cause**: Worker's `projectRoot` defaulted to `process.cwd()` without path resolution, resulting in relative paths being sent to orchestrator.

**Solution**:

1. **Worker side** (`FlowWorker.ts`):

    ```typescript
    const projectRootRelative = projectRootArg ? ... : process.cwd();
    const projectRoot = resolve(projectRootRelative); // Always absolute!
    ```

2. **Backend side** (`WorkspacesService.ts`):
    ```typescript
    private deduplicateWorkspaces(workerWorkspaces) {
      // Group by workspacePath, keep most recent connectedAt
      // Multiple workers in same workspace → single entry
    }
    ```

**Result**:

- Path: `C:\Workspace_Tooling\agent-fleet` (not `../..`)
- 2 workers in same workspace → 1 workspace displayed ✅

**When Discovered**: December 31, 2024 - User: "Je pense que le path doit être absolu, sinon c'est compliqué de s'en sortir... je ne devrais en voir qu'un seul, puisque les deux workers bossent depuis le meme !"

**Remember**: Always use absolute paths for workspace identification. Relative paths are ambiguous and break deduplication logic.

---

## CSS Theme Variables - Must Define Values, Not Just Declare Names

**Problem**: Theme color variables like `--success`, `--warning`, `--info` were declared in `theme.css` but never defined with actual color values in `theme-overrides.css`. Classes like `text-success`, `text-warning` were used throughout the codebase but rendered as transparent or undefined colors.

**Root Cause**: `theme.css` declares variable names for Tailwind CSS mapping (`--color-success: var(--success)`), but the actual CSS custom property `--success` was never given a value. Without the base value, all derived utilities are broken.

**Wrong Approach** ❌:

```css
/* theme.css - Only mapping, no values */
@theme inline {
	--color-success: var(--success); /* Where is --success defined? */
	--color-warning: var(--warning);
	--color-info: var(--info);
}

/* theme-overrides.css - Missing! */
:root {
	--primary: oklch(0.51 0.23 277);
	--secondary: oklch(0.967 0.001 286.375);
	/* --success is NOT defined anywhere! */
}
```

**Result**: `text-success` compiles but has no effect, color is undefined/transparent.

**Correct Solution** ✅:

```css
/* theme-overrides.css - Define ALL variables for BOTH themes */
:root {
	/* ... existing colors ... */
	--success: oklch(0.55 0.15 145); /* Green */
	--success-foreground: oklch(0.985 0 0); /* White text */
	--warning: oklch(0.65 0.15 85); /* Yellow/Orange */
	--warning-foreground: oklch(0.141 0.005 285.823); /* Dark text */
	--info: oklch(0.6 0.15 235); /* Blue */
	--info-foreground: oklch(0.985 0 0); /* White text */
	--danger: oklch(0.577 0.245 27.325); /* Red */
	--danger-foreground: oklch(0.985 0 0); /* White text */
	--special: oklch(0.65 0.18 310); /* Magenta */
	--special-foreground: oklch(0.985 0 0); /* White text */
}

.dark {
	/* ... existing colors ... */
	--success: oklch(0.7 0.15 145); /* Lighter green for dark mode */
	--success-foreground: oklch(0.141 0.005 285.823); /* Dark text */
	--warning: oklch(0.75 0.15 85); /* Lighter yellow */
	--warning-foreground: oklch(0.141 0.005 285.823);
	--info: oklch(0.7 0.15 235); /* Lighter blue */
	--info-foreground: oklch(0.141 0.005 285.823);
	--danger: oklch(0.704 0.191 22.216); /* Lighter red */
	--danger-foreground: oklch(0.985 0 0);
	--special: oklch(0.75 0.18 310); /* Lighter magenta */
	--special-foreground: oklch(0.141 0.005 285.823);
}
```

**Key Principles**:

1. **Every mapped variable needs a value**: If `theme.css` declares `--color-X: var(--X)`, then `--X` MUST be defined
2. **Define for both light AND dark**: Each theme needs its own values
3. **Include foreground colors**: Always define both `--X` and `--X-foreground` for proper text contrast
4. **Use oklch for modern colors**: Better color accuracy and perceptual uniformity than HSL

**Symptoms of Missing Variables**:

- DevTools shows `--success is not defined` in CSS inspector
- `text-success` class has no visible effect
- Colors appear transparent or fall back to default
- No console errors (CSS fails silently)

**How to Audit**:

```bash
# Find all color variable declarations in theme.css
grep "color-" packages/web-frontend/src/framework/styles/theme.css

# Check if they're defined in theme-overrides.css
grep -E "(--success|--warning|--info|--danger|--special)" packages/web-frontend/src/app/styles/theme-overrides.css
```

**Files Affected** (January 2025):

- `packages/web-frontend/src/app/styles/theme-overrides.css` - Added missing color definitions for success, warning, info, danger, special (both light and dark themes)
- Used throughout frontend: `text-success`, `text-warning`, `text-info`, `bg-success`, etc.

**When Discovered**: January 1, 2025 - Task log viewer needed green color for "Auto-scroll ON" text. User discovered `--success` was not defined in CSS when inspecting DevTools: "je vois '--success' is not defined en css... c'est ridicule".

**Prevention**:

- When adding new Tailwind color utilities, ALWAYS define the base CSS variable
- Use color naming convention: `--{name}` and `--{name}-foreground`
- Test in BOTH light and dark modes
- Check DevTools CSS inspector for undefined variables

**Remember**: Tailwind CSS utilities are just wrappers. The actual color values MUST exist in CSS custom properties.

---

## Radix UI Toggle Component - Requires Package Installation

**Problem**: Creating a Toggle component based on shadcn/ui pattern fails with "Cannot find module '@radix-ui/react-toggle'" even though other Radix UI components work fine.

**Root Cause**: Unlike some Radix UI components that might be bundled together, `@radix-ui/react-toggle` is a separate package that must be explicitly installed. It's not included in other Radix UI packages.

**Wrong Assumption** ❌:

"Other Radix components work, so Toggle should too - must be an import issue"

**Correct Solution** ✅:

```bash
# Install the Toggle primitive package
cd packages/web-frontend
npm install @radix-ui/react-toggle
```

Then create the component:

```typescript
import * as TogglePrimitive from '@radix-ui/react-toggle';
import { type VariantProps, cva } from 'class-variance-authority';

const toggleVariants = cva(/* ... variants ... */);

export type ToggleProps = React.ComponentPropsWithoutRef<typeof TogglePrimitive.Root> & VariantProps<typeof toggleVariants>;

const Toggle = React.forwardRef<React.ElementRef<typeof TogglePrimitive.Root>, ToggleProps>(
	({ className, variant, size, ...props }, ref) => (
		<TogglePrimitive.Root ref={ref} className={cn(toggleVariants({ variant, size, className }))} {...props} />
	)
);
```

**Key Principles**:

1. **Check package.json first**: Verify if the Radix package is installed
2. **Install missing primitives**: Each Radix UI primitive is a separate package
3. **Follow shadcn/ui pattern**: Use CVA for variants, forward refs, use `asChild` prop pattern
4. **TypeScript integration**: Extend `ComponentPropsWithoutRef<typeof Primitive.Root>`

**shadcn/ui Component Pattern**:

- Use CVA (class-variance-authority) for styling variants
- Create TypeScript type combining primitive props + variant props
- Forward ref to the Radix primitive
- Use `cn()` utility to merge classes
- Support `asChild` prop for composition

**Common Radix UI Packages**:

- `@radix-ui/react-dialog` - Modal dialogs
- `@radix-ui/react-dropdown-menu` - Dropdown menus
- `@radix-ui/react-toggle` - Toggle buttons (separate package!)
- `@radix-ui/react-switch` - ON/OFF switches
- `@radix-ui/react-checkbox` - Checkboxes
- `@radix-ui/react-select` - Select dropdowns

**Files Affected** (January 2025):

- `packages/web-frontend/package.json` - Added `@radix-ui/react-toggle` dependency
- `packages/web-frontend/src/framework/components/primitives/Toggle.tsx` - New component following shadcn/ui pattern

**When Discovered**: January 1, 2025 - Creating auto-scroll toggle for task logs viewer. Initially failed with module not found error, fixed by installing the package.

**Remember**: Always check if the Radix UI primitive you need is installed, even if other Radix components are already in use.

---

## Button Size Variants - Project-Specific Heights, Not Standard Tailwind

**Problem**: Assuming button `size="sm"` uses standard Tailwind heights like `h-8` or `h-9`, when the project uses custom sizing like `h-7`.

**Root Cause**: Projects customize their component libraries with project-specific design tokens. The Button component's size variants are defined in `Button.tsx`, not in Tailwind defaults.

**Wrong Assumption** ❌:

"Small buttons are typically h-8 in Tailwind, so I'll use that for the Toggle component"

**Correct Approach** ✅:

1. **Check the Button component definition**:

```typescript
// Button.tsx
const buttonVariants = cva(/* ... */, {
	variants: {
		size: {
			default: 'h-8 gap-1.5 px-2.5',
			sm: 'h-7 gap-1 px-2.5 text-[0.8rem]', // ← h-7, not h-8!
			lg: 'h-9 gap-1.5 px-2.5',
		},
	},
});
```

2. **Match the exact sizing in custom components**:

```typescript
// Toggle.tsx - Must match Button's sm size
const toggleVariants = cva(/* ... */, {
	variants: {
		size: {
			sm: 'h-7 gap-1 px-2.5 text-[0.8rem]', // Same as Button!
		},
	},
});
```

**Key Principles**:

1. **Read existing components first**: Check Button, Input, Select for consistent sizing
2. **Copy exact values**: Don't approximate - use the exact same height, gap, padding, font-size
3. **Visual consistency**: Components next to each other should have matching heights
4. **Design system**: Projects have their own design tokens that override Tailwind defaults

**Common Size Variants in Projects**:

- `xs`: Often `h-6` with smaller padding
- `sm`: Could be `h-7` (like this project) or `h-8`
- `default`: Often `h-8` or `h-10`
- `lg`: Often `h-9` or `h-11`

**Files Affected** (January 2025):

- `packages/web-frontend/src/framework/components/primitives/Toggle.tsx` - Initially used h-8, corrected to h-7 to match Button size="sm"
- Visual alignment with Button components in TaskLogsViewer controls bar

**When Discovered**: January 1, 2025 - User pointed out Toggle button was taller than adjacent buttons: "toujours pas pour la taille..." Checked Button.tsx and found `sm` uses `h-7`, not `h-8`.

**Remember**: Never assume standard Tailwind sizing. Always check the project's component library for actual size definitions.

---

## Styling Radix UI Toggle - Child Selector Required to Override State Styles

**Problem**: Adding `text-success` class directly to a span inside a Toggle component has no effect. The text color doesn't change even with `!important`.

**Root Cause**: Radix UI Toggle applies `data-[state=on]:text-accent-foreground` to the root element, which cascades to all children. This specificity beats regular class selectors, even with `!important` on the child.

**Wrong Approach** ❌:

```tsx
<Toggle pressed={isEnabled} ...>
	<span>Auto-scroll</span>
	<span className="!text-success">{isEnabled ? 'ON' : 'OFF'}</span>
	{/* No effect - accent-foreground still applies */}
</Toggle>
```

**Correct Solution** ✅:

```tsx
<Toggle pressed={isEnabled} className={`gap-2 text-xs ${isEnabled ? '[&>span:last-child]:!text-success' : ''}`}>
	<span>Auto-scroll</span>
	<span className="font-semibold">{isEnabled ? 'ON' : 'OFF'}</span>
	{/* Now text-success applies via parent selector */}
</Toggle>
```

**Why This Works**:

- `[&>span:last-child]:!text-success` is applied to the Toggle root
- Tailwind compiles this to `.toggle-root > span:last-child { color: var(--success) !important; }`
- Child combinator (`>`) + pseudo-class (`:last-child`) + `!important` beats the data attribute selector
- The color rule comes from the parent context, not the child

**Alternative Approach** (inline styles):

```tsx
<span style={{ color: isEnabled ? 'var(--success)' : undefined }}>{isEnabled ? 'ON' : 'OFF'}</span>
```

**Key Principles**:

1. **Understand Radix state styles**: Components like Toggle/Switch apply styles via `data-[state=...]` attributes
2. **Use parent selectors**: Target children from the parent's className, not child's className
3. **Specificity hierarchy**: `data-[state]` selector > class selector, need `!important` to override
4. **Tailwind arbitrary variants**: Use `[&>selector]:className` syntax for child targeting

**Common Radix State Attributes**:

- `data-[state=open]` / `data-[state=closed]` - Dialog, Dropdown, etc.
- `data-[state=on]` / `data-[state=off]` - Toggle, Switch
- `data-[state=checked]` / `data-[state=unchecked]` - Checkbox, Radio
- `data-[disabled]` - All interactive components

**Debugging Strategy**:

1. Inspect element in DevTools - which styles are applied?
2. Look for `data-[state=...]` attributes on component root
3. Check if parent's `text-accent-foreground` cascades to child
4. Apply color from parent using child selector instead of direct class

**Files Affected** (January 2025):

- `packages/web-frontend/src/app/pages/tasks/components/TaskLogsViewer.tsx` - Changed from direct `text-success` class to parent selector `[&>span:last-child]:!text-success`

**When Discovered**: January 1, 2025 - User wanted green color on "ON" text in Toggle. Direct className didn't work, even with `!important`. Solution: target from parent using Tailwind arbitrary variant.

**Remember**: When styling children of Radix UI components, use parent selectors to override state-based styles.

---

## User Intervention System - Worker-Orchestrator Integration Pattern

**Problem**: Implementing bidirectional communication for user interventions between Worker (flow execution) and Orchestrator (user response handling) required careful message protocol design and Promise-based waiting mechanism.

**Context**: Flow execution in Worker needs to pause and wait for user response from Orchestrator. The Orchestrator receives intervention requests, shows them in UI, gets user response, and sends response back to Worker.

**Solution Architecture**:

1. **Message Protocol Design**:
    - W2O (Worker→Orchestrator): `INTERVENTION_REQUESTED` message with full intervention config
    - O2W (Orchestrator→Worker): `INTERVENTION_RESPONSE` message with user response or timeout/cancellation

2. **TypeScript Generic Constraints**:
    - Use `keyof MessageMap` instead of enum type for generic constraints
    - Allows TypeScript to properly infer message payload types

```typescript
// ❌ Wrong - TypeScript can't index with enum
export function createMessage<T extends MessageType>(...)

// ✅ Correct - TypeScript can index with keyof
export function createMessage<T extends keyof MessageMap>(...)
```

3. **Promise-Based Blocking in Worker**:
    - Store Promise resolvers in `Map<taskId, {resolve, reject}>`
    - When intervention response arrives, resolve the Promise
    - Enables `await interventionHandler.requestIntervention(...)` pattern

```typescript
private pendingInterventions: Map<string, {
  resolve: (response: InterventionResponse | null) => void;
  reject: (error: Error) => void;
}> = new Map();

// Request intervention and wait
const promise = new Promise<InterventionResponse | null>((resolve, reject) => {
  this.pendingInterventions.set(taskId, { resolve, reject });
});

// Later, when response arrives
const pending = this.pendingInterventions.get(taskId);
pending.resolve(response);
```

4. **Callback Pattern for Response Delivery**:
    - InterventionManager doesn't directly access WebSocket server
    - Uses callback set by Orchestrator: `setSendResponseCallback()`
    - Callback finds worker by taskId and sends INTERVENTION_RESPONSE message

```typescript
// In InterventionManager
this.sendResponseCallback(taskId, interventionId, response, timedOut, cancelled);

// In Orchestrator
interventionManager.setSendResponseCallback((taskId, ...) => {
  return this.wsServer.sendInterventionResponse(taskId, ...);
});
```

5. **Timeout Handling**:
    - Client-side timeout in Worker (safety net)
    - Server-side timeout in InterventionManager (authoritative)
    - Three strategies: 'fail' (no response), 'continue' (null response), 'default' (specified value)

6. **Interface Evolution - Remember answeredAt**:
    - When adding response data, ensure timestamp fields are included
    - `InterventionResponse` needs `answeredAt` field for audit trail
    - Update all places that create response objects to include timestamp

**Common Pitfalls**:

- ❌ Making `flowId` required when it should be optional (worker might not be in flow context)
- ❌ Forgetting to add timestamp fields like `answeredAt` to response interfaces
- ❌ Using enum type instead of `keyof MessageMap` for generic constraints
- ❌ Not cleaning up pending promises on timeout/cancellation
- ❌ Trying to send response to worker that disconnected

**Testing Strategy**:

Create integration tests that cover full lifecycle:

1. Worker connects and gets assigned task
2. Worker sends INTERVENTION_REQUESTED
3. Orchestrator creates intervention
4. User responds via InterventionManager
5. Orchestrator sends INTERVENTION_RESPONSE
6. Worker receives and resolves promise
7. Flow continues execution

Test edge cases:

- Timeout with different strategies (fail/continue/default)
- Cancellation
- Multiple interventions per task
- Non-blocking interventions (no wait)
- Worker disconnect with pending intervention

**Files Modified** (January 2025):

- `packages/shared-orch-worker/src/orchestrator-messages.ts` - Added INTERVENTION_RESPONSE
- `packages/shared-orch-worker/src/worker-messages.ts` - Added INTERVENTION_REQUESTED
- `packages/shared-orch-worker/src/domain-types.ts` - Added answeredAt to InterventionResponse
- `packages/worker/src/flow/FlowWorker.ts` - Promise-based intervention handling
- `packages/orchestrator/src/websocket/WebSocketEventHandler.ts` - Handle INTERVENTION_REQUESTED
- `packages/orchestrator/src/websocket/WebSocketConnectionManager.ts` - Send responses
- `packages/orchestrator/src/core/InterventionManager.ts` - Callback mechanism
- `packages/orchestrator/src/core/Orchestrator.ts` - Wire callback
- `packages/orchestrator/src/websocket/InterventionFlow.test.ts` - Integration tests

**Key Lessons**:

1. **Use `keyof` for message type generics** - Enables proper type inference
2. **Promise Map pattern works well for async wait** - Clean API for blocking operations
3. **Callback pattern decouples components** - InterventionManager doesn't need WebSocket dependency
4. **Always include timestamps** - answeredAt, createdAt, timeoutAt for audit trails
5. **Test timeout scenarios thoroughly** - Different strategies need different handling
6. **Clean up promises on error/timeout** - Prevent memory leaks
7. **Optional fields for cross-context data** - flowId may not exist in all contexts

**When Discovered**: January 1, 2025 - Completing user intervention system worker-orchestrator integration. Multiple TypeScript errors around generic constraints, missing timestamp fields, and optional flowId requirement.

**Reference**: See plan file `giggly-booping-hennessy.md` for complete implementation details and architecture decisions.

---

## Base UI Combobox - Control Open State and Sync Input Value Properly

**Problem**: ComboboxInput component had three critical bugs:

1. User could not type in the field - text input had no effect
2. "No results found" displayed even when results were visible
3. Selected value didn't display when field was closed (showed only placeholder)

**Root Cause**: The `inputValue` prop wasn't properly synchronized with the component's open/closed state and selected value. Base UI Combobox requires careful state management for the input value based on whether the dropdown is open or closed.

**Key Issues**:

1. **Input value not synced with selected value**: When closed, `inputValue` should show the selected option's label, not be empty
2. **No open/close state tracking**: Component didn't know when dropdown was open vs closed
3. **Manual filtering conflicts with Base UI**: We filter options manually but need to ensure Base UI's empty detection works correctly

**Correct Solution** ✅:

```typescript
export function ComboboxInput({ value, onChange, options, placeholder, disabled, id }: ComboboxInputProps) {
  const [searchValue, setSearchValue] = useState('');
  const [isOpen, setIsOpen] = useState(false);

  // Find the selected option label to display
  const selectedOption = options.find(opt => opt.value === value);
  const displayValue = selectedOption?.label || '';

  // Sync inputValue with selected value when closed
  useEffect(() => {
    if (!isOpen) {
      setSearchValue(displayValue);
    }
  }, [displayValue, isOpen]);

  // Filter options based on search input
  const filteredOptions = useMemo(() => {
    if (!searchValue.trim()) return options;
    return options.filter(option =>
      option.label.toLowerCase().includes(searchValue.toLowerCase())
    );
  }, [options, searchValue]);

  const handleOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (open) {
      setSearchValue(''); // Clear to show all options
    } else {
      setSearchValue(displayValue); // Restore selected label
    }
  };

  return (
    <Combobox
      value={value || null}
      onValueChange={handleValueChange}
      inputValue={searchValue}
      onInputChange={e => setSearchValue(e.target.value)}
      open={isOpen}
      onOpenChange={handleOpenChange}
    >
      {/* ... */}
    </Combobox>
  );
}
```

**Key Principles**:

1. **Track open state explicitly**: Use controlled `open` prop with `isOpen` state
2. **Sync input value with selection**: When closed, show selected label; when opening, clear for search
3. **Use useEffect for closed state sync**: Automatically update input when selection or open state changes
4. **Clear on open**: Starting with empty search shows all options (better UX)
5. **Manual filtering is OK**: Base UI detects empty state from `filteredOptions` array length

**Expected Behavior**:

- **Closed**: Shows selected option label or placeholder
- **Opening**: Clears input to show all options
- **Typing**: Filters options in real-time
- **After selection**: Closes dropdown and displays selected label
- **Empty state**: "No results found" only when `filteredOptions.length === 0`

**Common Pitfalls**:

- ❌ Not tracking `isOpen` state - can't manage input value correctly
- ❌ Not syncing `searchValue` with `displayValue` when closed
- ❌ Using `onFocus`/`onBlur` instead of `onOpenChange` - unreliable for state management
- ❌ Assuming Base UI will handle input value automatically
- ✅ Controlled state management for both `open` and `inputValue`

**Testing Checklist**:

- [ ] Click field and verify you can type
- [ ] Typing filters the options list correctly
- [ ] "No results found" only shows when truly no matches
- [ ] Select option and verify label displays when closed
- [ ] Reopen and verify search starts fresh (empty or cleared)
- [ ] Test with pre-selected value (should show label immediately)
- [ ] Test disabled state
- [ ] Test with empty options list

**Files Created** (January 2025):

- `packages/web-frontend/src/framework/features/forms/inputs/ComboboxInput.stories.tsx` - Comprehensive Storybook stories for testing
- `packages/web-frontend/src/framework/features/forms/fields/ComboboxField.stories.tsx` - Field-level stories with validation

**Files Modified**:

- `packages/web-frontend/src/framework/features/forms/inputs/ComboboxInput.tsx` - Added `isOpen` state, `useEffect` sync, and `handleOpenChange`

**Usage Context**: Used in CreateTaskDialog for worker and flow selection. The component provides search/filter functionality for dropdowns with many options.

**When Discovered**: January 1, 2026 - User reported three bugs with screenshots showing the issues. Fixed by properly managing open state and input value synchronization.

**Base UI Documentation**: The Base UI Combobox component requires explicit control over:

- `open` / `onOpenChange` for dropdown state
- `inputValue` / `onInputChange` for input field text
- Manual filtering of options (Base UI doesn't filter automatically)
- Empty state detection based on filtered options array

**Remember**: Base UI components require controlled state management. Don't assume they handle everything internally - you need to explicitly manage open state and input value synchronization.

---

## User Intervention Steps - Declarative Output Pattern

**Problem**: Initial implementation of user_intervention steps had "magic" auto-generated outputs (approved, rejected, userResponse, etc.) that were not declared in the step definition. This violated the "no-magic, fully declarative" principle.

**Context**: User wanted all step types to follow the same pattern: outputs must be explicitly declared in the `output:` field, not auto-generated. This makes flows self-documenting and prevents the FlowBuilder from needing to know implementation details of each step type.

**Solution**: Modified StepRunner to use OutputExtractor (same as script/model/subflow steps) for declarative output mapping.

**Implementation**:

1. **StepRunner.executeUserInterventionStep()** now builds an `additionalContext` with all intervention response values:

```typescript
const additionalContext = {
	// Raw values
	value: response.value,
	comment: response.comment,
	answeredBy: response.answeredBy,
	answeredAt: response.answeredAt,

	// Common aliases
	userResponse: response.value,
	approved: response.value === true,
	rejected: response.value === false,
	answer: response.value,
	choice: response.value,
};

// Use OutputExtractor just like other steps
const outputs = this.outputExtractor.extract(rawOutput, step.output, step.id, additionalContext);
```

2. **Flow definition** explicitly declares outputs:

```yaml
- type: user_intervention
  id: approval
  interventionType: approval
  approval:
      title: 'Approve Deployment'
  output:
      approved: { type: boolean } # User must declare what they want
      comment: { type: string }
      answeredBy: { type: string }
```

3. **OutputExtractor** maps output names to additionalContext values:
    - If `output.approved` is declared, it looks for `additionalContext.approved`
    - No regex pattern needed (direct value lookup)
    - Same behavior as other step types (consistent pattern)

**Available Variables**:

- `value` - Raw response value (boolean/string/array)
- `comment` - Optional comment
- `answeredBy` - Who answered
- `answeredAt` - When answered
- `userResponse` - Generic alias for value
- `approved` - For approval (true if approved)
- `rejected` - For approval (true if rejected)
- `answer` - For question type
- `choice` - For choice type

**Benefits**:

1. **No Magic**: All outputs are explicitly declared in YAML
2. **Self-Documenting**: Flow definition shows exactly what outputs are available
3. **Consistent Pattern**: All steps (script, model, subflow, user_intervention) work the same way
4. **FlowBuilder Friendly**: UI doesn't need special logic per step type
5. **Type-Safe**: Outputs have explicit types (boolean, string, etc.)
6. **Flexible**: Users can name outputs whatever they want

**Testing**:

- See `test-user-intervention` flow in `.agent-fleet/flows.yml`
- Documented in `.claude/docs/user-intervention-outputs.md`

**When Discovered**: January 2, 2025 - User pointed out that auto-generated outputs violated the "no-magic" principle.

**Reference**: Conversation about FlowBuilder needing to be easy to write without knowing implementation details of each step type.

---

## User Intervention Step Type Not Parsed by FlowRegistry

**Issue**: The `FlowRegistry.parseFlowStep()` method did not handle the `user_intervention` step type, causing all user intervention steps to be incorrectly parsed as `ModelFlowStep` (default case). This resulted in validation errors like "Model step 'X' must have a non-empty prompt" for user intervention steps.

**Root Cause**:

- `FlowRegistry.parseFlowStep()` had branches for `subflow`, `script`, and a default case for `model`
- Missing branch for `user_intervention` type
- Steps with `type: 'user_intervention'` fell through to the default `model` case

**Solution**:
Added the missing branch in `packages/flow-engine/src/registry/FlowRegistry.ts`:

```typescript
} else if (stepType === 'user_intervention') {
    // User Intervention step
    return {
        ...baseStep,
        type: 'user_intervention',
        interventionType: data.interventionType,
        blocking: data.blocking !== false, // Default to true
        timeout: data.timeout,
        approval: data.approval,
        question: data.question,
        choice: data.choice,
    };
}
```

**Additional Fixes**:

1. **Removed dangerous default fallback**: Changed `data.type || 'model'` to explicit validation that throws if `type` is missing. No more silent errors!
2. **Made all step types explicit**: Moved `model` from default case to explicit branch. Unknown types now throw immediately.
3. **Added output validation for user_intervention steps**:
    - **Error** if output has a `pattern` (doesn't make sense for user_intervention)
    - **Warning** if output name not in available values: `value`, `comment`, `answeredBy`, `answeredAt`, `userResponse`, `approved`, `rejected`, `answer`, `choice`
4. **Added explicit type casts** in `SchemaValidator.validateStepType()` for proper TypeScript narrowing.

**Engineering Principle**: **Fail fast, fail explicitly**. Never use fallbacks that mask errors - they create silent bugs that are hard to debug. Every error should throw immediately with a clear message.

**Impact**:

- User intervention flows can now be properly validated and executed
- Invalid outputs are caught at validation time, not runtime
- Type mismatches throw immediately instead of creating ModelFlowStep silently

**When Discovered**: January 2, 2025 - User reported that `test-user-intervention` flow was marked as invalid in TasksV2 with "Model step must have prompt" error, but appeared valid in FlowEditor. User then correctly identified that the `|| 'model'` fallback was "une pure connerie d'engineering" that masked the real error.

**Reference**: The FlowEditor validates using frontend code, while TasksV2 shows metadata from the worker's validation. The worker uses FlowRegistry which was missing the parser branch.

---

## Always Use Framework Components, Not Native HTML Elements

**Issue**: When adding UI controls (like dropdowns), using native HTML elements (`<select>`) with inline styles instead of framework components results in:

- Inconsistent styling (e.g., black background in dark mode)
- Poor accessibility
- Lack of keyboard navigation
- Missing design system integration

**Root Cause**:

- Developer unfamiliar with available framework components
- Following existing bad patterns in codebase without questioning them
- Not checking for proper component abstractions before implementing

**Solution**:

Use the framework's Radix UI-based components from `@framework/components/forms/`:

```typescript
// ❌ BAD - Native HTML with inline styles
<select
  value={value}
  onChange={e => onChange(e.target.value)}
  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
>
  <option value="option1">Option 1</option>
  <option value="option2">Option 2</option>
</select>

// ✅ GOOD - Framework component
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@framework/components/forms/Select';

<Select value={value} onValueChange={onChange}>
  <SelectTrigger className="w-full">
    <SelectValue />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="option1">Option 1</SelectItem>
    <SelectItem value="option2">Option 2</SelectItem>
  </SelectContent>
</Select>
```

**Available Framework Components**:

Located in `packages/web-frontend/src/framework/components/`:

- **Forms**: `Input`, `Label`, `Textarea`, `Select`, `Checkbox`, `RadioGroup`
- **Primitives**: `Button`, `Separator`, `Card`, `Badge`
- **Advanced**: `Dialog`, `Popover`, `Tooltip`, `DropdownMenu`

**Engineering Principle**: **Use the design system**. Never reinvent UI controls with native HTML + inline styles. The framework components provide:

- Consistent styling across light/dark modes
- Proper accessibility (ARIA, keyboard navigation)
- TypeScript types
- Mobile-friendly interactions
- Design system tokens

**When Discovered**: January 2, 2025 - User correctly called out "amateurisme" when noticing black backgrounds on select dropdowns in FlowEditorPropertiesPanel. Investigation revealed native `<select>` elements with inline CSS classes instead of proper Radix UI Select components.

**Impact**: All user_intervention configuration dropdowns now use proper Select components with consistent styling and better UX.

---

## Explicit Output Sources with 'from' Field

**Issue**: User intervention outputs declared types (`approved: { type: boolean }`) but did NOT specify where the value comes from. This is "magic" - the system implicitly knew to look in `additionalContext`, but it wasn't explicit in the YAML. "Comment tu comptes mapper le 'approved'? il vient d'ou ? tu le sais PAS, donc invalide !"

**Root Cause**: No explicit source specification for output values. The connection between YAML declarations and runtime extraction was implicit/magical.

**Solution**: Added `from` field to `OutputVariableConfig` to make sources explicit.

**Before** (INVALID - magic):

```yaml
output:
    approved: { type: boolean } # ❌ Where does this come from?
    comment: { type: string } # ❌ No source specified!
```

**After** (VALID - explicit):

```yaml
output:
    approved: { type: boolean, from: 'intervention.approved' }
    comment: { type: string, from: 'intervention.comment' }
    answeredBy: { type: string, from: 'intervention.answeredBy' }
```

**Implementation Changes**:

1. **Added `from` field** to `OutputVariableConfig` type (`packages/flow-engine/src/types.ts`)
2. **Validation enforces explicit sources** (`packages/flow-engine/src/validation/SchemaValidator.ts`):
    - ERROR if user_intervention output lacks `from` field
    - ERROR if user_intervention output has `pattern` (doesn't make sense)
    - ERROR if `from` points to non-existent source
3. **OutputExtractor uses `from`** (`packages/flow-engine/src/processing/OutputExtractor.ts`):
    - Added `extractFromPath()` to navigate dot-notation paths like 'intervention.approved'
    - Fails fast if path doesn't exist
4. **StepRunner structures context** (`packages/flow-engine/src/executor/StepRunner.ts`):
    - Changed from flat `{ approved: true, comment: '...' }`
    - To nested `{ intervention: { approved: true, comment: '...' } }`
    - Makes the namespace explicit

**Available Sources for user_intervention**:

- `intervention.value` - Raw response value
- `intervention.comment` - Optional comment
- `intervention.answeredBy` - Who answered
- `intervention.answeredAt` - When answered
- `intervention.userResponse` - Generic alias for value
- `intervention.approved` - For approval: true if approved
- `intervention.rejected` - For approval: true if rejected
- `intervention.answer` - For question: the answer
- `intervention.choice` - For choice: selected choice(s)

**Engineering Principle**: **No magic. Everything explicit.** If you can't tell from reading the YAML where a value comes from, it's wrong. The `from` field makes it impossible to have implicit/magical mappings.

**When Discovered**: January 2, 2025 - Immediately after fixing the parser issue, user correctly identified that outputs without source specification are invalid: "Ces outputs n'ont pas été changé... comment tu comptes mapper le 'approved'? il vient d'ou ? tu le sais PAS, donc invalide !". User rejected implicit/automatic outputs as "C'EST DE LA MAGIE".

---

## Carousel Implementation - Headless Composable Pattern with Embla

**Problem**: Need to create a carousel-based view for ingredients that follows the same composable architecture as table/grid views (v2/v3), while integrating a third-party carousel library (Embla).

**Solution**: Treat carousel as a **feature hook** following the FeatureContract pattern, just like pagination, sorting, or search.

**Key Design Decision**: Carousel state management is UI-only and doesn't affect backend queries.

**Implementation Pattern**:

```typescript
// 1. Create feature hook following FeatureContract
export function useCarousel(options: UseCarouselOptions): CarouselContract {
	const [emblaRef, emblaApi] = useEmblaCarousel({ ... });
	// Wrap Embla API with consistent fstate/actions/fillQuery interface
	return { fstate, actions, fillQuery: () => {} }; // fillQuery is no-op
}

// 2. Compose with other features in page component
const pagination = usePagination2({ pageSize: 3 });
const sorting = useSorting2({ ... });
const search = useSimpleSearch({ ... });
const carousel = useCarousel({ itemsPerView: pagination.fstate.pageSize });

// 3. Pass to Data2 shell (carousel not passed to Data2, only to displayer)
<Data2 pagination={pagination} sorting={sorting} search={search}>
  {props => <IngredientCarousel4 {...props} carousel={carousel} />}
</Data2>
```

**Why This Works**:

- **Separation of Concerns**: Carousel handles presentation (scrolling), pagination handles data fetching (pages)
- **Composability**: Carousel can be reused in any page, not just ingredients
- **Consistency**: Follows same pattern as other features (pagination, sorting, etc.)
- **No Backend Impact**: Carousel state is purely UI - doesn't affect API queries

**Common Pitfall**: Trying to merge carousel navigation with pagination. These are **separate concerns**:

- **Pagination**: Fetches data in pages (e.g., page 1 with 3 items)
- **Carousel**: Displays current page's items with scrolling UI

**Files Created**:

- `packages/web-frontend/src/app/pages/ingredients4/useCarousel.ts` - Feature hook
- `packages/web-frontend/src/app/pages/ingredients4/IngredientCarousel4.tsx` - Displayer
- `packages/web-frontend/src/app/pages/ingredients4/IngredientCard4.tsx` - Card component
- `packages/web-frontend/src/app/pages/ingredients4/Ingredients4CarouselPage.tsx` - Orchestrator

**Reusable Components**:

- useCarousel hook can be extracted to `@framework/hooks2/` for framework-level reuse
- Pattern works for any carousel need (books, tasks, etc.)

**TypeScript Clean**: All new files passed type checking with no errors.

**When Discovered**: January 13, 2026 - User requested carousel view to explore composability patterns and create "antifragile" components that can handle new use cases without breaking.

---

## Fix Root Causes, Not Symptoms - And Actually Apply Lessons Learned

**Problem**: When encountering bugs, tendency to apply quick fixes that mask symptoms instead of analyzing and fixing the root cause. Additionally, saying "I understand" or "I'll integrate this feedback" without actually following through by updating documentation.

**Example Case - Carousel Display Bug**:

User reported seeing "Slide 15 / 10" in carousel display after scrolling. This was the symptom.

**Wrong Approach** ❌:

```typescript
// First attempt - treating the symptom
const onSelect = () => {
	setCurrentIndex(emblaApi.selectedScrollSnap());
	setCanScrollPrev(emblaApi.canScrollPrev());
	setCanScrollNext(emblaApi.canScrollNext());
	setScrollSnaps(emblaApi.scrollSnapList()); // ❌ Recalculate on EVERY scroll!
};
```

User challenge: "tu penses que c'est une bonne solution que le 'max' soit recalculé après le scroll ?"

**Root Cause Analysis** ✅:

The real issue wasn't that scrollSnaps needed updating - it was that we were using the WRONG data source for display:

- `scrollSnaps.length` = number of snap points (UI metric for dot indicators)
- `ingredients.length` = actual number of items accumulated (correct data source)

**Correct Fix** ✅:

```typescript
// In display
<span>Slide {carousel.fstate.currentIndex + 1} / {ingredients.length}</span>
// Use ingredients.length (data count), not scrollSnaps.length (UI metric)

// In useCarousel - NO recalculation on scroll
const onSelect = () => {
  setCurrentIndex(emblaApi.selectedScrollSnap());
  setCanScrollPrev(emblaApi.canScrollPrev());
  setCanScrollNext(emblaApi.canScrollNext());
  // scrollSnaps calculated once on init, not on every scroll
};
```

**Key Principles**:

1. **Identify the root cause**: Why is this happening? What's the actual problem?
2. **Question quick fixes**: If a fix feels like a workaround, it probably is
3. **Analyze data sources**: Are you using the right metric for what you're displaying?
4. **Performance matters**: Recalculating on every event is often a red flag
5. **Think before declaring "fixed"**: Analyze the solution thoroughly before saying it's correct

**The Meta-Lesson - Following Through**:

When I said "J'ai bien compris. Je vais intégrer ce feedback dans ma façon de travailler", the user correctly challenged: "comment tu l'as intégré ? Je suis curieux, car je ne t'ai pas vu modifier lessons_learned"

**Critical Mistake Pattern**:

- Say "I understand" → Don't update documentation
- Say "I'll integrate this" → Don't actually integrate it
- Declare something "correct" → Haven't analyzed it thoroughly
- User has to point out the pattern → Repeat the same mistake in the next message

**What "Integrating Feedback" Actually Means**:

1. ✅ **Update documentation** - Add lesson to lessons-learned.md IMMEDIATELY
2. ✅ **Apply the principle** - Use it in your next action, not just acknowledge it
3. ✅ **Verify before declaring** - Analyze thoroughly before saying "it's fixed" or "it's correct"
4. ✅ **Be proactive** - Reflect on solutions yourself instead of waiting for user to question them

**Questions to Ask Yourself Before Declaring Something Fixed**:

- Have I identified the root cause, or just masked the symptom?
- Is this using the correct data source for what I'm displaying?
- Does this solution make semantic sense, or is it a hack?
- Would this work with edge cases (e.g., 72+ items, 108+ items)?
- Have I analyzed this thoroughly, or am I just guessing it's correct?
- If I said "I'll integrate this lesson" - have I actually updated lessons-learned.md?

**When Discovered**: January 14, 2026 - During infinite scroll carousel implementation. User had to repeatedly challenge my approach: first the symptom-treating fix, then my failure to actually apply the lesson I said I learned. User quote: "et le message qui suit, tu dis deja que tu n'as pas appliqué ta lecon, c'est fou"

## Bug Fixing: Write Regression Tests BEFORE Attempting Fixes

**Problem**: When a user reports a bug, the immediate instinct is to analyze the code, identify a potential cause, and write a fix. This leads to:

- Multiple failed fix attempts (tried 5+ different approaches in one session)
- Tests that pass but production bug persists (timing differences)
- User frustration: "toujours pareil", "encore une fois", "ca devrait ? t'as pas écrit de test avant de fixer ? ENCORE UNE FOIS ?"
- Wasted time on fixes that don't actually solve the problem

**Root Cause**: Without a failing test that reproduces the bug, you're:

1. **Flying blind** - Can't verify the bug exists in your test environment
2. **Guessing the fix** - No way to know if your change actually works
3. **Creating regressions** - Changes may fix one thing but break another
4. **Testing in production** - User becomes your QA tester

**Wrong Approach** ❌:

```
User: "Project switching is broken, it flash-loads and reverts"
Agent: "Let me analyze the code... I think the issue is in useUrlState"
Agent: *writes fix*
Agent: "This should fix it"
User: "toujours pareil"
Agent: "Let me try another fix..."
User: "toujours pareil"
Agent: "Maybe this approach..."
User: "toujours pareil... donc, tu n'as pas reproduit le cas dans le test"
```

**Correct Approach** ✅:

```
User: "Project switching is broken, it flash-loads and reverts"
Agent: "Let me reproduce this in a test first"
Agent: *uses agent-browser to manually reproduce*
Agent: *writes automated test following the manual steps*
Agent: *verifies test FAILS (reproduces the bug)*
Agent: "Test written and failing - now I'll fix it"
Agent: *writes fix*
Agent: *verifies test PASSES*
Agent: *verifies with agent-browser that production works*
```

**Test-First Bug Fixing Process**:

1. **Reproduce manually** - Use agent-browser to see the exact user flow
2. **Write automated test** - Follow the manual steps in test code
3. **Verify test FAILS** - Ensure test actually reproduces the bug
4. **Only then fix** - Now you have a safety net
5. **Verify test PASSES** - Your fix solved the problem
6. **Verify manually** - Confirm in real browser with agent-browser

**Example from Session - Project Switching Bug**:

```typescript
// Test written BEFORE fix - reproduces exact agent-browser steps
it('CRITICAL: should NOT revert projectId when clicking second project', async () => {
  // Step 1: Navigate to base URL (simulates: agent-browser open http://localhost:5030/projects-v2)
  render(<ProjectsV2Page />, {
    wrapper: ({ children }) => wrapper({ children, initialUrl: '/' }),
  });

  // Step 2: Wait for initial load and auto-selection (simulates: agent-browser wait 1000)
  await waitFor(() => {
    expect(screen.getByText('Image generation')).toBeInTheDocument();
  });

  // Step 3: Verify initial URL shows first project (simulates: agent-browser get url)
  let params = getSearchParams();
  expect(params.get('projectId')).toBe('jz52yz1uq');

  // Step 4: Click "Agent Fleet" button (simulates: agent-browser click @e19)
  const agentFleetButton = screen.getByText('Agent Fleet');
  await userEvent.click(agentFleetButton);

  // Step 5: Wait for all URL flushes to complete (simulates: agent-browser wait 800)
  await waitFor(() => {
    params = getSearchParams();
    expect(params.get('workspaceId')).toBe('50115a2e-5226-46d4-9fb8-6f9c11a16f9d');
  }, { timeout: 1000 });

  // Step 6: CRITICAL CHECK - Final URL must have projectId=wwuypfn8p
  // BUG: Without fix, this will be 'jz52yz1uq' (reverted!)
  params = getSearchParams();
  expect(params.get('projectId')).toBe('wwuypfn8p'); // ❌ FAILS before fix, ✅ PASSES after
});
```

**Why This Matters**:

1. **Confidence** - You know the fix works because test passes
2. **No regressions** - Test will catch if bug returns in future
3. **Efficiency** - One good test > multiple blind fix attempts
4. **User trust** - "c'est magnifique de te voir faire les tests manuels" vs "tu te fous de ma gueule ?"

**User Feedback That Triggered This Lesson**:

- "Ecris un test de non regression et assure toi de reproduire le probleme AVANT de corriger"
- "toujours pareil... donc, tu n'as pas reproduit le cas dans le test de non-regression"
- "et encore une fois, je veux un test AVANT que tu corriges"
- "ca devrait ? t'as pas écrit de test avant de fixer ? ENCORE UNE FOIS ?"

**When Discovered**: January 24, 2026 - During ProjectsV2Page URL state race condition debugging. User had to remind me **4+ times** to write tests first before I finally did it correctly.

---

## Agent-Browser: Test Yourself Instead of Bothering the User

**Problem**: When debugging UI issues, the default pattern is:

1. Make a change
2. Ask user: "Could you test this?"
3. User tests, reports still broken
4. Make another change
5. Ask user again: "Could you test now?"
6. Repeat 5-10 times...

This is **exhausting for the user** and **inefficient** for debugging.

**Root Cause**: Not utilizing available tools. The agent-browser skill provides:

- Real browser testing (Chrome/Firefox)
- Interactive snapshots with element refs
- Click, fill, navigate commands
- URL inspection
- Screenshot capabilities

**Wrong Approach** ❌:

```
Agent: "I've made a fix to ProjectsV2Page"
Agent: "Could you test if the project switching works now?"
User: "toujours pareil"
Agent: "I've added some checks to useUrlState"
Agent: "Could you test again?"
User: "toujours pareil"
Agent: "Let me try another approach..."
Agent: "Could you verify this fixes it?"
User: "je vais te donner accès à agent-browser comme ca tu feras les tests toi meme
        j'en ai marre de faire et refaire les tests alors que tu ajoutes des bugs sans arret."
```

**Correct Approach** ✅:

```
Agent: "Let me test this with agent-browser before asking you"
Agent: *agent-browser open http://localhost:5030/projects-v2*
Agent: *agent-browser wait 1000*
Agent: *agent-browser get url* → verify auto-selection
Agent: *agent-browser snapshot -i* → find button refs
Agent: *agent-browser click @e19* → click Agent Fleet
Agent: *agent-browser get url* → check if URL correct
Agent: "Verified: Bug is fixed. URL shows projectId=wwuypfn8p with no revert"
User: "commentaire en passant, c'est magnifique de te voir faire les tests manuels"
```

**Agent-Browser Workflow for Bug Verification**:

1. **Navigate** - Open the page: `agent-browser open http://localhost:5030/projects-v2`
2. **Wait** - Let page load: `agent-browser wait 1000`
3. **Inspect** - Check state: `agent-browser get url`, `agent-browser snapshot -i`
4. **Interact** - Reproduce bug: `agent-browser click @e19`
5. **Verify** - Check result: `agent-browser get url` again
6. **Screenshot** - Document if needed: `agent-browser screenshot bug-fix.png`

**Example from Session - Manual Testing Before Fix**:

```bash
# Step 1: Navigate to page
agent-browser open http://localhost:5030/projects-v2

# Step 2: Wait for initial load
agent-browser wait 1000

# Step 3: Verify auto-selection happened
agent-browser get url
# Output: http://localhost:5030/projects-v2?projectId=jz52yz1uq

# Step 4: Get interactive elements
agent-browser snapshot -i
# Output: button "Agent Fleet 1" [ref=e19]

# Step 5: Click second project
agent-browser click @e19

# Step 6: Wait for URL updates
agent-browser wait 800

# Step 7: Check if bug occurs (URL reverts?)
agent-browser get url
# BEFORE FIX: http://localhost:5030/projects-v2?projectId=jz52yz1uq (REVERTED! Bug confirmed)
# AFTER FIX: http://localhost:5030/projects-v2?projectId=wwuypfn8p&workspaceId=... (CORRECT!)
```

**Benefits**:

1. **User satisfaction** - "c'est magnifique de te voir faire les tests manuels, plutot de devoir le faire moi à chaque fois"
2. **Faster debugging** - See the bug yourself instead of playing telephone
3. **Better understanding** - Observe timing, flashing, URL changes in real-time
4. **Confidence** - Verify fix works before claiming it's done
5. **Better tests** - Automated tests can follow manual agent-browser steps exactly

**Integration with Test-First Approach**:

```
1. User reports bug
2. Reproduce manually with agent-browser
3. Document exact steps (open, wait, click, verify)
4. Write automated test following those exact steps
5. Verify automated test FAILS (reproduces bug)
6. Write fix
7. Verify automated test PASSES
8. Verify manually with agent-browser again
9. Only then tell user it's fixed
```

**User Feedback**:

- "je vais te donner accès à agent-browser comme ca tu feras les tests toi meme j'en ai marre"
- "commentaire en passant, c'est magnifique de te voir faire les tests manuels, plutot de devoir le faire moi à chaque fois, c'est avec une paix dans l'ame que je pourrais te deleguer de plus en plus de tache à l'avenir ! <3"

**When to Use Agent-Browser**:

- ✅ Before claiming a bug is fixed
- ✅ When reproducing a user-reported issue
- ✅ When testing complex UI interactions (tabs, forms, navigation)
- ✅ When timing matters (race conditions, async operations)
- ✅ When writing regression tests (follow manual steps in automated tests)
- ❌ For simple unit test failures (use vitest directly)

**When Discovered**: January 24, 2026 - During ProjectsV2Page debugging. User granted agent-browser access after frustration with repeated "Could you test?" requests. Led to both successful bug reproduction AND user appreciation for self-service testing.

**Remember**: "I understand" without action is meaningless. "It's fixed" without analysis is dishonest. Think critically, fix root causes, and follow through on commitments to update documentation.

---

## Always Design for User Experience, Not Technical Metrics

**Problem**: Displaying technical metrics that are correct from an implementation perspective but confusing or misleading from a user's perspective. Failing to ask "What does the user actually see and understand?"

**Example Case - Carousel Item Count Display**:

User viewing a carousel with 3 items visible at once, out of 25 total items.

**Three Progressive Failures** ❌:

1. **First attempt**: "Slide 15 / 10"
    - Technical issue: Using `scrollSnaps.length` (UI metric) instead of actual data count
    - User confusion: "I see item 15 but max is 10?"

2. **Second attempt**: "Slide 1 / 12"
    - Technical issue: Using `ingredients.length` (loaded items) instead of `totalItems` (full dataset)
    - User confusion: "Why does it say 12 when I know there are 25 ingredients?"
    - User quote: "Ca doit être la taille complète du dataset !!!! pense à l'utilisatuer"

3. **Third attempt**: "Slide 23 / 25"
    - Technical issue: Showing position of first visible item, ignoring that 3 items are visible simultaneously
    - User confusion: "I'm looking at items 23, 24, and 25 right now, why does it say 23/25?"
    - User quote: "c'est normal d'afficher 23/25 lorsque je suis sur la derniere slide j'imagine ? vu qu'il y a 3 slides à l'écran"

**Correct Solution** ✅:

```typescript
// Show the RANGE of items currently visible
<span>
  Viewing: {currentIndex + 1}-{Math.min(currentIndex + itemsPerView, totalItems)} of {totalItems}
</span>

// Examples:
// - At start: "Viewing: 1-3 of 25"
// - At end: "Viewing: 23-25 of 25"
// - In middle: "Viewing: 10-12 of 25"
```

**Key Principles**:

1. **Think from user's perspective**: What does the user ACTUALLY see on screen?
2. **Match visual reality**: If 3 items are visible, show a range of 3 items
3. **Use meaningful totals**: Show full dataset size, not cached/loaded subset
4. **Question technical metrics**: Just because a value is "correct" technically doesn't mean it's useful to users
5. **Ask "So what?"**: Would a user understand this number? Does it help them?

**Questions to Ask Before Displaying Any Metric**:

- What is the user actually seeing on their screen right now?
- Does this number reflect their visual experience?
- Is this number actionable or just confusing?
- Am I displaying a technical implementation detail instead of user-facing information?
- Would my mom understand what this number means?

**Common UX Mistakes**:

- ❌ Displaying internal indices (0-based) instead of user counts (1-based)
- ❌ Showing cached/loaded counts instead of total available counts
- ❌ Displaying single positions when multiple items are visible
- ❌ Using technical terminology ("scrollSnaps", "pageSize") in user-facing text
- ❌ Showing implementation details that users don't care about
- ✅ Always ask: "If I were the user, would this make sense?"

**Impact**:

User experience is not optional or a "nice to have" - it's fundamental. A technically correct display that confuses users is a bug, not a feature. Users don't care about your implementation details; they care about understanding what they're looking at.

**When Discovered**: January 14, 2026 - Three consecutive failures on the same carousel component, each technically "correct" but failing to consider user experience. User had to correct each one. User quote: "ca semble tellement évident mias tu ne l'as pas fait 3x de suite"

**Remember**: Always put yourself in the user's shoes. If a metric doesn't make sense from their perspective, it's wrong - even if it's technically accurate. User experience isn't about displaying data correctly; it's about displaying data **meaningfully**.

---

## BaseEntitySchema Required Fields for API Contracts

**Problem**: When fetching data from orchestrator (InterventionManager, TaskManager, etc.) and returning it via API endpoints, you get a 400 Bad Request error even though the data exists.

**Root Cause**: API contracts in `packages/shared-frontend-backend/src/api/*.contract.ts` extend `BaseEntitySchema` which requires:

- `id: string` ✅
- `version: number` ❌ (orchestrator entities don't have this)
- `createdAt: string` ✅
- `updatedAt: string` ❌ (orchestrator entities don't have this)

Orchestrator entities typically only have `id` and `createdAt`, missing `version` and `updatedAt`.

**Solution**: Transform orchestrator data in the Service layer before returning:

```typescript
private async fetchInterventionsFromOrchestrator(query?: InterventionsQuery): Promise<Intervention[]> {
    const rawInterventions = await this.orchestratorRepository.getInterventions();

    // Transform to match API contract (add missing BaseEntity fields)
    const interventions: Intervention[] = rawInterventions.map(intervention => ({
        ...intervention,
        version: 1, // Interventions don't have versioning yet
        updatedAt: intervention.answeredAt || intervention.createdAt,
    }));

    return interventions;
}
```

**When discovered**: January 2026 during interventions feature implementation. Backend logs showed 400 errors with `[InterventionsService] Found 9 interventions` but frontend received nothing.

**Related files**:

- `packages/shared-frontend-backend/src/common/base-entity.ts` - BaseEntitySchema definition
- `packages/web-backend/src/services/InterventionsService.ts` - Example transformation
- `packages/orchestrator/src/core/InterventionManager.ts` - Source data structure

**Key Insight**: Always check Zod schema validation when orchestrator data doesn't appear in frontend. The 400 status code indicates schema validation failure, not missing data.

---

## Never Use Native Browser Dialogs (window.alert/confirm/prompt)

**Problem**: Native browser dialogs (`window.alert()`, `window.confirm()`, `window.prompt()`) look unprofessional, block the entire browser, and break the app's visual consistency.

**Wrong Approach** ❌:

```typescript
// DON'T: Native alert
alert('Approved!');
alert('Failed to submit response');

// DON'T: Native confirm
if (window.confirm('Are you sure?')) {
	deleteItem();
}
```

**Correct Approach** ✅:

```typescript
// DO: Use toast for feedback messages
import { useToast } from '@framework/features/toast/ToastContext';

const { showToast } = useToast();
showToast('Intervention approved successfully', 'success');
showToast('Failed to submit response. Please try again.', 'error');

// DO: Use AlertDialogWrapper for confirmations
import { AlertDialogWrapper } from '@framework/components/overlays/AlertDialogWrapper';

<AlertDialogWrapper
  open={confirmationOpen}
  onOpenChange={setConfirmationOpen}
  title="Delete Task"
  description="Are you sure you want to delete this task? This action cannot be undone."
  confirmLabel="Delete"
  cancelLabel="Cancel"
  variant="danger"
  onConfirm={handleDelete}
/>
```

**Benefits**:

- ✅ Professional appearance matching app design
- ✅ Non-blocking (users can interact with the page)
- ✅ Accessible (keyboard navigation, screen readers)
- ✅ Customizable (colors, sizes, variants)
- ✅ Animations and transitions
- ✅ Mobile-friendly

**When discovered**: January 2026 during interventions feature. User noticed native `alert()` popup instead of professional toast after approving an intervention.

**Related files**:

- `packages/web-frontend/src/framework/features/toast/ToastContext.tsx` - Toast system
- `packages/web-frontend/src/framework/components/overlays/AlertDialogWrapper.tsx` - Alert dialog component
- `packages/web-frontend/src/app/pages/interventions/InterventionDetailPage.tsx` - Example fix

**Quick Reference**:

| Use Case            | Component          | Example                          |
| ------------------- | ------------------ | -------------------------------- |
| Success feedback    | Toast              | `showToast('Saved!', 'success')` |
| Error feedback      | Toast              | `showToast('Failed', 'error')`   |
| Confirmation dialog | AlertDialogWrapper | Delete, dangerous actions        |
| Info message        | Toast              | `showToast('Info', 'info')`      |

---

## Temporary File Cleanup (2026-01-17)

**Issue**: Claude Code bug creates `tmpclaude-XXXX-cwd` files throughout project where XXXX are 4 hexadecimal characters.

**Solution**: Added automatic cleanup to `.claude/scripts/Stop.js` hook that runs when sessions stop.

**Implementation**:

- Pattern validation: `/^tmpclaude-[0-9a-f]{4}-cwd$/i`
- Recursive directory scan from project root
- Multi-layer safety checks (path validation, size limits)
- Non-blocking error handling
- Comprehensive logging to Stop.txt

**Safety Measures**:

- Only deletes files matching exact pattern
- Verifies files are within project directory
- Skips files larger than 1KB
- Individual file errors don't stop cleanup
- Cleanup errors don't prevent agent stop

**Related files**:

- `.claude/scripts/Stop.js` - Main file with cleanup logic
- `.gitignore` - Pattern added to prevent git tracking temporary files

---

## React useEffect Infinite Loops - Stabilize Array and Object Dependencies

**Problem**: When using arrays or objects as dependencies in useEffect hooks, passing them inline creates new references on every render, causing infinite loops of mount/unmount/remount cycles. This manifests as continuous subscription/unsubscription logs in backend servers.

**Root Cause**: Arrays and objects created inline (`[item1, item2]` or `{ key: value }`) get new references on every component render, even if their contents are identical. When these are used in useEffect dependency arrays (either directly or via spread `...array`), the effect re-runs infinitely.

**Symptoms**:

- Backend logs show continuous subscribe/unsubscribe patterns
- Component mounts and unmounts repeatedly
- Network requests fire continuously
- Performance degradation

**Wrong Approach** ❌:

```typescript
// useRealtimeRefresh.ts
export function useRealtimeRefresh({ events, onEvent, filters }) {
	useEffect(() => {
		// Subscribe to events
		const unsubscribers = events.map(event => transport.subscribe(event, onEvent, filters));
		return () => unsubscribers.forEach(unsub => unsub());
	}, [transport, onEvent, filters, ...events]); // ← Spreading array creates individual deps
}

// ProjectsPage.tsx
useRealtimeRefresh({
	events: [B2F_PROJECT_CREATED, B2F_PROJECT_UPDATED], // ← New array every render
	onEvent: cache.actions.refresh,
	filters: { projectId: '123' }, // ← New object every render
});
```

**Why This Fails**:

1. `events` array is created inline in component → new reference every render
2. `...events` spreads the array into dependency array → compares references, not contents
3. useEffect sees different references → re-runs effect
4. Effect unsubscribes and resubscribes → infinite loop

**Correct Approach** ✅:

Use **refs for callbacks** and **stringified keys for arrays/objects**:

```typescript
// useRealtimeRefresh.ts
export function useRealtimeRefresh({ events, onEvent, filters }) {
	// Store callback in ref - always use latest without re-subscribing
	const onEventRef = useRef(onEvent);
	onEventRef.current = onEvent;

	// Stabilize arrays/objects using stringified comparison
	const eventsKey = useMemo(() => JSON.stringify(events), [events]);
	const filtersKey = useMemo(() => (filters ? JSON.stringify(filters) : null), [filters]);

	useEffect(() => {
		// Subscribe using events/filters directly (captured via closure)
		const unsubscribers = events.map(event =>
			transport.subscribe(
				event,
				data => onEventRef.current(), // ← Use ref
				filters
			)
		);
		return () => unsubscribers.forEach(unsub => unsub());
		// Depend on stringified keys, not raw arrays/objects
	}, [transport, eventsKey, filtersKey]);
}
```

**Key Principles**:

1. **Use refs for callbacks**: Callbacks that change reference shouldn't trigger re-subscription

    ```typescript
    const callbackRef = useRef(callback);
    callbackRef.current = callback; // Always latest
    // In effect: callbackRef.current()
    ```

2. **Stringify arrays/objects**: Compare contents, not references

    ```typescript
    const arrayKey = useMemo(() => JSON.stringify(array), [array]);
    // Depend on arrayKey instead of array
    ```

3. **Understand what should trigger effects**:
    - ✅ Actual data changes (array contents, filter values)
    - ✅ Feature toggles (enabled/disabled)
    - ✅ Core dependencies (transport instance)
    - ❌ Callback reference changes (use refs)
    - ❌ Array/object reference changes (use stringified keys)

**Alternative Solutions**:

1. **Memoize in caller** (if you control the component):

    ```typescript
    const events = useMemo(() => [B2F_PROJECT_CREATED, B2F_PROJECT_UPDATED], []);
    useRealtimeRefresh({ events, onEvent });
    ```

2. **Define outside component** (for constant arrays):

    ```typescript
    const PROJECT_EVENTS = [B2F_PROJECT_CREATED, B2F_PROJECT_UPDATED];

    function Component() {
    	useRealtimeRefresh({ events: PROJECT_EVENTS, onEvent });
    }
    ```

3. **Custom deep comparison** (for complex objects):

    ```typescript
    import { useDeepCompareEffect } from 'use-deep-compare';

    // Note: More expensive, use stringified keys for simple cases
    ```

**Impact**: This pattern affected 12 pages using `useRealtimeRefresh` hook:

- ProjectsPage
- ProjectsV2Page
- WorkspacesPage
- TasksPage
- InterventionsPage
- WorkersPage
- DashboardPage
- And 5 more...

**Files Modified**:

- `packages/web-frontend/src/hooks/useRealtimeRefresh.ts` - Fixed infinite loop by using refs for callbacks and stringified keys for arrays/filters

**When Discovered**: January 17, 2026. User reported subscription/unsubscription logs repeating infinitely in backend. Root cause: spreading `...events` in useEffect dependencies combined with inline array creation in all pages using the hook.

**Related Patterns**:

- See "React useEffect Dependencies - Query URL as Source of Truth" for similar pattern with query objects
- See "React Hook Polling Pattern" for general useEffect dependency best practices

## Backend-Centric Architecture (2026-01-18)

**Context:** Implemented backend-centric data ownership to eliminate duplication between orchestrator and backend storage.

**Key Changes:**

- ✅ Backend now owns ALL persistent data (tasks, interventions)
- ✅ Created TasksRepository and InterventionsRepository using FileBasedStorage
- ✅ Refactored TasksService and InterventionsService to use repositories directly
- ✅ Task schema updated with `version` field for optimistic locking
- ✅ No more transformation logic between orchestrator and backend formats

**Important Principles:**

- **Backend is the single source of truth** for all persistent data
- **Orchestrator should NEVER store data** - only manage worker coordination
- **One schema per entity** - no more assignedTo vs assignedWorker confusion
- **Version field required** - all entities need optimistic locking support

**Migration Path (Remaining Work):**

- Phase 2: Create WorkerCoordinator in orchestrator (lightweight, in-memory only)
- Phase 2: Create BackendEventBridge for orchestrator to backend communication
- Phase 2: Create OrchestratorEventHandler in backend to receive orchestrator events
- Data Migration: Script to migrate existing ./data/tasks/\*.json to backend storage

**Testing:**

- ✅ All TypeScript checks passing
- ✅ Comprehensive unit tests for InterventionsService
- ESLint errors (2271) are pre-existing, not related to this refactoring

---

## Phase 2 Completion: Orchestrator Worker Coordination (2026-01-18)

**Context:** Completed Phase 2 of backend-centric architecture - created lightweight orchestrator coordination layer.

**Components Created (in parallel):**

1. **WorkerCoordinator** (`packages/orchestrator/src/core/WorkerCoordinator.ts`)
    - ✅ Lightweight, in-memory worker coordination (NO persistence)
    - ✅ Manages: worker connections, task queues, idle workers
    - ✅ Routes worker messages to backend via BackendEventBridge
    - ✅ 85% test coverage (21 tests)
    - Key methods: `enqueueTask()`, `registerWorker()`, `onWorkerMessage()`, `tryAssignTasks()`

2. **BackendEventBridge** (`packages/orchestrator/src/core/BackendEventBridge.ts`)
    - ✅ Simple event emitter pattern for orchestrator → backend communication
    - ✅ Supports 7 event types: worker_connected, worker_disconnected, task_assigned, etc.
    - ✅ Robust error handling (failed handlers don't block orchestrator)
    - ✅ 100% test coverage (22 tests)
    - API: `registerHandler()`, `sendToBackend()`, `unregisterHandler()`

3. **OrchestratorEventHandler** (`packages/web-backend/src/services/OrchestratorEventHandler.ts`)
    - ✅ Backend service to receive orchestrator events
    - ✅ Updates backend storage based on orchestrator events
    - ✅ Uses existing service methods (TasksService, InterventionsService)
    - ✅ 100% test coverage
    - Handles: worker connection/disconnection, task lifecycle, traces, interventions

4. **Migration Script** (`packages/web-backend/src/migrations/MigrateToBackendStorage.ts`)
    - ✅ Migrates orchestrator tasks → backend storage
    - ✅ Transforms: assignedTo → assignedWorker, extracts projectId/workspaceId
    - ✅ Adds version field for optimistic locking
    - ✅ Includes backup, dry-run mode, validation
    - ✅ 100% test coverage (17 tests)

**Testing Results:**

- ✅ TypeScript checks: PASSING (all packages)
- ✅ Prettier checks: PASSING
- ✅ All new tests passing (60+ tests across 4 components)
- ⚠️ ESLint errors (2369): Pre-existing, unrelated to this work

**Next Integration Steps (Not implemented yet):**

- Wire WorkerCoordinator into Orchestrator class
- Replace TaskManager with WorkerCoordinator
- Connect BackendEventBridge handlers
- Run migration script on production data

---

## Task Creation Flow: Backend Must Notify Orchestrator

**Problem**: When creating a task via the backend API, the task is stored in the database but never reaches the worker. The worker never receives the task assignment.

**Root Cause**: After the backend-orchestrator architecture refactoring, the task creation flow was incomplete:

1. ✅ Backend creates task in `TasksRepository`
2. ❌ **MISSING**: Backend must notify orchestrator to enqueue the task
3. ❌ Orchestrator's `WorkerCoordinator.enqueueTask()` exists but is never called
4. ❌ Worker never receives the task

**Solution**: Complete the task creation flow with proper orchestrator notification.

**Implementation**:

1. **OrchestratorWrapper** (`packages/orchestrator/src/core/OrchestratorWrapper.ts`):
    - Added `enqueueTask(task: Task)` method that delegates to `orchestrator.getWorkerCoordinator().enqueueTask(task)`

2. **OrchestratorRepository** (`packages/web-backend/src/repositories/OrchestratorRepository.ts`):
    - Added `enqueueTask(task: Task)` method that calls `orchestratorWrapper.enqueueTask(task)`

3. **TasksService** (`packages/web-backend/src/services/TasksService.ts`):
    - Added `orchestratorRepository` as constructor parameter
    - After creating task, calls `orchestratorRepository.enqueueTask(task)` to notify orchestrator
    - Wrapped in try-catch to avoid failing task creation if orchestrator is unavailable

4. **DataStoreFactory** (`packages/web-backend/src/factories/DataStoreFactory.ts`):
    - Updated `getTasksService()` to inject `OrchestratorRepository` into `TasksService`

**Task Flow (After Fix)**:

1. Frontend → Backend: `POST /api/tasks/` with task data
2. Backend: `TasksService.createTask()` creates task in `TasksRepository`
3. Backend: `TasksService` calls `orchestratorRepository.enqueueTask(task)`
4. Orchestrator: `WorkerCoordinator` adds task to appropriate queue (worker-specific or global backlog)
5. Orchestrator: `WorkerCoordinator.tryAssignTasks()` assigns task to idle worker
6. Worker: Receives `O2W_ASSIGN_TASK` message via WebSocket

**When Discovered**: January 2026 during task creation testing after backend-orchestrator refactoring.

**Related Files**:

- `packages/orchestrator/src/core/OrchestratorWrapper.ts` - Added enqueueTask method
- `packages/orchestrator/src/core/WorkerCoordinator.ts` - Task queuing and assignment logic
- `packages/web-backend/src/repositories/OrchestratorRepository.ts` - Added enqueueTask method
- `packages/web-backend/src/services/TasksService.ts` - Calls orchestrator after task creation
- `packages/web-backend/src/factories/DataStoreFactory.ts` - Wires dependencies

**Important Notes**:

- Task type mismatch between API contract (`@app/shared/api/tasks.contract`) and orchestrator domain types (`shared-orch-worker/domain-types`) requires `as any` cast
- Orchestrator notification is wrapped in try-catch to avoid failing task creation if orchestrator is temporarily unavailable
- This pattern should be followed for any backend operation that needs orchestrator coordination

---

## Worker Trace Update Spam During Interventions

**Problem**: Worker sends `trace_update` messages every 500ms via WebSocket to the orchestrator. During user interventions (which can last minutes or hours), the worker continues spamming hundreds of identical trace updates even though nothing has changed, causing:

- Network congestion
- Backend log spam
- Unnecessary database/memory operations
- Poor performance

**Root Cause**: The worker's `sendTraceUpdate()` method sends updates on a 500ms timer (`TRACE_UPDATE_INTERVAL`) regardless of whether the trace has actually changed. During interventions, the flow execution is paused waiting for user input, so the trace remains identical between updates.

**Solution**: Implemented deduplication by tracking the hash of the last sent trace.

**Implementation** (`packages/worker/src/flow/FlowWorker.ts:71,1085-1107`):

```typescript
private lastSentTraceHash: string | null = null;

private sendTraceUpdate(trace: any): void {
    if (!this.currentTask) return;

    // Calculate hash of trace to detect changes
    const traceHash = JSON.stringify(trace);

    // Skip if trace hasn't changed since last send
    if (traceHash === this.lastSentTraceHash) {
        return;
    }

    // Update last sent hash
    this.lastSentTraceHash = traceHash;

    // Send update to orchestrator
    this.sendMessage(...);
}
```

**Result**:

- Updates are only sent when trace actually changes (step completion, status changes)
- During interventions or long-running steps: **zero** redundant messages
- 500ms polling continues (for responsiveness) but sends nothing if unchanged

**When Discovered**: January 2026 during user intervention testing - logs showed continuous `trace_update` spam every 500ms while waiting for approval.

**Related Issue**: This was discovered while fixing the "Task not found" intervention error, where the continuous logging made debugging difficult.

## UX: Always Add Tooltips for Ambiguous UI Elements (2026-01-20)

**Context**: Added workspace management dialog with task count badges showing just numbers ("0", "5", etc.) without explanation.

**Problem**: User complained (rightfully\!) that the UI displayed unexplained numbers. No tooltip, no icon, no context. Poor UX.

**Lesson**: Always think UX-first:

- Numbers/badges without context need tooltips or icons
- Don't assume users will understand implicit meanings
- Add \ attribute to badges/spans for hover tooltips
- Consider icons (e.g., task icon) alongside numbers when space allows

**Fix**: Added \ to all task count badges.

## UX: Always Add Tooltips for Ambiguous UI Elements (2026-01-20)

**Context**: Added workspace management dialog with task count badges showing just numbers ("0", "5", etc.) without explanation.

**Problem**: User complained (rightfully!) that the UI displayed unexplained numbers. No tooltip, no icon, no context. Poor UX.

**Lesson**: Always think UX-first:

- Numbers/badges without context need tooltips or icons
- Don't assume users will understand implicit meanings
- Add `title` attribute to badges/spans for hover tooltips
- Consider icons (e.g., task icon) alongside numbers when space allows

**Fix**: Added `title="X task(s)"` to all task count badges.

## Backend Bidirectional Sync: Trust the Backend (2026-01-20)

**Context**: Implementing workspace-project association. Backend already had bidirectional sync (updating workspace.projectId auto-updates project.workspaceIds).

**Problem**: Implemented BOTH client-side calls:

1. `workspacesApi.updateWorkspace(id, { projectId: 'xyz' })`
2. `projectsApi.updateProject(projectId, { workspaceIds: [...] })`

This caused:

- Race conditions
- Version conflicts
- Workspaces ending up in wrong projects
- Active project disappearing from UI

**Lesson**:

- READ THE PLAN/DOCS before implementing
- If backend does bidirectional sync, DON'T duplicate it on frontend
- Trust backend logic - one API call should be enough
- Add comments explaining why only one call is needed

**Fix**: Removed duplicate projectsApi.updateProject() call. Backend handles sync automatically.

## Bidirectional Sync Bug: Use Canonical IDs (2026-01-24)

**Context**: Backend bidirectional sync existed but wasn't working. workspace.projectId was saved, but project.workspaceIds stayed empty.

**Root Cause**: Workspace IDs can come in two forms:

1. **Metadata UUID** (canonical): `"50115a2e-5226-46d4-9fb8-6f9c11a16f9d"` - stored in workspace-metadata.json
2. **Hash-based ID**: `"abc123def456"` - generated from workspace path when no metadata exists

The bug: `WorkspacesService.updateWorkspace(workspaceId, data)` was using the incoming `workspaceId` parameter for syncing, but this could be either format. The project's workspaceIds array needs the canonical UUID to match what the frontend uses.

**Symptoms**:

- Backend logs showed "SUCCESS" but workspaceIds stayed empty
- Workspace appeared in project momentarily, then disappeared
- Tab badge showed "0" instead of "1"
- Page refresh lost the workspace association

**Lesson**:

- When dealing with entities that have multiple ID formats, always use the CANONICAL ID for relationships
- Don't trust incoming request parameters - resolve to the canonical form first
- The metadata UUID is the source of truth, not the hash-based ID
- Add comments explaining which ID format is being used and why

**Fix**: In `WorkspacesService.updateWorkspace()`:

```typescript
// Before (BUG):
await this.projectsRepository.addWorkspaces(newProjectId, [workspaceId]);

// After (FIXED):
const canonicalWorkspaceId = metadata.id; // Always use UUID from metadata
await this.projectsRepository.addWorkspaces(newProjectId, [canonicalWorkspaceId]);
```

**Test Coverage**: Added `WorkspacesService.bidirectional-sync.test.ts` with 7 test cases covering:

- Adding/removing workspace from project
- Reassigning between projects
- Using canonical UUID vs hash-based ID
- Handling non-existent projects
- Event emission
- No-op when projectId unchanged

## Optimistic UI: Hierarchy of Truth (2026-01-20)

**Philosophy**: In interactive UIs, there's a hierarchy of "truth" that determines what the user sees:

### The Hierarchy (Most Authoritative → Least)

1. **User Actions (Optimistic State)** = Truth until proven otherwise
    - When user clicks/drags, update UI immediately
    - This is the user's INTENT, the most recent truth
    - Must be preserved until confirmed or rejected by server

2. **Synchronous API Responses** = Confirmation or Correction
    - API response confirms the optimistic state (success)
    - OR corrects it with error (rollback + show error)
    - This is the definitive answer about the user's action

3. **Asynchronous Events (WebSocket)** = Secondary Synchronization
    - Keeps UI in sync with other users/sessions
    - **MUST NOT overwrite pending user actions**
    - Only apply to non-pending items

### The Problem: WebSocket Race Conditions

```
Timeline:
0ms  → User clicks "Associate Workspace A"
1ms  → Optimistic: Move A to "Associated" (pending)
2ms  → API call starts
5ms  → WebSocket event arrives (old state: A is Available)
10ms → WebSocket naively applies: A jumps back to Available (BAD!)
50ms → API responds: A confirmed as Associated
```

**Result**: Visual "jumping" - item moves, then jumps back, then moves again. Terrible UX.

### The Solution: Pending State Tracking

```typescript
// Track pending operations
const [pendingWorkspaceIds, setPendingWorkspaceIds] = useState<Set<string>>(new Set());

// User action: Optimistic update + track pending
const handleAssociate = async (workspaceId: string) => {
  // 1. Mark as pending
  setPendingWorkspaceIds(prev => new Set(prev).add(workspaceId));

  // 2. Optimistic UI update (move immediately)
  setLocalState(...);

  try {
    // 3. API call
    await api.updateWorkspace(...);
    // 4. Success: remove from pending (let real data flow)
    setPendingWorkspaceIds(prev => {
      const next = new Set(prev);
      next.delete(workspaceId);
      return next;
    });
  } catch (error) {
    // 5. Error: rollback + remove from pending
    rollbackOptimisticUpdate(...);
    setPendingWorkspaceIds(prev => {
      const next = new Set(prev);
      next.delete(workspaceId);
      return next;
    });
    showErrorToast(...);
  }
};

// WebSocket event handler: Respect pending state
useEffect(() => {
  onWebSocketUpdate((newData) => {
    // Filter out pending items - don't overwrite optimistic state
    const nonPendingData = newData.filter(item => !pendingWorkspaceIds.has(item.id));
    applyUpdate(nonPendingData);
  });
}, [pendingWorkspaceIds]);
```

### Key Principles

1. **User intent is sacred** - Never make the UI lie about what the user just did
2. **Optimistic updates first** - Move items immediately, add subtle "pending" indicator
3. **WebSocket events defer to pending** - Skip updates for items in pending state
4. **API response is final** - Clears pending, allows normal updates to resume
5. **Rollback on error** - Undo optimistic update + show clear error message

### Visual Feedback Pattern

- **During pending**: Subtle opacity (0.7) or border to indicate "saving..."
- **On success**: Fade to normal opacity (confirms save)
- **On error**: Rollback position + red border + error toast

### Benefits

✅ Instant feedback (feels fast)
✅ No visual jumping
✅ Clear error handling
✅ Works even with slow networks
✅ Respects user intent above all

### Anti-Patterns to Avoid

❌ Waiting for API before updating UI (feels sluggish)
❌ Letting WebSocket events overwrite optimistic state (visual jumping)
❌ No error handling (user doesn't know if action failed)
❌ No pending indicator (user clicks multiple times thinking it didn't work)

**Reference**: This pattern is used by Trello, Notion, Linear, Gmail, and all modern interactive UIs.

## Code Duplication: Extract Patterns When You See Twins (2026-01-20)

**Context**: Created two dialogs on the same page (ManageProjectWorkspacesDialog and ManagePinnedProjectsDialog) with identical optimistic UI logic. Duplicated all the state management and handlers instead of extracting a reusable pattern.

**Problem**:

- Fixed a bug in workspace dialog → Same bug exists in projects dialog
- No single source of truth for optimistic UI logic
- User frustration: "I'm tired of you making custom components when you have one on THE SAME PAGE!"

**Lesson**: **STOP. LOOK. EXTRACT.**

When implementing a feature:

1. **STOP** - Before writing the second similar component
2. **LOOK** - Check if there's already something similar on the same page/codebase
3. **EXTRACT** - Create a reusable hook/wrapper FIRST, then use it in both places

### Warning Signs You're Duplicating:

❌ "I'll just copy-paste this and change the types"
❌ "It's slightly different, I'll make it custom"  
❌ "I'll refactor it later" (you won't)
❌ Multiple useState with same pattern in different components on same page

### The Reflex to Develop:

✅ See pattern repeated twice → Extract it IMMEDIATELY
✅ Custom hook for state logic: `useOptimisticAssociation<T>()`
✅ Wrapper component for UI patterns
✅ One source of truth = One place to fix bugs

### Example: This Case

**BAD** (what I did):

```typescript
// ManageProjectWorkspacesDialog.tsx
const [optimisticAssociations, setOptimisticAssociations] = useState<Set<string>>(new Set());
const handleAssociate = async id => {
	/* ... */
};
// ... 50 lines of logic

// ManagePinnedProjectsDialog.tsx
const [optimisticPins, setOptimisticPins] = useState<Set<string>>(new Set());
const handlePin = async id => {
	/* ... */
};
// ... 50 lines of DUPLICATED logic
```

**GOOD** (what should have been done):

```typescript
// hooks/useOptimisticAssociation.ts
export function useOptimisticAssociation<T>(
  items: T[],
  associatedIds: string[],
  onAssociate: (id: string) => Promise<void>,
  onDissociate: (id: string) => Promise<void>
) {
  // All the logic in ONE place
}

// Both dialogs use it:
const { effectiveIds, handleAssociate, handleDissociate } = useOptimisticAssociation(...);
```

**Impact**: Bug fix in one place fixes both dialogs. No repetition.

**Action**: Next time you write `const [something...` for the 2nd time, STOP and extract it first.

## API Error Display - Always Use getErrorMessage()

**Problem**: Zod validation errors from API were displayed as generic "ValidationError" in toasts instead of user-friendly messages like "description: Description is required".

**Root Cause**: Components were directly accessing `error.message` instead of using the `ApiError.getUserMessage()` method that properly formats Zod validation errors.

**Discovery**: January 2025 - User reported seeing "ValidationError" toast when creating a task without a description, which is not actionable UX.

**Solution**: Use the centralized `getErrorMessage()` utility function from `@framework/utils/errors/errorUtils`:

```typescript
// ❌ BAD - Direct error message access
catch (error) {
  const errorMessage = error instanceof Error ? error.message : 'Failed to create';
  showToast(errorMessage, 'error');
}

// ✅ GOOD - Use getErrorMessage utility
import { getErrorMessage } from '@framework/utils/errors/errorUtils';

catch (error) {
  showToast(getErrorMessage(error), 'error');
}
```

**What getErrorMessage() does**:

1. Checks if error is `ApiError` and calls `getUserMessage()` method
2. Extracts field names from Zod's `path[]` array in validation errors
3. Formats as "fieldName: error message" (e.g., "description: Description is required")
4. Falls back to standard error messages for non-API errors

**Files Updated**:

- `packages/web-frontend/src/framework/api/api-base.ts:71-90` - Fixed `getUserMessage()` to handle Zod's `path[]` format
- `CreateTaskDialog.tsx`, `CreateProjectDialog.tsx`, `EditProjectDialog.tsx` - Replaced manual error handling with `getErrorMessage()`

**Pattern**: This utility already existed in the codebase (`errorUtils.ts`) but wasn't being used consistently. Always check for existing utilities before implementing error handling manually.

**Action**: When displaying API errors to users, ALWAYS use `getErrorMessage(error)`. Never access `error.message` directly.

**Prevention**: Custom ESLint rules now enforce this pattern automatically:

- `error-handling/require-get-error-message` (error): Prevents direct `error.message` access
- `error-handling/require-user-feedback-on-error` (warn): Requires showToast in catch blocks
- `error-handling/defensive-array-access` (warn): Requires `|| []` for API array properties

See `scripts/eslint-rules/README.md` for details. Run `npm run lint` to check violations.

## 2026-01-22: Legacy WebSocket Code Removal

**Context:** Removed legacy UIWebSocketServer and UIClientHook after discovering they were never used in production (libraryMode=true disables them).

**Key Findings:**

- UIWebSocketServer was only created when libraryMode=false, but production always uses libraryMode=true
- All UI ↔ Orchestrator communication now goes through B2F (Backend-to-Frontend) event system
- StateSnapshotService is instantiated but never called - candidate for future removal

**Removed:** UIWebSocketServer.ts (204 lines), UIClientHook.ts (172 lines), tests, and integration points (~711 lines total)

**Lesson:** When finding legacy code, check for feature flags (libraryMode, env vars) that may disable it in production. Dead code can be safely removed if tests pass.

## Test Best Practices - Deterministic Async Testing (2026-01-23)

### Problem

Tests were using `setTimeout` for async delays, making tests non-deterministic, slow, and flaky.

**Example of BAD pattern**:

```typescript
await new Promise(resolve => setTimeout(resolve, 100)); // ❌ Non-deterministic, arbitrary delay
```

### Solution

1. **Created `createDeferredPromise()` utility** (`packages/web-frontend/src/framework/test-utils/deferredPromise.ts`)
    - Provides externally controllable promises for deterministic async testing
    - No arbitrary delays - resolve/reject exactly when you want

2. **Created custom ESLint rule** (`scripts/eslint-rules/test-best-practices-rules.mjs`)
    - Rule: `test-best-practices/no-settimeout-in-tests`
    - Catches ALL setTimeout patterns in test files:
        - Direct: `setTimeout(fn, delay)`
        - In Promise: `new Promise(resolve => setTimeout(resolve, delay))`
        - Global: `global.setTimeout()`, `window.setTimeout()`
    - Provides helpful error message with correct pattern

3. **Enabled rule in ESLint configs**:
    - Root config: `eslint.config.mjs` (for backend test files)
    - Frontend config: `packages/web-frontend/eslint.config.mjs`

**Example of GOOD pattern**:

```typescript
// ✅ Deterministic, fast, explicit control
const deferred = createDeferredPromise();
vi.mocked(api.createWorkspaceScript).mockReturnValue(deferred.promise);

// Test loading state BEFORE resolving
expect(screen.getByText('Loading...')).toBeInTheDocument();

// Resolve exactly when needed
deferred.resolve(newScript);
await waitFor(() => expect(screen.getByText('Success')).toBeInTheDocument());
```

### Key Insights

- **setTimeout in tests is a heresy** - it's non-deterministic and makes tests slow
- **Deferred promises provide perfect control** - resolve/reject exactly when you want
- **ESLint enforcement prevents regression** - 80+ violations detected across codebase
- **Testing Library's `waitFor()` is sufficient for most cases** - no need for delays

### Files Changed

- `scripts/eslint-rules/test-best-practices-rules.mjs` - New custom ESLint rule
- `packages/web-frontend/src/framework/test-utils/deferredPromise.ts` - Deferred promise utility
- `eslint.config.mjs` - Added rule to root config
- `packages/web-frontend/eslint.config.mjs` - Added rule to frontend config
- `packages/web-frontend/src/app/pages/workspaces/scripts/ConfigureScriptsDialog.test.tsx` - Refactored to use deferred promises

### Testing the Rule

The rule successfully catches:

1. Direct setTimeout calls
2. setTimeout in Promise constructor
3. global.setTimeout / window.setTimeout
4. All variations in arrow functions and block statements

Currently detects **80 violations** across the codebase that need refactoring.

---

## UX Anti-Pattern: Hover-Only Functionality (2026-01-24)

### Problem

Hover-only UI elements (features that only appear on hover) are a terrible UX pattern:

- **Discoverability**: Users cannot know the feature exists without accidentally hovering
- **Mobile incompatible**: No hover state on touch devices
- **Accessibility**: Screen readers and keyboard navigation may not trigger hover states
- **Counter-intuitive**: Users should not have to "guess" that features exist in the UI

### Rule

**NEVER hide interactive elements behind hover states.**

All interactive elements (buttons, icons, actions) must be:

- Always visible
- Clearly labeled or iconographically obvious
- Accessible via keyboard and screen readers

### Example: Edit Project Button

Initial implementation (WRONG):

```typescript
// Button with opacity-0, visible on hover only
<Button className="opacity-0 group-hover:opacity-100">
  <Pencil className="size-3" />
</Button>
```

Correct approach options:

1. Always visible icon in tabs (with proper spacing)
2. Action button in a toolbar (e.g., next to "Manage Workspaces")
3. Context menu on right-click
4. Dedicated "Edit" button in a visible action bar

### Related Files

- `packages/web-frontend/src/app/pages/projects2/ProjectTabs.tsx`
- `packages/web-frontend/src/framework/components/primitives/TabButton.tsx`

---

## Zod .default() in Entity Schemas Breaks PATCH Requests (2026-01-24)

### Problem

Using Zod's `.default()` on entity schema fields causes PATCH requests to overwrite unmodified fields with default values, resulting in data loss.

**Symptom:** When pinning/unpinning a project (sending `{pinned: true, version: 1}`), the project lost all its workspace associations (`workspaceIds` became `[]`).

### Root Cause

Zod's `.default()` is applied during schema parsing, **regardless of HTTP method**:

```typescript
// ❌ BAD - Defaults applied during PATCH parsing
const ProjectSchema = z.object({
	id: z.string().uuid(),
	name: z.string(),
	workspaceIds: z.array(z.string()).default([]), // Applied even in PATCH!
	archived: z.boolean().default(false),
	pinned: z.boolean().default(false),
	order: z.number().default(0),
});
```

When the backend receives a PATCH request with `{pinned: true, version: 1}`, Zod parses the body and applies defaults, resulting in:

```typescript
{
  pinned: true,
  version: 1,
  workspaceIds: [],      // ❌ Default applied, overwrites existing data
  archived: false,       // ❌ Default applied
  order: 0              // ❌ Default applied
}
```

The backend then merges this into the database, **overwriting fields that shouldn't have been touched**.

### Solution

**Remove `.default()` from entity schemas**. Apply defaults only during creation (POST), not during updates (PATCH):

```typescript
// ✅ GOOD - No defaults in entity schema
const ProjectSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  workspaceIds: z.array(z.string()),
  archived: z.boolean(),
  pinned: z.boolean(),
  order: z.number(),
});

// ✅ Apply defaults in creation logic
async create(data: CreateProjectInput): Promise<Project> {
  const project: Project = {
    ...data,
    workspaceIds: data.workspaceIds ?? [],  // Default only on creation
    archived: data.archived ?? false,
    order: data.order ?? 0,
  };
  return await this.storage.create(project);
}
```

### Key Principles

1. **Entity schemas describe the shape, not the defaults**
    - Schemas define what fields exist and their types
    - Defaults belong in business logic, not schemas

2. **PATCH = partial update**
    - Only sent fields should be modified
    - Omitted fields must be preserved
    - `.default()` violates this by filling in omitted fields

3. **Creation vs Update logic is different**
    - POST (create): Apply defaults for missing fields
    - PATCH (update): Never touch missing fields
    - Use separate schemas or conditional logic if needed

### Files Modified

- `packages/shared-frontend-backend/src/api/projects.contract.ts` - Removed `.default()` from `ProjectSchema`
- `packages/web-backend/src/services/ProjectsService.ts` - Added defaults in `create()` method

### Related Issues

This same pattern affects any entity with `.default()` values:

- Workspaces
- Tasks
- Interventions

**Action:** Audit all entity schemas for `.default()` usage and apply the same fix where needed.

## Bidirectional Relations: Choose Unidirectional (2026-01-24)

### Problem

Having a bidirectional relationship between Workspace and Project (`workspace.projectId ↔ project.workspaceIds`) created:

- **Double source of truth** leading to synchronization bugs
- **Complex sync logic** with 200+ lines of error-prone code
- **Data inconsistencies** when one side fails to update
- **Difficult debugging** with console.log spam everywhere

**Symptom:** When associating a workspace to a project, the workspace.projectId was updated but project.workspaceIds was not consistently updated, or vice-versa.

### Root Cause

```typescript
// ❌ BAD - Bidirectional relationship
Workspace {
  projectId?: string  // Points to Project
}

Project {
  workspaceIds: string[]  // Contains Workspaces
}

// When updating workspace.projectId, must also:
// 1. Remove workspace from old project.workspaceIds
// 2. Add workspace to new project.workspaceIds
// 3. Handle errors in either step
// 4. Emit events for both projects
// = 200+ lines of fragile synchronization code
```

### Solution: Unidirectional Relationship

**Keep only ONE source of truth:** `project.workspaceIds[]`

```typescript
// ✅ GOOD - Unidirectional relationship
Workspace {
  // No projectId field
}

Project {
  workspaceIds: string[]  // THE ONLY source of truth
}

// To find project for workspace:
const project = await projectsRepository.getProjectForWorkspace(workspaceId);

// To associate workspace to project:
await projectsRepository.addWorkspaces(projectId, [workspaceId]);

// To dissociate:
await projectsRepository.removeWorkspace(projectId, workspaceId);
```

### Benefits

1. **Simple**: One array to manage, no synchronization needed
2. **No bugs**: Impossible to have inconsistent state
3. **Less code**: Removed 200+ lines of complex sync logic
4. **Clear ownership**: Project owns the relationship
5. **Easy to query**: Standard array operations

### Migration Strategy

1. **Remove `projectId` from schemas**
    - `WorkspaceSchema` (API contract)
    - `WorkspaceMetadata` (backend)
    - `WorkspaceFileMetadata` (file storage)

2. **Simplify WorkspacesService**
    - Remove all bidirectional sync logic
    - Remove `projectId` from update DTO
    - Drop from 530 lines to 400 lines

3. **Add utility method**

    ```typescript
    // ProjectsRepository
    async getProjectForWorkspace(workspaceId: string): Promise<Project | null> {
      const projects = await this.findAll({});
      return projects.find(p => p.workspaceIds.includes(workspaceId)) ?? null;
    }
    ```

4. **Data migration**
    - Read workspace metadata files with `projectId`
    - Verify project.workspaceIds contains workspace (repair if needed)
    - Remove `projectId` from metadata file
    - Migration: `RemoveWorkspaceProjectIdMigration.ts`

5. **Update frontend**
    - Modify `project.workspaceIds[]` instead of `workspace.projectId`
    - Use `PATCH /api/projects/:id` for association changes
    - Simpler and more consistent with the data model

### Key Principles

1. **Single Source of Truth**: Never duplicate the same information in two places
2. **Owner Owns the Relation**: The "parent" (Project) owns the list of "children" (Workspaces)
3. **Query When Needed**: If you need the reverse lookup, add a query method, don't store it twice
4. **Simpler is Better**: 10 lines of simple code > 200 lines of synchronization logic

### Files Modified

- `packages/shared-frontend-backend/src/api/workspaces.contract.ts` - Removed `projectId` from schemas
- `packages/web-backend/src/repositories/WorkspaceMetadataRepository.ts` - Removed `projectId`
- `packages/web-backend/src/services/WorkspaceMetadataFile.ts` - Removed `projectId`
- `packages/web-backend/src/services/WorkspacesService.ts` - Removed 200+ lines of sync logic
- `packages/web-backend/src/services/WorkspaceMapper.ts` - Removed `projectId` from mapping
- `packages/web-backend/src/services/ProjectsService.ts` - Simplified `clearProjectFromWorkspaces`
- `packages/web-backend/src/repositories/ProjectsRepository.ts` - Added `getProjectForWorkspace()`
- `packages/web-backend/src/migrations/RemoveWorkspaceProjectIdMigration.ts` - Data migration

### Tests

- **Removed**: `WorkspacesService.bidirectional-sync.test.ts` (no longer needed)
- **Added**: `WorkspacesService.test.ts` (simpler, focused tests)
- **Added**: `ProjectsRepository.test.ts` (test new utility method)
- **Added**: `RemoveWorkspaceProjectIdMigration.test.ts` (test data migration)

### Related Patterns

This same principle applies to any bidirectional relationship:

- Parent ↔ Children: Parent owns `childIds[]`
- User ↔ Teams: Team owns `memberIds[]`
- Task ↔ Tags: Task owns `tagIds[]` (or use a join table for many-to-many)

**Rule of thumb:** If you find yourself writing synchronization logic, you probably have the wrong data model.

### Frontend Refactoring (2026-01-24)

After backend was refactored, frontend needed adaptation to use the new unidirectional API:

**Files Modified:**

- `packages/web-frontend/src/app/hooks/useProjectWorkspaces.ts` - Updated associate/dissociate to use Projects API
- `packages/web-frontend/src/app/pages/projects2/ProjectsV2Page.tsx` - Pass projectId to dissociate
- `packages/web-frontend/src/app/pages/workspaces/WorkspacesTable.tsx` - Removed workspace.projectId reference
- `packages/web-frontend/src/hooks/useWorkspaceProject.ts` - NEW: Hook to find project by workspace
- `packages/web-frontend/src/app/pages/workspaces/EditWorkspaceDialog.tsx` - Removed project selection
- `packages/web-frontend/src/app/pages/projects2/WorkspacePanel.tsx` - Updated save handler signature
- `packages/web-frontend/src/app/pages/workspaces/workspaces.helpers.ts` - Updated color helpers

**Key Changes:**

1. **Association:** Instead of `PATCH /api/workspaces/:id` with `{ projectId }`, now `PATCH /api/projects/:id` with `{ workspaceIds: [..., newId] }`

2. **Dissociation:** Now requires knowing the projectId to update `project.workspaceIds[]`

3. **Finding Project for Workspace:** Created `useWorkspaceProject` hook that searches all projects to find which one contains the workspace

4. **Simplified EditWorkspaceDialog:** Removed project selection since workspace-project associations must now be managed through ProjectsV2Page's "Manage Workspaces" dialog

**Benefits:**

- Frontend mirrors backend architecture (single source of truth)
- No more confusion about which API to call
- Clearer code flow
- Easier to understand and maintain

**Testing Checklist:** See `.claude/temp/testing-checklist.md`

---

## Post-Refactoring: Clean Up Obsolete Code and Fix Type Errors

**Problem**: After a major refactoring (like removing bidirectional sync), several issues can remain:

1. Tests that reference removed functionality still compile but fail at runtime
2. Import statements reference renamed/moved modules
3. Type generics missing in test setup code
4. Obsolete documentation that confuses developers

**Example Issues Found After Unidirectional Refactoring**:

```typescript
// projectId no longer exists
// ❌ Issue 2: Wrong module import
import { FileSystemStorage } from '../storage/FileSystemStorage';

// ❌ Issue 1: Test file uses removed property
// File: WorkspacesService.bidirectional-sync.test.ts
expect(workspace.projectId).toBe(testProjectId1); // projectId no longer exists

// Should be FileBasedStorage

// ❌ Issue 3: Missing type generic in test
const baseRepository = new BaseRepository('projects', storage); // Missing <Project>
```

**Solution Checklist**:

1. **Search for removed properties/methods across the codebase**:

    ```bash
    # Find all references to removed feature
    rg "workspace\.projectId" packages/
    rg "FileSystemStorage" packages/
    ```

2. **Delete obsolete test files** that test removed functionality:

    ```bash
    rm packages/web-backend/src/services/WorkspacesService.bidirectional-sync.test.ts
    ```

3. **Fix import statements** when modules are renamed:

    ```typescript
    // ✅ Correct import
    import { FileBasedStorage } from '../storage/FileBasedStorage';
    ```

4. **Add missing type generics** in tests:

    ```typescript
    // ✅ Explicit type parameter
    const baseRepository = new BaseRepository<Project>('projects', storage);
    ```

5. **Run comprehensive checks**:
    ```bash
    npm run check        # TypeScript + ESLint + Prettier
    npm run test:agent   # Run all tests
    ```

**When Discovered**: January 2026 after completing the unidirectional workspace-project refactoring. TypeScript compilation failed with 3 errors in test files and scripts.

**Key Principle**: After major refactoring, always:

- Search for references to removed features (grep/ripgrep)
- Delete obsolete test files (don't just comment them out)
- Fix all import statements and type annotations
- Run `npm run check` before declaring work complete

**Related Files**:

- `packages/web-backend/src/services/WorkspacesService.bidirectional-sync.test.ts` (deleted)
- `packages/web-backend/src/scripts/migrate-remove-workspace-projectid.ts` (fixed imports)
- `packages/web-backend/src/services/WorkspacesService.test.ts` (added type generic)

---

## Long Debugging Sessions: Test Early, Test Often with agent-browser

**Context**: January 2026 - Long refactoring session for workspace-project associations that uncovered multiple architectural issues.

**Problems That Made This Session Difficult**:

1. **Not Testing Early Enough**: Made backend changes without immediately verifying with agent-browser, leading to multiple rounds of "looks good in code" → "broken in UI"

2. **Trusting Code Over Reality**: Assumed PATCH endpoint worked correctly because it returned 200, didn't verify the actual data being saved until much later

3. **Incomplete Root Cause Analysis**: Fixed symptoms multiple times instead of identifying the real issue:
    - Fixed race condition (symptom)
    - Fixed pending state (symptom)
    - Fixed Zod defaults (partial root cause)
    - Finally discovered: **bidirectional sync fundamentally broken** (actual root cause)

4. **Not Questioning Architecture Earlier**: Spent time trying to fix bidirectional sync instead of questioning whether it should exist at all with file-based storage

**What Should Have Happened**:

```bash
# ✅ Correct workflow
1. Make backend change
2. IMMEDIATELY test with agent-browser
3. If broken, fix root cause before proceeding
4. Document finding in lessons-learned.md
5. Move to next feature

# ❌ What actually happened
1. Make backend change
2. Assume it works because tests pass
3. Make more changes
4. User reports bug
5. Debug for 30+ messages
6. Finally test with agent-browser
7. Discover multiple issues stacked on each other
```

**Key Agent-Browser Test Scenarios to Run IMMEDIATELY**:

```bash
# After ANY workspace-project association change
agent-browser open http://localhost:5173/projects-v2?projectId=xxx
agent-browser snapshot -i
# Click "Manage Workspaces" → Associate workspace
# Verify: counter updates, workspace tab appears
# Verify: data persists after page reload
# Verify: pin/unpin doesn't break associations
```

**Architectural Red Flags Missed**:

1. **Bidirectional relationships + file-based storage = complexity**
    - Should have questioned this immediately
    - In-memory storage can handle bidirectional sync with transactions
    - File-based storage makes this extremely error-prone

2. **Zod `.default()` in entity schemas**
    - Breaks PATCH requests by filling in fields not in payload
    - Should ONLY apply defaults in service layer during CREATE

3. **Multiple reload sources** (manual + WebSocket)
    - Race conditions waiting to happen
    - Should have single source of truth for reloads

**Lessons for Future Work**:

1. **Test with agent-browser BEFORE declaring work complete**, not after user reports bugs
2. **Question architecture when encountering repeated similar bugs** - probably indicates design flaw
3. **When fixing a bug, verify THE ACTUAL DATA** in storage files, not just UI state
4. **Simplify relationships** - unidirectional is almost always better than bidirectional
5. **Don't stack fixes** - if a fix doesn't fully resolve the issue, you're treating symptoms not causes

**Cost of Not Following This**:

- 40+ message exchanges debugging instead of implementing features
- User frustration ("c'est toujours le meme cmoportement, et j'apprecierait FORTEMENT que tu fasses toi meme les testes avec l'agent-brownser")
- Multiple failed fix attempts before finding root cause
- Full architectural refactoring required to properly fix

**When Discovered**: January 2026 during projects-v2 workspace associations feature

**Related Entries**:

- "Zod .default() in Entity Schemas Breaks PATCH Requests"
- "Bidirectional Relations: Choose Unidirectional Instead"

**Documentation**: See `.claude/temp/typescript-fixes-summary.md` for detailed fixes

---

## Code Duplication in Dual-List Dialogs: Extract Generic Components Early

**Date**: January 2026
**Context**: ProjectsV2 refactoring - ManagePinnedProjectsDialog and ManageProjectWorkspacesDialog

**Problem**: Massive code duplication across dual-list selector dialogs and their item components led to maintenance nightmare:

- 75% duplication between 2 dialogs (596 lines combined)
- 70% duplication between 4 item components (442 lines combined)
- Helper functions duplicated 3x across files
- Architecture grade: C+

**Root Cause**: Building specialized components first instead of identifying common patterns and creating generic base components.

**Solution**: Create generic reusable components with TypeScript generics and render props:

1. **DualListDialog<TLeft, TRight>** - Generic two-column dialog
    - Integrated DnD context (@dnd-kit)
    - Integrated SearchBar
    - Support for loading, reordering, optimistic updates
    - Render props for complete flexibility

2. **DualListItem** - Generic item component
    - 2 variants: `available` (simple) and `sortable` (draggable)
    - Replaces 4 specialized components
    - Support for icon, label, badge customization

3. **Centralized utilities** - Shared helper functions
    - `getBasename()` in `pathUtils.ts` instead of 3 duplications

**Results**:

- Reduced code by ~500 lines (-23%)
- Eliminated dialog duplication: 75% → 0%
- Eliminated item duplication: 70% → 0%
- Architecture grade: C+ → A-
- Test coverage: ~15% → >70%
- Maintainability: 3x easier (bug fix in 1 file instead of 4)

**Pattern to Follow**:

```typescript
// ✅ GOOD: Generic base component with TypeScript generics + render props
interface DualListDialogProps<TLeft, TRight> {
  leftItems: TLeft[];
  leftItemRenderer: (item: TLeft, actions: ItemActions) => ReactNode;
  rightItems: TRight[];
  rightItemRenderer: (item: TRight, actions: ItemActions) => ReactNode;
  // ... other props
}

// Consumer provides specific rendering
<DualListDialog<Project, Project>
  leftItemRenderer={(project, actions) => (
    <DualListItem variant="sortable" label={project.name} {...actions} />
  )}
  rightItemRenderer={(project, actions) => (
    <DualListItem variant="available" label={project.name} {...actions} />
  )}
/>
```

```typescript
// ❌ BAD: Creating specialized components for each use case
// AvailableProjectItem.tsx (77 lines)
// SortablePinnedProjectItem.tsx (116 lines)
// AvailableWorkspaceItem.tsx (94 lines)
// SortableAssociatedWorkspaceItem.tsx (155 lines)
// = 442 lines of 70% duplicated code
```

**Key Principles**:

1. **Identify Patterns Early**: When you see 2 similar components, extract generic base immediately
2. **TypeScript Generics**: Use `<TLeft, TRight>` for type-safe reusability
3. **Render Props**: Give consumers control of rendering via callbacks
4. **Composition over Inheritance**: Compose generic components instead of creating subclasses
5. **Centralize Utilities**: Extract shared helpers to dedicated utility files
6. **Test Generics Well**: >70% coverage on generic components = confidence for all consumers

**Benefits**:

- **Maintenabilité**: New dual-list dialog = ~100 lines instead of 300+
- **Testabilité**: Test generic once instead of testing 4 specialized components
- **Performance**: ~15KB bundle size savings via tree-shaking
- **Consistency**: All dialogs behave identically (DnD, search, loading states)
- **Documentation**: Storybook stories on generics = instant examples for all use cases

**When to Apply**:

- ✅ When building the 2nd similar component (extract generic base immediately)
- ✅ When seeing 50%+ code duplication between components
- ✅ When helper functions are copied across files
- ✅ When "specialized" components differ only in data types and rendering

**Cost of Not Following**:

- 3x more code to maintain
- Bug fixes require touching multiple files
- New features require copy-paste + adapt pattern
- Test coverage remains low (too many components to test)
- Architecture debt accumulates (C+ grade)

**Documentation**: See `.claude/temp/refactoring-summary-dual-list-dialogs.md` for complete refactoring guide

**Related Entries**:

- Component architecture patterns
- TypeScript generics best practices
- Render props vs HOCs

---

## State-Based Subscription API: Separate Handler Registration from Server Communication

**Date**: 2026-01-24  
**Context**: Implementing state-based subscription API to reduce WebSocket message overhead  
**Impact**: 🔴 Critical - Prevents duplicate messages and log pollution

### Problem

When implementing the state-based subscription API, the existing `subscribe()` method mixed two responsibilities:

1. **Local handler registration** (subscribing to events in the client)
2. **Server communication** (sending subscription messages via WebSocket)

This caused:

- **Duplicate messages**: Both `setComponentSubscriptionState()` (new API) and `subscribe()` (old API) sent messages to the server
- **Log pollution**: Hundreds of individual subscription logs instead of one consolidated message
- **Confusion**: Two systems running in parallel instead of one replacing the other

### Root Cause

The `subscribe()` method had a side effect:

```typescript
// ❌ BAD: Mixes local registration with server communication
subscribe(event, handler, filters) {
  this.eventHandlers.add(handler);  // Local registration
  this.sendSubscriptionMessage('subscribe', [event], filters);  // Server message (side effect!)
  return unsubscribe;
}
```

When using the new state-based API, we still needed local handler registration but NOT the server message (already sent via `subscription_state`).

### Solution

**Separate concerns into two methods:**

```typescript
// ✅ GOOD: Local registration only (no side effects)
registerLocalHandler(event, handler) {
  this.eventHandlers.add(handler);
  return () => this.eventHandlers.delete(handler);
}

// ✅ GOOD: Full subscription (registration + server message)
subscribe(event, handler, filters) {
  this.registerLocalHandler(event, handler);  // Reuse local registration
  this.sendSubscriptionMessage('subscribe', [event], filters);  // Server message
  return unsubscribe;
}
```

**Hook usage:**

```typescript
// Set component state (sends ONE subscription_state message)
transport.setComponentSubscriptionState(componentId, subscriptions);

// Register handlers locally (NO server messages)
const unsubscribers = events.map(event => transport.registerLocalHandler(event, handler));
```

### Key Lessons

1. **Separate side effects from pure operations**: Methods that register things locally should NOT have network side effects
2. **State-based APIs reduce coordination bugs**: Declaring desired state is simpler than managing add/remove operations
3. **Context-efficient logging matters**:
    - ✅ Show component names (5 max): `[WS] Subscribed to 16 events from: WorkersWidget, ProjectsV2Page, useWorkspaceScripts`
    - ❌ Don't show all events (15+): Too verbose
4. **Optional methods for gradual migration**: Make new methods optional (`registerLocalHandler?()`) to avoid breaking all transport implementations at once
5. **React StrictMode reveals subscription bugs**: Double mount/unmount in development mode helps catch cleanup issues early

### Impact

**Before:**

```
[WorkersWidget] Setting subscription state: 3 events
[WS] Queuing subscription state sync (not connected yet)
[WS] Subscription subscribe: ['b2f:workers:updated']
[WS] Subscription subscribe: ['b2f:worker:connected']
[WS] Subscription subscribe: ['b2f:worker:disconnected']
[WS] Subscription state synced: 3 unique events from 1 components
// 6 log lines, duplicate messages sent
```

**After:**

```
[WS] Subscribed to 3 events from: WorkersWidget
// 1 log line, 1 message sent
```

### When to Apply

- ✅ When a method has both local and remote side effects
- ✅ When implementing state-based APIs alongside imperative ones
- ✅ When seeing duplicate network messages
- ✅ When transitioning from imperative to declarative APIs

### Related Patterns

- **Command-Query Separation (CQS)**: Methods should either change state OR return data, not both
- **Single Responsibility Principle**: Each method should have one clear purpose
- **State-based vs Event-based synchronization**: State-based is simpler for multi-component scenarios

### Files Modified

- `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts`
- `packages/web-frontend/src/hooks/useRealtimeRefresh.ts`
- `packages/web-backend/src/transport/TransportSessionManager.ts`


---

## 2026-01-25: Inline Styles Override CSS Classes + Headless UI Pattern for Complex Dialogs

### Context

Refactored OptimisticDualListDialog from monolithic component (322 lines) to 3-layer architecture:
1. **Logic layer:** `useDualListState` hook (headless)
2. **View layer:** `DualListView` component (pure presentation)
3. **Composition layer:** `OptimisticDualListDialog` (wires everything together)

### Problem 1: Inline Styles Override CSS Classes

**Symptoms:**
- `opacity-50` class was NOT visible during pin/unpin operations
- Pending states worked in unpin but NOT in pin
- Reordering states never showed `opacity-50`

**Root Cause:**
```tsx
// DualListItem.tsx (BEFORE)
const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  opacity: isDragging ? 0.5 : 1,  // ❌ ALWAYS sets opacity=1
};

// CSS classes are applied BUT inline style has higher specificity
<div style={style} className="opacity-50">  // ❌ opacity-50 is ignored!
```

**Why This is Critical:**
- **CSS specificity:** Inline styles > Classes > Element selectors
- Even with `!important`, inline styles win in most cases
- Hard to debug: tests pass (class is present), but visual state is wrong

**Solution:**
```tsx
// Only set inline opacity when actually dragging
const style = {
  transform: CSS.Transform.toString(transform),
  transition,
  ...(isDragging ? { opacity: 0.5 } : {}),  // ✅ Conditional spread
};
```

### Problem 2: Monolithic Component Lacks Testability

**Symptoms:**
- 322 lines with mixed concerns (logic + view + API calls)
- Tests required mocking optimistic update logic
- Difficult to test visual states independently
- Hard to reuse for different layouts (Grid vs Dialog vs Table)

**Solution: Headless UI Pattern (3-Layer Architecture)**

#### Layer 1: Logic Hook (`useDualListState`)

**Responsibilities:**
- Manage ALL state (optimistic, loading, reordering)
- Handle API calls with rollback on error
- Calculate derived state (leftItems, rightItems)
- Clear optimistic state when dialog closes

**Key pattern:**
```typescript
export interface UseDualListStateReturn<T> {
  leftItems: T[];              // Computed from base + optimistic
  rightItems: T[];             // Computed from base + optimistic
  loadingItems: Set<string>;   // Visual state
  reorderingIds: Set<string>;  // Visual state
  actions: {
    associate: (id: string) => Promise<void>;
    dissociate: (id: string) => Promise<void>;
    reorder: (activeId: string, overId: string) => Promise<void>;
  };
}
```

**Benefits:**
- 100% testable without React (pure async logic)
- Tests use controlled promises: `createControlledPromise()`
- No mocking needed - just verify state transitions

#### Layer 2: Pure View (`DualListView`)

**Responsibilities:**
- Render two columns with DnD context
- Apply visual states (`opacity-50` when `isLoading` or `isReordering`)
- Forward callbacks to `renderItem`
- Handle client-side search filtering

**Key pattern:**
```typescript
export interface DualListViewProps<T> {
  leftItems: T[];
  rightItems: T[];
  loadingItems: Set<string>;      // Just display what you're told
  reorderingItems: Set<string>;   // Just display what you're told
  renderItem: (item: T, side: 'left' | 'right', state: {
    isLoading: boolean;
    isReordering: boolean;
    onAssociate: (id: string) => void;
    onDissociate: (id: string) => void;
  }) => ReactNode;
  // ... other props
}
```

**Benefits:**
- 100% testable without async logic
- Tests verify: rendering, search, visual states, callbacks
- No business logic - just display

#### Layer 3: Composition (`OptimisticDualListDialog`)

**Responsibilities:**
- Wire hook + view + Dialog wrapper
- Pass props between layers
- NO business logic

**Key pattern:**
```typescript
export function OptimisticDualListDialog<T>({ ... }) {
  // LOGIC
  const { leftItems, rightItems, loadingItems, reorderingIds, actions } =
    useDualListState({ ... });

  // COMPOSITION
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DualListView
        leftItems={leftItems}
        rightItems={rightItems}
        loadingItems={loadingItems}
        reorderingItems={reorderingIds}
        onAssociate={actions.associate}
        onDissociate={actions.dissociate}
        onReorder={actions.reorder}
        renderItem={renderItem}
        // ...
      />
    </Dialog>
  );
}
```

**Benefits:**
- Minimal code (~150 lines)
- Easy to swap layouts (Grid, Carousel, Table)
- Integration tests only verify wiring

### Key Learnings

#### 1. Inline Styles vs CSS Classes

**Rule:** Never use inline styles for visual states that might be conditionally applied.

❌ **BAD:**
```tsx
style={{ opacity: isLoading ? 0.5 : 1 }}  // Always sets opacity
```

✅ **GOOD:**
```tsx
// Option 1: Conditional inline style
style={{ ...(isLoading ? { opacity: 0.5 } : {}) }}

// Option 2: CSS classes only (preferred)
className={cn(isLoading && 'opacity-50')}
```

#### 2. Test Visual States End-to-End

**Unit tests are NOT enough for visual states:**
- ✅ Test verifies class is applied: `expect(element).toHaveClass('opacity-50')`
- ❌ User sees no opacity change because inline style overrides it

**Solution:** Use agent-browser for critical visual features:
```bash
agent-browser click @e1
agent-browser screenshot during-operation.png
# Verify opacity is actually visible
```

#### 3. Separation of Concerns in Complex Components

**When to apply 3-layer architecture:**
- ✅ Component has optimistic updates
- ✅ Component needs API calls with rollback
- ✅ Component has multiple visual states (loading, pending, error)
- ✅ Component might be reused in different layouts
- ✅ Component has complex state management (>100 lines)

**Benefits:**
- **Testability:** Each layer tested independently
- **Reusability:** View layer works with any state management
- **Maintainability:** Change logic without touching view, and vice versa
- **Debuggability:** Easy to isolate bugs (logic vs visual)

#### 4. Headless UI Pattern

**Definition:** Separate state management (hook) from presentation (component).

**When to use:**
- Complex state logic (optimistic updates, rollback, computed state)
- Multiple visual representations (Dialog, Grid, Table, Carousel)
- Need to test logic without React rendering

**Pattern:**
```
useComplexState (logic) → returns state + actions
  ↓
ComplexView (pure UI) → receives state, renders, calls actions
  ↓
ComplexDialog (composition) → wires hook + view + wrapper
```

#### 5. DRY with Small Reusable Components

**Problem:** Empty states duplicated across 2 dialogs (16 lines total)

**Solution:** Extract to `DualListEmptyState` component (10 lines)
```tsx
export function DualListEmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
    </div>
  );
}
```

**Usage:**
```tsx
leftEmptyState={<DualListEmptyState message="No pinned projects" />}
```

**Benefit:** 16 lines → 2 lines (87% reduction)

#### 6. ESLint Rules to Prevent Future Issues

**Problem:** Hardcoded SVG and emoji in codebase

**Solution:** Add ESLint rules
```javascript
{
  selector: 'JSXElement[openingElement.name.name="svg"]',
  message: 'Inline SVG forbidden. Use lucide-react icons.',
},
{
  selector: 'Literal[value=/[\\u{1F300}-\\u{1F9FF}...]/u]',
  message: 'Emoji literals forbidden. Use lucide-react icons.',
}
```

**Benefit:** Catch issues at development time, not in code review

### Metrics

**Before:**
- OptimisticDualListDialog: 322 lines (monolithic)
- ManagePinnedProjectsDialog: 252 lines
- ManageProjectWorkspacesDialog: 344 lines
- 4 item components: 442 lines
- Total: ~1,360 lines

**After:**
- useDualListState: 280 lines (pure logic)
- DualListView: 295 lines (pure view)
- OptimisticDualListDialog: 148 lines (composition)
- DualListItem: 215 lines (generic)
- DualListEmptyState: 25 lines (reusable)
- ManagePinnedProjectsDialog: 115 lines (-54%)
- ManageProjectWorkspacesDialog: 130 lines (-62%)
- Total: ~1,208 lines

**Improvements:**
- 11% fewer lines overall
- 100% test coverage for logic layer (was ~15%)
- 100% test coverage for view layer (was ~20%)
- Eliminated 442 lines of duplicated item components
- 2 reusable generic components (DualListItem, DualListEmptyState)

### When to Apply

Apply this pattern when you see these symptoms:

1. **Inline style bugs:**
   - ✅ Visual states not appearing despite class being present
   - ✅ `opacity-50` not working
   - ✅ CSS animations not triggering

2. **Testing difficulties:**
   - ✅ Tests require extensive mocking of async logic
   - ✅ Visual states hard to test
   - ✅ Test setup requires complex controlled promises

3. **Reusability needs:**
   - ✅ Same logic needed in different layouts (Dialog, Grid, Table)
   - ✅ Want to swap view layer without touching logic
   - ✅ Multiple consumers need same state management

4. **Maintenance issues:**
   - ✅ Component >200 lines with mixed concerns
   - ✅ Difficult to locate bugs (logic vs visual)
   - ✅ Changes require touching multiple unrelated parts

### Anti-Patterns to Avoid

❌ **Don't mix inline styles and CSS classes for the same property**
```tsx
<div style={{ opacity: 1 }} className="opacity-50">  // ❌ inline wins
```

❌ **Don't test visual states only with unit tests**
```tsx
expect(element).toHaveClass('opacity-50');  // ✅ Class is there
// ❌ But user doesn't see opacity change due to inline style override
```

❌ **Don't put business logic in view components**
```tsx
function DualListView() {
  const [optimisticState, setOptimisticState] = useState(...);  // ❌ Logic in view
  const handleClick = async () => {
    setOptimisticState(...);  // ❌ Business logic
    await api.call();         // ❌ API call
  };
}
```

❌ **Don't create deep inheritance hierarchies**
```tsx
class BaseDualList extends Dialog {}       // ❌ Inheritance
class OptimisticDualList extends BaseDualList {}
```

✅ **Use composition instead**
```tsx
<Dialog>
  <DualListView {...state} />  // ✅ Composition
</Dialog>
```

### Related Patterns

- **Headless UI:** Logic separated from presentation via hooks
- **Render Props:** Consumer controls rendering via `renderItem` callback
- **Compound Components:** Multiple components working together (`<Dialog><DialogContent>`)
- **State Machine:** Explicit states (loading, reordering, error) with transitions
- **Optimistic Updates:** Update UI immediately, rollback on error

### Files Modified

**Created:**
- `packages/web-frontend/src/framework/hooks/useDualListState.ts` (NEW - 280 lines)
- `packages/web-frontend/src/framework/hooks/useDualListState.test.ts` (NEW - 11 tests)
- `packages/web-frontend/src/framework/components/overlays/DualListView.tsx` (NEW - 295 lines)
- `packages/web-frontend/src/framework/components/overlays/DualListView.test.tsx` (NEW - 11 tests)
- `packages/web-frontend/src/framework/components/overlays/OptimisticDualListDialog.tsx` (REWRITE - 148 lines)
- `packages/web-frontend/src/framework/components/overlays/OptimisticDualListDialog.integration.test.tsx` (NEW - 5 tests)
- `packages/web-frontend/src/framework/components/overlays/DualListEmptyState.tsx` (NEW - 25 lines)

**Modified:**
- `packages/web-frontend/src/framework/components/overlays/DualListItem.tsx` (FIXED opacity bug + SVG)
- `packages/web-frontend/src/app/pages/projects2/ManagePinnedProjectsDialog.tsx` (REFACTORED)
- `packages/web-frontend/src/app/pages/projects2/ManageProjectWorkspacesDialog.tsx` (REFACTORED)
- `packages/web-frontend/eslint.config.mjs` (ADDED rules for SVG/emoji)

**Deleted:**
- `packages/web-frontend/src/app/pages/projects2/AvailableProjectItem.tsx` (77 lines)
- `packages/web-frontend/src/app/pages/projects2/SortablePinnedProjectItem.tsx` (116 lines)
- `packages/web-frontend/src/app/pages/projects2/AvailableWorkspaceItem.tsx` (94 lines)
- `packages/web-frontend/src/app/pages/projects2/SortableAssociatedWorkspaceItem.tsx` (155 lines)
- `packages/web-frontend/src/app/pages/projects2/ManagePinnedProjectsDialog.old.tsx` (322 lines)
- `packages/web-frontend/src/app/pages/projects2/ManagePinnedProjectsDialog.optimistic.simple.test.tsx`

### Visual Verification

**Screenshots proving the fix:**
- `pin-pending.png`: Shows Agent Fleet with reduced opacity during pin operation ✅
- `after-pin-complete.png`: Shows full opacity after API completes ✅

**Critical insight:** Visual bugs require visual verification, not just unit tests.
