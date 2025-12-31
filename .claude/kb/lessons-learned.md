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
	--info: oklch(0.60 0.15 235); /* Blue */
	--info-foreground: oklch(0.985 0 0); /* White text */
	--danger: oklch(0.577 0.245 27.325); /* Red */
	--danger-foreground: oklch(0.985 0 0); /* White text */
	--special: oklch(0.65 0.18 310); /* Magenta */
	--special-foreground: oklch(0.985 0 0); /* White text */
}

.dark {
	/* ... existing colors ... */
	--success: oklch(0.70 0.15 145); /* Lighter green for dark mode */
	--success-foreground: oklch(0.141 0.005 285.823); /* Dark text */
	--warning: oklch(0.75 0.15 85); /* Lighter yellow */
	--warning-foreground: oklch(0.141 0.005 285.823);
	--info: oklch(0.70 0.15 235); /* Lighter blue */
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
<Toggle
	pressed={isEnabled}
	className={`gap-2 text-xs ${isEnabled ? '[&>span:last-child]:!text-success' : ''}`}
>
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
<span style={{ color: isEnabled ? 'var(--success)' : undefined }}>
	{isEnabled ? 'ON' : 'OFF'}
</span>
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
