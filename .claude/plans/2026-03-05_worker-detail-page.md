# Plan: Worker Detail Page

## Context

Users need to drill into a specific worker from the workers list. The detail page must show:
identity info (name, ID, state, connection), workspace association (1 workspace → M workers),
task history (filtered by workerId), registered flows, and key metrics.

Two layouts are implemented simultaneously so the user can test and choose:

- **Split**: fixed 300px info sidebar + tabbed main content (mirrors `TaskDetailSplitPage`)
- **Stacked**: compact header with metrics + full-width tabbed content (mirrors `TaskDetailStackedPage`)

A toggle button in the PageHeader lets the user switch between layouts.

Disconnected workers are shown as offline using persisted repository metadata (name, version).
A 404 is returned only when the worker has no metadata AND is not connected.

---

## Architecture: What changes where

```
1 project → N workspaces → M workers
Worker connects with: projectId + workspacePath (from WebSocketConnectionManager)
Worker metadata persisted in: WorkersRepository (workerId, name, version)
```

---

## Step 1 — Backend: Contract

**File:** `packages/shared-frontend-backend/src/api/workers.contract.ts`

1. Add `projectId?: string` and `workspacePath?: string` to `WorkerSchema`
2. Add `GET /api/workers/:workerId` route to `WORKERS_API_ROUTES` alongside existing PATCH:

```typescript
'/api/workers/:workerId': {
  GET: {
    params: z.object({ workerId: z.string() }),
    response: WorkerSchema,
  },
  PATCH: { /* existing */ },
}
```

---

## Step 2 — Backend: Service

**File:** `packages/web-backend/src/services/WorkersService.ts`

Add `getWorker(workerId: string): Promise<Worker>` method:

1. Query `orchestratorWrapper.getStats().workersList` → find runtime worker (taskId, state)
2. Query `wsServer.getConnectionManager().getConnectedWorkspaces()` → find `{ projectId, workspacePath }` for this worker
3. Query `workersRepository.findByWorkerId(workerId)` → find metadata (name, version)
4. Build response:
    - **Connected**: merge runtime + workspace + metadata → `connected: true`
    - **Disconnected** (not in orchestrator but has metadata): `connected: false`, no workspace/task data
    - **Unknown** (not in orchestrator AND no metadata): throw `NotFoundException`

Access pattern for WebSocketConnectionManager (already used in `getWorkerFlows`):

```typescript
const orchestrator = this.orchestratorWrapper.getOrchestrator();
const wsServer = orchestrator.getWsServer();
const connectedWorkspaces = wsServer.getConnectionManager().getConnectedWorkspaces();
const workerWorkspace = connectedWorkspaces.find(w => w.workerId === workerId);
```

---

## Step 3 — Backend: Controller

**File:** `packages/web-backend/src/controllers/WorkersController.ts`

Add route alongside existing PATCH:

```typescript
add('GET', '/api/workers/:workerId', async ({ params }) => {
	return this.service.getWorker(params.workerId);
});
```

---

## Step 4 — Frontend: API + Service

**File:** `packages/web-frontend/src/app/pages/workers/workers.api.ts`
Add:

```typescript
getWorker: (workerId: string): Promise<Worker> =>
  typedFetch('GET', '/api/workers/:workerId', { params: { workerId } }),
```

**File:** `packages/web-frontend/src/app/pages/workers/WorkersService.ts`
Add:

```typescript
async getWorker(workerId: string): Promise<Worker> {
  return workersApi.getWorker(workerId);
}
```

---

## Step 5 — Frontend: Hooks (new files)

All in `packages/web-frontend/src/app/pages/workers/hooks/`

### `useWorker.ts`

- Fetches `GET /api/workers/:workerId`
- Subscribes to realtime refresh on `B2F_WORKER_UPDATED`, `B2F_WORKER_CONNECTED`, `B2F_WORKER_DISCONNECTED` (filtered by workerId)
- Returns `{ worker, isLoading, isError, error, refetch }`

### `useWorkerTaskHistory.ts`

- Calls the existing tasks API (`/api/tasks/`) with `workerId` filter
- Uses `usePagination2` + `useSorting2` + `Data2` pattern (same as `WorkersPage`)
- Default sort: `createdAt desc`

### `useWorkerFlows.ts`

- Calls existing `workersApi.getWorkerFlows(workerId)` (already implemented)
- Returns `{ flows, isLoading, isError, refetch }`

---

## Step 6 — Frontend: Shared Components (new files)

All in `packages/web-frontend/src/app/pages/workers/components/`

### `WorkerInfoPanel.tsx`

Sections using `ContextRow` + `Badge` + `EditableText`:

- **Identity**: workerId (mono), name (EditableText, same logic as WorkersTable), state Badge, connection Badge
- **Workspace**: projectId, workspacePath — shown when connected; "Offline" when not
- **Current Task**: taskId (link → `/tasks/:id`), taskStartedAt formatted relative — shown only if busy
- **Version**: from metadata
- **Registered Flows**: list of flow names with isValid Badge (from `useWorkerFlows`)

Props: `worker: Worker` (rename callback reuses `workersService.renameWorker`)

### `WorkerMetricsGrid.tsx`

4 `MetricItem` in a `grid grid-cols-2 gap-4`:

- Tasks Completed (`tasksCompleted ?? "N/A"`)
- Success Rate (`successRate ? "${successRate}%" : "N/A"`)
- Uptime (`uptime ? formatDuration(uptime) : "N/A"`)
- Last Heartbeat (`lastHeartbeat ? formatRelative(lastHeartbeat) : "N/A"`)

### `WorkerTaskHistoryTable.tsx`

`Data2` + `Table2` with fixed `workerId` filter.
Columns: Task ID (link ↗), Status (Badge), Priority (Badge), Created At, Flow ID.
Realtime: `useRealtimeRefresh` on `B2F_TASK_UPDATED` filtered by workerId.

### `WorkerFlowsList.tsx`

List of `FlowMetadata`. Each row: flow name, version, isValid Badge (success/destructive), description.

---

## Step 7 — Frontend: Pages (new files)

### `WorkerDetailSplitPage.tsx`

```
packages/web-frontend/src/app/pages/workers/WorkerDetailSplitPage.tsx
```

- `useParams<{ workerId }>()` + `useWorker(workerId)`
- Loading/error states (LoadingSpinner, ErrorAlert)
- Layout: `grid grid-cols-[300px_1fr] h-[calc(100vh-200px)]`
- Left: `WorkerInfoPanel` (scrollable)
- Right: `TabsWithUrlState` (paramKey="tab", defaultValue="overview", groupId="worker")
    - Tab "overview": `WorkerMetricsGrid`
    - Tab "tasks": `WorkerTaskHistoryTable`
    - Tab "flows": `WorkerFlowsList`
- PageHeader: title = worker name or ID, action = `[Stacked ⇄]` button

### `WorkerDetailStackedPage.tsx`

```
packages/web-frontend/src/app/pages/workers/WorkerDetailStackedPage.tsx
```

- Same data hooks
- Layout: stacked, full-width
- Below PageHeader: `WorkerMetricsGrid` (always visible, 4 compact metric cards)
- Worker identity info (id, state, connection, workspace) inline in PageHeader subtitle area
- `TabsWithUrlState` (defaultValue="tasks")
    - Tab "tasks": `WorkerTaskHistoryTable` (full width)
    - Tab "flows": `WorkerFlowsList`
    - Tab "info": `WorkerInfoPanel` (full-width variant, no fixed height)
- PageHeader action: `[Split ⇄]` button

---

## Step 8 — Navigation

### `WorkersTable.tsx`

Add `onRowClick` prop to `Table2` (prop exists, just not wired) that navigates to `/workers/:workerId`.
Cursor pointer on rows.

### `App.tsx`

Add 3 routes after existing `/workers` route:

```tsx
<Route path="/workers/:workerId" element={<WorkerDetailSplitPage />} />
<Route path="/workers/:workerId/split" element={<WorkerDetailSplitPage />} />
<Route path="/workers/:workerId/stacked" element={<WorkerDetailStackedPage />} />
```

---

## Step 9 — Tests

**Coverage target:** >70% all files, 90% for hooks.

- `hooks/useWorker.test.ts` — mock `workersApi.getWorker`, test loading/error/success/realtime
- `hooks/useWorkerTaskHistory.test.ts` — test workerId filter is passed correctly
- `hooks/useWorkerFlows.test.ts` — test loading/error/empty/success
- `components/WorkerInfoPanel.test.tsx` — render connected vs disconnected states
- `components/WorkerMetricsGrid.test.tsx` — N/A fallbacks when data absent
- `WorkerDetailSplitPage.test.tsx` — loading, error, connected, disconnected states
- `WorkerDetailStackedPage.test.tsx` — same

Backend:

- `WorkersService.getWorker` — connected, disconnected (metadata exists), not found (404)

---

## Files Modified (existing)

| File                                                            | Change                                                      |
| --------------------------------------------------------------- | ----------------------------------------------------------- |
| `packages/shared-frontend-backend/src/api/workers.contract.ts`  | Add GET route + `projectId`/`workspacePath` to WorkerSchema |
| `packages/web-backend/src/services/WorkersService.ts`           | Add `getWorker()`                                           |
| `packages/web-backend/src/controllers/WorkersController.ts`     | Add GET route                                               |
| `packages/web-frontend/src/app/pages/workers/workers.api.ts`    | Add `getWorker()`                                           |
| `packages/web-frontend/src/app/pages/workers/WorkersService.ts` | Add `getWorker()`                                           |
| `packages/web-frontend/src/app/pages/workers/WorkersTable.tsx`  | Wire `onRowClick` → navigate                                |
| `packages/web-frontend/src/app/App.tsx`                         | Add 3 routes                                                |

---

## Verification

1. Use skill `check` — TypeScript + ESLint clean
2. Use skill `run-test` — all tests pass
3. Manual: navigate to `/workers` → click a row → Split page loads with correct worker data
4. Manual: switch to Stacked layout via toggle button
5. Manual: disconnect a worker → page shows "Disconnected" badge, metadata preserved
6. Manual: click task ID in history → navigates to task detail page
7. Manual: rename worker on detail page → updates in real-time on other tabs
