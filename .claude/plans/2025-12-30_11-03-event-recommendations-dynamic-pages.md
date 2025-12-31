# Event Recommendations for Dynamic Pages

## Context

Analysis of Workers v2, Tasks v2, Dashboard, and Workspaces v2 pages to identify events that should be subscribed to for real-time updates.

## IMPORTANT DISCOVERY 🎯

**Most events are ALREADY DEFINED but NOT IMPLEMENTED!**

The codebase has a comprehensive set of event constants in `packages/shared-frontend-backend/src/transport/B2FEventConstants.ts`, but:

- Most events are NOT emitted by the backend yet
- The frontend pages do NOT subscribe to most events yet
- Only `B2F_WORKER_UPDATED` is fully implemented (backend emit + frontend subscribe)

## Current State

### Existing Update Mechanisms

- **Workers v2**: Uses WebSocket with `B2F_WORKER_UPDATED` event ✅
    - Implementation: `packages/web-frontend/src/app/pages/workers2/WorkersPage2.tsx:79-101`
    - Backend: `packages/web-backend/src/services/WorkersService.ts:327`
- **Tasks v2**: Manual refresh only ❌
- **Dashboard**: Polling every 5 seconds ⚠️
- **Workspaces v2**: Manual refresh only ❌

### Available Infrastructure

- WebSocket implementation: `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts`
- SSE implementation: `packages/web-frontend/src/transport/adapters/SSETransportClient.ts`
- Transport manager with multiple fallback modes
- Event subscription system fully operational
- Event constants file: `packages/shared-frontend-backend/src/transport/B2FEventConstants.ts`
- Event broadcaster pattern: `eventBroadcaster.broadcastExcept(EVENT, data, connId)`

## Events Already Defined (in B2FEventConstants.ts)

### Task Events (ALL DEFINED ✅)

- `B2F_TASKS_UPDATED` - Aggregate update
- `B2F_TASK_CREATED` ✅
- `B2F_TASK_UPDATED` ✅
- `B2F_TASK_DELETED` ✅
- `B2F_TASK_STATUS_CHANGED` ✅
- `B2F_TASK_ASSIGNED` ✅
- `B2F_TASK_PRIORITY_CHANGED` ✅

### Worker Events (ALL DEFINED ✅)

- `B2F_WORKERS_UPDATED` - Aggregate update
- `B2F_WORKER_CREATED` ✅
- `B2F_WORKER_UPDATED` ✅ **← ONLY ONE IMPLEMENTED**
- `B2F_WORKER_DELETED` ✅
- `B2F_WORKER_STATUS_CHANGED` ✅
- `B2F_WORKER_HEARTBEAT` ✅
- `B2F_WORKER_CAPACITY_CHANGED` ✅
- `B2F_WORKER_CONNECTED` ✅
- `B2F_WORKER_DISCONNECTED` ✅
- `B2F_WORKER_STATUS` ✅

### Workspace Events (ALL DEFINED ✅)

- `B2F_WORKSPACE_CREATED` ✅
- `B2F_WORKSPACE_UPDATED` ✅
- `B2F_WORKSPACE_DELETED` ✅
- `B2F_WORKSPACE_STATUS_CHANGED` ✅
- `B2F_WORKSPACE_QUOTA_EXCEEDED` ✅
- `B2F_WORKSPACE_ARCHIVED` ✅

### Dashboard Events (DEFINED ✅)

- `B2F_DASHBOARD_UPDATED` ✅

## Events Missing from Constants (Need to Add)

Based on data model analysis, these additional events would be useful:

### Task Events

- `B2F_TASK_FLOW_STARTED` - Flow execution started
- `B2F_TASK_FLOW_COMPLETED` - Flow execution completed
- `B2F_TASK_COMMENT_ADDED` - New comment on task

### Dashboard Events (More Granular)

- `B2F_ORCHESTRATOR_STATUS_CHANGED` - Orchestrator state changes
- `B2F_ACTIVITY_ADDED` - New activity in recent activity feed

### Workspace Events (More Granular)

- `B2F_WORKSPACE_MODE_CHANGED` - Mode changes (development/production/staging)
- `B2F_WORKSPACE_GIT_UPDATED` - Git branch or status changed

## Recommended Implementation Plan by Page

### 1. Workers Page (Low Priority - Already Working ✅)

**Currently Implemented:**

- Frontend subscribes to: `B2F_WORKER_UPDATED` ✅
- Backend emits: `B2F_WORKER_UPDATED` ✅

**Optional Enhancements:**
Add subscriptions for:

- `B2F_WORKER_CONNECTED` - Show toast notification when new worker joins
- `B2F_WORKER_DISCONNECTED` - Show toast notification when worker leaves
- `B2F_WORKER_HEARTBEAT` - Update uptime/lastHeartbeat in real-time

### 2. Tasks Page (HIGH PRIORITY 🔥)

**Current State:** Manual refresh only ❌

**Recommended Events to Subscribe:**

- `B2F_TASK_CREATED` - Add new task to list
- `B2F_TASK_UPDATED` - Update task in list
- `B2F_TASK_DELETED` - Remove task from list
- `B2F_TASK_STATUS_CHANGED` - Update task status badge
- `B2F_TASK_ASSIGNED` - Update assigned worker
- `B2F_TASK_PRIORITY_CHANGED` - Update priority badge

**Backend Implementation Needed:**

- Emit events in TasksService (similar to WorkersService pattern)
- Use `eventBroadcaster.broadcastExcept(EVENT, data, connId)`

### 3. Dashboard (HIGH PRIORITY 🔥)

**Current State:** Polling every 5 seconds ⚠️

**Recommended Approach:**
Option A: Subscribe to aggregate event

- `B2F_DASHBOARD_UPDATED` - Replace polling with event subscription

Option B: Subscribe to granular events (more efficient)

- `B2F_WORKERS_UPDATED` - Update worker stats
- `B2F_TASKS_UPDATED` - Update task stats
- Combine worker/task events for real-time dashboard updates

**Benefits:**

- Eliminate 5-second polling → Save server resources
- Immediate updates → Better UX
- Lower network overhead

### 4. Workspaces Page (HIGH PRIORITY 🔥)

**Current State:** Manual refresh only ❌

**Recommended Events to Subscribe:**

- `B2F_WORKSPACE_CREATED` - Add new workspace to list
- `B2F_WORKSPACE_UPDATED` - Update workspace in list
- `B2F_WORKSPACE_DELETED` - Remove workspace from list
- `B2F_WORKSPACE_STATUS_CHANGED` - Update status badge (active/locked/cleaning/error)

**Backend Implementation Needed:**

- Emit events in WorkspacesService
- Use `eventBroadcaster.broadcastExcept(EVENT, data, connId)`

## Frontend Implementation Pattern (Proven Pattern from WorkersPage2)

```typescript
// 1. Import event constant and transport hook
import { B2F_TASK_UPDATED } from '@shared/transport';

import { useTransport } from '@/transport';

// 2. Get transport client
const { transport } = useTransport();

// 3. Subscribe to event in useEffect
useEffect(() => {
	console.log('[TasksPage2] Subscribing to B2F_TASK_UPDATED events');

	const unsubscribe = transport.subscribe(B2F_TASK_UPDATED, updatedTask => {
		console.log('[TasksPage2] Received task update event:', updatedTask.taskId);

		// Option A: Refresh entire cache (simple but less efficient)
		cache.actions.refresh();

		// Option B: Direct cache update (more efficient - TODO in Data2)
		// mutation.updateItem(updatedTask);
	});

	return () => {
		console.log('[TasksPage2] Unsubscribing from B2F_TASK_UPDATED events');
		unsubscribe();
	};
}, [transport, cache.actions]);
```

## Backend Implementation Pattern (Proven Pattern from WorkersService)

```typescript
// 1. Import event constant and broadcaster
import { B2F_TASK_UPDATED } from '@app/shared/transport';
import type { EventBroadcaster } from '../transport/EventBroadcaster';

// 2. Inject eventBroadcaster in constructor
constructor(
  private readonly eventBroadcaster: EventBroadcaster,
  // ... other dependencies
) {}

// 3. Emit event AFTER successful operation
async updateTask(taskId: string, data: UpdateTaskDto, connId?: string): Promise<Task> {
  // ... perform update operation ...

  const updatedTask = await this.tasksRepository.update(taskId, data);

  // Emit event (excludes origin client to prevent echo)
  console.log('[TasksService] Broadcasting B2F_TASK_UPDATED event');
  this.eventBroadcaster.broadcastExcept(B2F_TASK_UPDATED, updatedTask, connId);

  return updatedTask;
}
```

## Critical Files to Modify

### Frontend Files

**Tasks Page:**

- `packages/web-frontend/src/app/pages/tasks2/TasksPage2.tsx` - Add event subscriptions

**Dashboard Page:**

- `packages/web-frontend/src/app/pages/dashboard/DashboardPage.tsx` - Replace polling with events
- `packages/web-frontend/src/app/pages/dashboard/useDashboard.ts` - Remove pollInterval, add event subscriptions

**Workspaces Page:**

- `packages/web-frontend/src/app/pages/workspaces2/WorkspacesPage2.tsx` - Add event subscriptions

### Backend Files

**Tasks Service:**

- `packages/web-backend/src/services/TasksService.ts` - Emit task events

**Workspaces Service:**

- `packages/web-backend/src/services/WorkspacesService.ts` - Emit workspace events

**Dashboard Service:**

- Need to investigate if DashboardService exists or needs to be created

**Event Constants (if adding new events):**

- `packages/shared-frontend-backend/src/transport/B2FEventConstants.ts` - Add missing event constants

## Implementation Priority by Impact

### Phase 1: Highest Impact (Eliminate Polling)

1. **Dashboard** - Replace 5-second polling with `B2F_DASHBOARD_UPDATED` event
    - Frontend: Subscribe to event, remove polling
    - Backend: Emit event when stats change
    - Impact: Reduces server load, improves responsiveness

### Phase 2: Critical UX Improvements

2. **Tasks Page** - Add real-time task updates
    - Frontend: Subscribe to 6 task events
    - Backend: Emit events in TasksService
    - Impact: Users see task changes immediately

3. **Workspaces Page** - Add real-time workspace updates
    - Frontend: Subscribe to 4 workspace events
    - Backend: Emit events in WorkspacesService
    - Impact: Users see workspace changes immediately

### Phase 3: Enhanced Features

4. **Workers Page** - Add connection notifications
    - Frontend: Subscribe to CONNECTED/DISCONNECTED events
    - Backend: Emit events when workers join/leave
    - Impact: Better awareness of worker availability

## Summary Statistics

**Events Already Defined:** 26 events ✅
**Events Implemented:** 1 event (B2F_WORKER_UPDATED) ✅
**Implementation Gap:** 25 events waiting to be used 📊

**Pages Using Events:** 1/4 (Workers v2 only)
**Pages Using Polling:** 1/4 (Dashboard - should be eliminated)
**Pages Using Manual Refresh:** 2/4 (Tasks, Workspaces - should add events)

## Key Benefits of Implementing Events

### Performance

- **Eliminate polling**: Dashboard currently polls every 5 seconds → wasteful
- **Network efficiency**: Only send data when changes occur
- **Scalability**: Event-driven architecture scales better

### User Experience

- **Immediate updates**: No 5-second delay waiting for next poll
- **No manual refresh**: Users don't need to click refresh buttons
- **Real-time collaboration**: Multiple users see changes instantly

### Developer Experience

- **Infrastructure ready**: WebSocket/SSE/polling already implemented
- **Proven pattern**: WorkersPage2 shows it works well
- **Type-safe events**: All event constants are defined

## Technical Considerations

### Event Payload Strategy

Based on WorkersService implementation, use **full entity** in payload:

```typescript
this.eventBroadcaster.broadcastExcept(B2F_WORKER_UPDATED, updatedWorker, connId);
//                                                         ^^^^^^^^^^^^^ Full Worker object
```

**Advantages:**

- Frontend can update cache directly without additional API call
- Simpler to implement
- No need to merge deltas

**Trade-off:**

- Slightly larger payload, but negligible for typical entity sizes

### Origin Client Filtering

Use `broadcastExcept(event, data, connId)` pattern:

- Origin client (who made the change) updates optimistically
- Other clients receive the event
- Prevents echo/duplicate updates

### Event Granularity

Use **both aggregate and granular events**:

- Aggregate: `B2F_TASKS_UPDATED` - Dashboard subscribes to this
- Granular: `B2F_TASK_CREATED`, `B2F_TASK_UPDATED` - Task page subscribes to these

This allows each page to subscribe to appropriate level of detail.

## User Requirements ✅

1. **Scope**: Implement all pages (Tasks, Dashboard, Workspaces, Workers)
2. **Priority**: Dashboard first (eliminate polling)
3. **Dashboard Strategy**: Granular events (B2F_WORKERS_UPDATED + B2F_TASKS_UPDATED)
4. **CRITICAL**: Pattern must be simple and reusable ⭐

---

# SIMPLIFIED IMPLEMENTATION PLAN

## Key Insight: Reusable Pattern

Instead of complex bridges and multiple approaches, we use ONE simple pattern everywhere:

### The Pattern (Already Proven in WorkersPage2)

**Frontend (3 lines of code):**

```typescript
// 1. Import
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

// 2. Use hook (replaces all subscription boilerplate)
useRealtimeRefresh({
	events: [B2F_TASK_CREATED, B2F_TASK_UPDATED, B2F_TASK_DELETED],
	onEvent: cache.actions.refresh,
	enabled: true,
});
```

**Backend (1 line of code):**

```typescript
// Emit event after operation
this.eventBroadcaster.broadcast(B2F_TASK_CREATED, task);
```

That's it! Simple, réutilisable, facile à comprendre.

---

## Implementation Steps (Simplified)

### Step 0: Create Reusable Hook (NEW)

**File:** `packages/web-frontend/src/hooks/useRealtimeRefresh.ts` (NEW)

```typescript
/**
 * Reusable hook for subscribing to real-time events
 * Handles all boilerplate: subscribe, unsubscribe, logging
 *
 * @example
 * useRealtimeRefresh({
 *   events: [B2F_TASK_CREATED, B2F_TASK_UPDATED],
 *   onEvent: cache.actions.refresh,
 *   enabled: true,
 * });
 */
export function useRealtimeRefresh(options: {
	events: string[];
	onEvent: () => void;
	enabled?: boolean;
	logPrefix?: string;
}) {
	const { transport } = useTransport();
	const { events, onEvent, enabled = true, logPrefix = 'Page' } = options;

	useEffect(() => {
		if (!enabled) return;

		console.log(`[${logPrefix}] Subscribing to events:`, events);

		const unsubscribers = events.map(event =>
			transport.subscribe(event, data => {
				console.log(`[${logPrefix}] Received ${event}`, data);
				onEvent();
			})
		);

		return () => {
			console.log(`[${logPrefix}] Unsubscribing from events`);
			unsubscribers.forEach(unsub => unsub());
		};
	}, [transport, onEvent, enabled, logPrefix, ...events]);
}
```

### Step 1: Dashboard - Replace Polling

**File:** `packages/web-frontend/src/app/pages/dashboard/useDashboard.ts`

**Change:**

```typescript
// BEFORE (lines 199-236): Complex polling logic
useEffect(() => { /* 38 lines of polling code */ }, [...]);

// AFTER (3 lines):
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

useRealtimeRefresh({
  events: [B2F_TASKS_UPDATED, B2F_WORKERS_UPDATED],
  onEvent: refresh,
  enabled: enabled && useWebSocket,
  logPrefix: 'Dashboard',
});

// DELETE lines 199-236 entirely
```

### Step 2: Tasks Page - Add Real-Time

**File:** `packages/web-frontend/src/app/pages/tasks2/TasksPage2.tsx`

**Add (3 lines):**

```typescript
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

useRealtimeRefresh({
	events: [B2F_TASK_CREATED, B2F_TASK_UPDATED, B2F_TASK_DELETED],
	onEvent: cache.actions.refresh,
	logPrefix: 'TasksPage2',
});
```

### Step 3: Workspaces Page - Add Real-Time

**File:** `packages/web-frontend/src/app/pages/workspaces2/WorkspacesPage2.tsx`

**Add (3 lines):**

```typescript
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

useRealtimeRefresh({
	events: [B2F_WORKSPACE_CREATED, B2F_WORKSPACE_UPDATED, B2F_WORKSPACE_DELETED],
	onEvent: cache.actions.refresh,
	logPrefix: 'WorkspacesPage2',
});
```

### Step 4: Workers Page - Enhance

**File:** `packages/web-frontend/src/app/pages/workers2/WorkersPage2.tsx`

**Replace (lines 79-101) with (3 lines):**

```typescript
import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

useRealtimeRefresh({
	events: [B2F_WORKER_UPDATED, B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED],
	onEvent: cache.actions.refresh,
	logPrefix: 'WorkersPage2',
});
```

### Step 5: Backend - Where to Emit Events?

**Question:** Where does orchestrator state actually change?

Need to investigate:

1. Where are tasks created/updated/deleted?
2. Where do workers connect/disconnect?
3. Where to emit B2F events?

Two options:

- **Option A:** Emit in Services (TasksService, WorkersService, etc.)
- **Option B:** Create OrchestratorEventBridge to auto-emit on state changes

**Recommendation:** Start with Option A (simpler, more explicit)

---

## Benefits of This Simplified Approach

### 1. Reusability ✅

- ONE hook for all pages
- Copy-paste 3 lines, change event names
- No boilerplate code duplication

### 2. Easy to Understand ✅

- Crystal clear what events each page listens to
- No complex bridges or indirection
- Pattern is self-documenting

### 3. Easy to Maintain ✅

- Add new page? Copy 3 lines
- Change behavior? Update hook in one place
- Debug? All logging centralized

### 4. Backward Compatible ✅

- Keeps manual refresh buttons
- Graceful degradation if WebSocket fails
- No breaking changes

---

---

## Summary: Files to Modify

### Frontend Files (5 files)

1. **NEW:** `packages/web-frontend/src/hooks/useRealtimeRefresh.ts`
    - Reusable hook for all pages
    - ~40 lines of code
    - Handles subscribe/unsubscribe/logging

2. **MODIFY:** `packages/web-frontend/src/app/pages/dashboard/useDashboard.ts`
    - Remove polling logic (lines 199-236)
    - Add 3 lines: `useRealtimeRefresh({ events: [B2F_TASKS_UPDATED, B2F_WORKERS_UPDATED], ... })`
    - Net: -38 lines, +3 lines

3. **MODIFY:** `packages/web-frontend/src/app/pages/tasks2/TasksPage2.tsx`
    - Add 3 lines: `useRealtimeRefresh({ events: [B2F_TASK_CREATED, ...], ... })`

4. **MODIFY:** `packages/web-frontend/src/app/pages/workspaces2/WorkspacesPage2.tsx`
    - Add 3 lines: `useRealtimeRefresh({ events: [B2F_WORKSPACE_CREATED, ...], ... })`

5. **MODIFY:** `packages/web-frontend/src/app/pages/workers2/WorkersPage2.tsx`
    - Replace lines 79-101 (23 lines) with 3 lines using `useRealtimeRefresh`
    - Net: -23 lines, +3 lines

**Frontend Total:** ~60 lines removed, ~52 lines added (net -8 lines, mais beaucoup plus maintenable!)

### Backend Files (Investigation Needed)

Need to find where to emit these events:

- `B2F_TASKS_UPDATED` - When task list changes
- `B2F_WORKERS_UPDATED` - When worker list changes
- `B2F_TASK_CREATED/UPDATED/DELETED` - On specific task operations
- `B2F_WORKSPACE_CREATED/UPDATED/DELETED` - On specific workspace operations
- `B2F_WORKER_CONNECTED/DISCONNECTED` - On worker lifecycle events

**Two Implementation Approaches:**

#### Approach A: Manual Emission in Services (SIMPLER ✅)

- Emit events explicitly in TasksService, WorkersService, etc.
- Example: `this.eventBroadcaster.broadcast(B2F_TASK_CREATED, task)`
- **Pros:** Clear, explicit, easy to debug
- **Cons:** Need to remember to emit in each method

#### Approach B: Auto-Emission via OrchestratorEventBridge

- Listen to orchestrator's internal StateEvent events
- Auto-forward to B2F events
- **Pros:** Automatic, never forget to emit
- **Cons:** More complex, extra layer of indirection

**Recommendation:** Start with Approach A (simpler), can add Approach B later if needed.

---

## Implementation Order

### Phase 1: Frontend Foundation (1-2 hours)

1. Create `useRealtimeRefresh` hook
2. Test with existing WorkersPage2 (refactor to use new hook)
3. Verify pattern works

### Phase 2: Dashboard (1 hour)

1. Update `useDashboard.ts` to use hook
2. Remove polling logic
3. Test - verify no more polling, events work

### Phase 3: Tasks & Workspaces (1 hour)

1. Add hook to TasksPage2
2. Add hook to WorkspacesPage2
3. Test subscriptions registered

### Phase 4: Backend Investigation & Implementation (2-3 hours)

1. Find where tasks are created/updated in orchestrator
2. Find where workers connect/disconnect
3. Emit B2F events at appropriate places
4. Test end-to-end

**Total Estimated Time:** 5-7 hours

---

## Questions for User (Optional Investigation)

Before implementing backend, should I:

1. **Investigate orchestrator internals** to find exact emission points?
    - Where StateManager emits events
    - Where to hook in for auto-emission

2. **Or start with frontend first** and add backend emission later?
    - Frontend subscriptions work even if backend doesn't emit yet
    - Can test with manual event emission from DevTools

**Recommendation:** Start with frontend (proven pattern), then add backend emission incrementally.
