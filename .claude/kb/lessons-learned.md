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
