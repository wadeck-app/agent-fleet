# Lessons Learned

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
const fetchData = useCallback(async (signal) => {
  if (isInitialLoad) setLoading(true);  // <- This dependency causes re-creation
  // ... fetch logic
}, [isInitialLoad]); // <- fetchData changes when isInitialLoad changes

useAbortableEffect(async signal => {
  await fetchData(signal);
  const intervalId = setInterval(() => fetchData(signal), 5000);
  signal.addEventListener('abort', () => clearInterval(intervalId));
}, [fetchData]); // <- Re-runs when fetchData changes, creating new interval
```

**Correct Solution** ✅:
```tsx
// Separate initial fetch from polling
const fetchData = useCallback(async (signal) => {
  if (isInitialLoad) setLoading(true);
  // ... fetch logic
}, [isInitialLoad]);

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

