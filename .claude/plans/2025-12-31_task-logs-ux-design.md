# UX Design Plan: Task Logs Display

**Date**: 2025-12-31
**Type**: UX Design & Architecture
**Focus**: Affichage des logs d'exécution des tâches

## Context

Based on exploration of the codebase and user requirements:

### Current State

- Tasks displayed in TasksPage2 with TasksTable2 (packages/web-frontend/src/app/pages/tasks2/)
- Task data model includes flowResult with optional trace field
- Application uses MainLayout with sidebar navigation and optional InfoPanel
- Real-time updates via WebSocket (B2F_TASK_CREATED, B2F_TASK_UPDATED events)

### User Requirements

1. **Type de logs**: Trace d'exécution (flowResult.trace) - logs détaillés des flows
2. **Mode**: Temps réel ET consultation post-exécution
3. **Navigation**: Page dédiée (/tasks/:id/logs)

---

## UX Design Options

### Option A: Page Dédiée avec Split View (RECOMMENDED)

#### Description

Une page complète accessible via `/tasks/:id` qui affiche:

- Left panel: Informations de la tâche (description, status, metadata)
- Right panel: Logs d'exécution avec auto-scroll en temps réel

#### ASCII Mockup

```
┌────────────────────────────────────────────────────────────────────────┐
│ ← Back to Tasks              Task #task-123                  [ Stop ] │
├─────────────────────────────┬──────────────────────────────────────────┤
│                             │                                          │
│  TASK INFO                  │  EXECUTION LOGS               [⟳] [⬇️]  │
│                             │                                          │
│  Description:               │  ┌────────────────────────────────────┐ │
│  Process customer data      │  │ [12:34:01] Flow started            │ │
│                             │  │ [12:34:01] Step 1: Load input      │ │
│  Status: ● IN_PROGRESS      │  │ [12:34:02] ├─ Input validated      │ │
│  Priority: High             │  │ [12:34:03] ├─ Processing 1000 rows │ │
│  Worker: worker-001         │  │ [12:34:05] Step 2: Transform data  │ │
│                             │  │ [12:34:06] ├─ Applied filter X     │ │
│  Created: Dec 31, 2025      │  │ [12:34:07] ├─ Mapped fields        │ │
│  Started: 12:34:01          │  │ [12:34:08] Step 3: Save output     │ │
│  Duration: 00:02:15         │  │ [12:34:09] ▶ Writing to database   │ │
│                             │  │ [12:34:09] ⏳ In progress...        │ │
│  Flow: customer-etl         │  │                                    │ │
│                             │  │                                    │ │
│  METADATA                   │  │                                    │ │
│  ├─ batchId: batch-456      │  │                                    │ │
│  └─ region: EU              │  │                                    │ │
│                             │  │                                    │ │
│  [ View Flow Definition ]   │  └────────────────────────────────────┘ │
│  [ View Full History ]      │                                          │
│                             │  Filters: ⬚ Info ☑ Warning ☑ Error     │
│                             │  Search: [.....................]         │
│                             │                                          │
└─────────────────────────────┴──────────────────────────────────────────┘
```

#### Pros

- **Maximum screen real estate** for logs
- **Dedicated focus** on a single task
- **Clean separation** between task info and logs
- **Easy to bookmark** and share specific task logs
- **Professional appearance** for debugging/monitoring
- **Context preservation** - task info always visible

#### Cons

- **Navigation overhead** - need to navigate away from task list
- **Less efficient** for quickly checking multiple tasks
- **Back/forward complexity** if monitoring many tasks

#### Technical Considerations

- Route: `/tasks/:id` or `/tasks/:id/logs`
- Real-time: Subscribe to task-specific WebSocket events
- Auto-scroll: Option to enable/disable (sticky scroll to bottom)
- Filters: Log level (info, warning, error), timestamp range, step filtering
- Export: Download logs as JSON/TXT
- Performance: Virtualized list for large log volumes (react-window)

---

### Option B: Modal avec Tabs

#### Description

Modal/Dialog qui s'ouvre depuis la liste des tâches avec tabs pour différentes vues.

#### ASCII Mockup

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Tasks (v2)                           [ + Create ] │
├────────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │                    Task #task-123                          [  X ]│ │
│  ├──────────────────────────────────────────────────────────────────┤ │
│  │  [ Details ]  [ Logs ]  [ History ]  [ Comments ]              │ │
│  ├──────────────────────────────────────────────────────────────────┤ │
│  │                                                                  │ │
│  │  EXECUTION LOGS                              [⟳] [⬇️] [Export] │ │
│  │                                                                  │ │
│  │  ┌────────────────────────────────────────────────────────────┐ │ │
│  │  │ [12:34:01] Flow started                                    │ │ │
│  │  │ [12:34:01] Step 1: Load input                              │ │ │
│  │  │ [12:34:02] ├─ Input validated                              │ │ │
│  │  │ [12:34:03] ├─ Processing 1000 rows                         │ │ │
│  │  │ [12:34:05] Step 2: Transform data                          │ │ │
│  │  │ [12:34:06] ├─ Applied filter X                             │ │ │
│  │  │ [12:34:07] ├─ Mapped fields                                │ │ │
│  │  │ [12:34:08] Step 3: Save output                             │ │ │
│  │  │ [12:34:09] ▶ Writing to database                           │ │ │
│  │  │ [12:34:09] ⏳ In progress...                                │ │ │
│  │  │                                                            │ │ │
│  │  └────────────────────────────────────────────────────────────┘ │ │
│  │                                                                  │ │
│  │  Filters: ⬚ Info ☑ Warning ☑ Error                             │ │
│  │                                                                  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  Tasks Table continues below...                                       │
└────────────────────────────────────────────────────────────────────────┘
```

#### Pros

- **Context retention** - stay on tasks page
- **Quick access** - one click from task list
- **Tabs organization** - group related info (logs, history, comments)
- **Less navigation** - no route change needed

#### Cons

- **Limited screen space** - modal restricts log viewing area
- **Not bookmarkable** - can't share direct link to task logs
- **Scroll conflicts** - modal scroll vs page scroll
- **Mobile experience** - modals can be awkward on small screens

---

### Option C: Expandable Table Rows

#### Description

Clicking a task row expands it inline to show logs beneath.

#### ASCII Mockup

```
┌────────────────────────────────────────────────────────────────────────┐
│                      Tasks (v2)                           [ + Create ] │
├────────────────────────────────────────────────────────────────────────┤
│ ID      │ Description          │ Status      │ Priority │ Created     │
├─────────┼──────────────────────┼─────────────┼──────────┼─────────────┤
│ task-123│ Process customer...  │● IN_PROGRESS│ High     │ Dec 31      │
├─────────┴──────────────────────┴─────────────┴──────────┴─────────────┤
│  EXECUTION LOGS                                       [⟳] [Collapse] │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ [12:34:01] Flow started                                        │   │
│  │ [12:34:01] Step 1: Load input                                  │   │
│  │ [12:34:02] ├─ Input validated                                  │   │
│  │ [12:34:03] ├─ Processing 1000 rows                             │   │
│  │ [12:34:05] Step 2: Transform data                              │   │
│  └────────────────────────────────────────────────────────────────┘   │
│  Filters: ⬚ Info ☑ Warning ☑ Error     [ View Full Logs → ]         │
├─────────┬──────────────────────┬─────────────┬──────────┬─────────────┤
│ task-124│ Generate report      │ ✓ COMPLETED │ Medium   │ Dec 31      │
├─────────┼──────────────────────┼─────────────┼──────────┼─────────────┤
│ task-125│ Send notifications   │ ⊗ FAILED    │ Urgent   │ Dec 31      │
└─────────┴──────────────────────┴─────────────┴──────────┴─────────────┘
```

#### Pros

- **Zero navigation** - everything on one page
- **Quick preview** - scan logs without leaving list
- **Efficient comparison** - expand multiple tasks to compare
- **Compact** - works well for short log previews

#### Cons

- **Page height explosion** - long logs push other tasks down
- **Performance issues** - rendering many expanded rows
- **Limited detail** - can't show full log interface in condensed space
- **Poor mobile UX** - table expansion awkward on small screens
- **Scroll confusion** - nested scrollable areas

---

### Option D: Side Panel (Sheet)

#### Description

Slide-in panel from the right using existing Sheet component pattern.

#### ASCII Mockup

```
┌────────────────────────────────────────┬───────────────────────────────┐
│      Tasks (v2)      [ + Create ]     │  Task #task-123        [  X ]│
├────────────────────────────────────────┤                               │
│ ID    │ Desc   │ Status   │ Priority  │  ● IN_PROGRESS               │
├───────┼────────┼──────────┼───────────┤  Process customer data        │
│ 123   │ Proc...│●Progress │ High      │                               │
│ 124   │ Gen... │✓Complete │ Medium    │  Worker: worker-001           │
│ 125   │ Send...│⊗ Failed  │ Urgent    │  Duration: 00:02:15           │
│                                        │                               │
│                                        │  ─────────────────────────    │
│                                        │  LOGS              [⟳] [⬇️]  │
│                                        │  ┌─────────────────────────┐ │
│                                        │  │[12:34:01] Flow started  │ │
│                                        │  │[12:34:01] Step 1: Load  │ │
│                                        │  │[12:34:02]├─ Validated   │ │
│                                        │  │[12:34:03]├─ Processing  │ │
│                                        │  │[12:34:05] Step 2: Trans │ │
│                                        │  │[12:34:06]├─ Filter X    │ │
│                                        │  │[12:34:07]├─ Mapped      │ │
│                                        │  │[12:34:08] Step 3: Save  │ │
│                                        │  │[12:34:09]▶ Writing DB   │ │
│                                        │  │[12:34:09]⏳ Progress...  │ │
│                                        │  │                         │ │
│                                        │  └─────────────────────────┘ │
│                                        │                               │
│                                        │  ⬚ Info ☑ Warn ☑ Error      │
│                                        │                               │
└────────────────────────────────────────┴───────────────────────────────┘
```

#### Pros

- **Familiar pattern** - already used in app (InfoPanel)
- **Context preserved** - task list still visible
- **Good compromise** - more space than modal, less than full page
- **Mobile friendly** - can go full-width on mobile

#### Cons

- **Reduced log space** - narrower than full page
- **List occlusion** - panel covers part of task list
- **Not ideal for real-time** - limited vertical space for streaming logs
- **Multiple panels** - can't easily compare logs from different tasks

---

## Comparison Matrix

| Aspect             | Page Dédiée (A) | Modal (B)  | Expandable (C) | Side Panel (D) |
| ------------------ | --------------- | ---------- | -------------- | -------------- |
| Screen Real Estate | ⭐⭐⭐⭐⭐      | ⭐⭐⭐     | ⭐⭐           | ⭐⭐⭐         |
| Real-time Friendly | ⭐⭐⭐⭐⭐      | ⭐⭐⭐     | ⭐⭐           | ⭐⭐⭐         |
| Quick Access       | ⭐⭐⭐          | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐     | ⭐⭐⭐⭐       |
| Bookmarkable       | ⭐⭐⭐⭐⭐      | ⭐         | ⭐             | ⭐⭐           |
| Mobile UX          | ⭐⭐⭐⭐        | ⭐⭐       | ⭐⭐           | ⭐⭐⭐⭐⭐     |
| Context Retention  | ⭐⭐⭐          | ⭐⭐⭐⭐   | ⭐⭐⭐⭐⭐     | ⭐⭐⭐⭐       |
| Professional Look  | ⭐⭐⭐⭐⭐      | ⭐⭐⭐     | ⭐⭐           | ⭐⭐⭐⭐       |
| Implementation     | ⭐⭐⭐⭐        | ⭐⭐⭐⭐   | ⭐⭐⭐         | ⭐⭐⭐⭐⭐     |

---

## Recommended Approach: **Option A - Page Dédiée (Deux Variantes)**

### Why Option A?

1. **Matches User Requirement**: User explicitly requested "Page dédiée"
2. **Best for Real-time**: Maximum space for streaming logs during execution
3. **Professional**: Dedicated debugging interface suitable for development/ops
4. **Bookmarkable**: Can share links to specific task logs
5. **Scalable**: Can add more features (export, advanced filters, timeline view)

### Two Layout Variants to Implement

We'll create **both variants** to compare UX in real usage:

#### **Variant A1: Side-by-Side Layout** (`/tasks/:id/logs-split`)

Info panel on the left, logs on the right (original design from Option A above)

**Pros:**

- Task context always visible while scrolling logs
- Clean separation of concerns
- Works well on wide screens (>1200px)

**Cons:**

- Less horizontal space for logs on smaller screens
- Long log lines may wrap awkwardly

---

#### **Variant A2: Stacked Layout** (`/tasks/:id/logs-stacked`)

Task info in header/top section, logs take full width below

```
┌────────────────────────────────────────────────────────────────────────┐
│ ← Back to Tasks              Task #task-123                  [ Stop ] │
├────────────────────────────────────────────────────────────────────────┤
│  TASK INFO (Collapsible)                                      [▼ Hide]│
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ Description: Process customer data        Status: ● IN_PROGRESS  │ │
│  │ Priority: High | Worker: worker-001 | Flow: customer-etl         │ │
│  │ Created: Dec 31, 2025 12:34 | Duration: 00:02:15                 │ │
│  │ Metadata: batchId=batch-456, region=EU                           │ │
│  └──────────────────────────────────────────────────────────────────┘ │
├────────────────────────────────────────────────────────────────────────┤
│  EXECUTION LOGS                                   [⟳] [⬇️] [Export] │
│  ┌──────────────────────────────────────────────────────────────────┐ │
│  │ [12:34:01] Flow started                                          │ │
│  │ [12:34:01] Step 1: Load input                                    │ │
│  │ [12:34:02] ├─ Input validated (schema v2.1)                      │ │
│  │ [12:34:03] ├─ Processing 1000 rows from customers.csv            │ │
│  │ [12:34:05] Step 2: Transform data                                │ │
│  │ [12:34:06] ├─ Applied filter X (removed 23 invalid entries)      │ │
│  │ [12:34:07] ├─ Mapped fields: name, email, address → user_profile │ │
│  │ [12:34:08] Step 3: Save output                                   │ │
│  │ [12:34:09] ▶ Writing to database (batch insert 977 records)      │ │
│  │ [12:34:09] ⏳ In progress... 45% (440/977 rows)                   │ │
│  │                                                                  │ │
│  │                                                                  │ │
│  │                                                                  │ │
│  └──────────────────────────────────────────────────────────────────┘ │
│                                                                        │
│  Filters: ⬚ Info ☑ Warning ☑ Error | Search: [...................]   │
│                                                                        │
└────────────────────────────────────────────────────────────────────────┘
```

**Pros:**

- **Full width for logs** - no wrapping on long lines
- **More vertical space** - better for deep log hierarchies
- **Collapsible header** - maximize log viewing area
- **Better for large logs** - user requested this specifically
- **Mobile friendly** - natural stacking on small screens

**Cons:**

- Task context hidden when collapsed
- Requires scrolling up to see task details

---

### Hybrid Enhancement

Combine both variants with quick preview from Option C:

- **Default**: Click task row → navigate to `/tasks/:id/logs-stacked` (or user preference)
- **Quick Preview**: Hover/icon button → show mini popover with last 5 log lines
- **Badge**: Show log status icon (✓, ⊗, ⏳) in task table
- **Preference**: Let user toggle default layout in settings

```
┌────────────────────────────────────────────────────────────────────────┐
│ ID      │ Description          │ Status      │ Priority │ Logs │       │
├─────────┼──────────────────────┼─────────────┼──────────┼──────┼───────┤
│ task-123│ Process customer...  │● IN_PROGRESS│ High     │ 🔴⏳ │ [→]   │
│         │                      │             │          │      │       │
│         │  ┌──────────────────────────────────────────┐ │      │       │
│         │  │ Quick Preview - Last 5 logs       [View]│ │      │       │
│         │  │ [12:34:08] Step 3: Save output          │ │      │       │
│         │  │ [12:34:09] ▶ Writing to database        │ │      │       │
│         │  │ [12:34:09] ⏳ In progress...             │ │      │       │
│         │  └──────────────────────────────────────────┘ │      │       │
└─────────┴──────────────────────┴─────────────┴──────────┴──────┴───────┘
```

---

## Implementation Plan

### Phase 1: Basic Logs Pages (Both Variants)

#### Shared Components & Infrastructure

1. **API Endpoints**:
    - `GET /api/tasks/:id` - Full task details with logs
    - `GET /api/tasks/:id/logs?cursor=<timestamp>&limit=100` - Paginated logs
    - `GET /api/tasks/:id/logs/search?q=<query>` - Search logs
    - `WS /api/tasks/:id/logs/stream` - Real-time log streaming

2. **Shared Components**:
    - `TaskInfoCard.tsx` - Compact task info display (reusable)
    - `TaskLogsViewer.tsx` - Core logs rendering component (with virtualization)
    - `LogEntry.tsx` - Individual log entry with formatting
    - `LogControls.tsx` - Filter/search/export controls

3. **Shared Hooks**:
    - `useTask(taskId)` - Fetch task details
    - `useTaskLogs(taskId)` - Paginated log loading
    - `useTaskLogsStream(taskId)` - Real-time log streaming
    - `useLogFiltering(logs)` - Client-side filtering
    - `useAutoScroll(logs, containerRef)` - Smart auto-scroll

#### Variant A1: Side-by-Side Layout

1. **Route**: `/tasks/:id/logs-split` (or just `/tasks/:id`)
2. **File**: `packages/web-frontend/src/app/pages/tasks/TaskDetailSplitPage.tsx`
3. **Layout**:
    ```tsx
    <Page>
    	<PageHeader title={`Task #${taskId}`} backLink="/tasks" />
    	<div className="grid grid-cols-[300px_1fr] gap-4">
    		<TaskInfoPanel task={task} />
    		<TaskLogsPanel logs={logs} taskId={taskId} />
    	</div>
    </Page>
    ```
4. **Components**:
    - `TaskInfoPanel.tsx` - Sidebar with full task details
    - `TaskLogsPanel.tsx` - Right panel with logs viewer

#### Variant A2: Stacked Layout

1. **Route**: `/tasks/:id/logs-stacked`
2. **File**: `packages/web-frontend/src/app/pages/tasks/TaskDetailStackedPage.tsx`
3. **Layout**:
    ```tsx
    <Page>
    	<PageHeader title={`Task #${taskId}`} backLink="/tasks" />
    	<Collapsible defaultOpen={true}>
    		<TaskInfoCard task={task} collapsible />
    	</Collapsible>
    	<div className="mt-4 flex-1">
    		<TaskLogsPanel logs={logs} taskId={taskId} fullWidth />
    	</div>
    </Page>
    ```
4. **Components**:
    - `TaskInfoCard.tsx` - Collapsible header with task details
    - Same `TaskLogsPanel.tsx` but with `fullWidth` prop

#### Navigation Integration

Update `TasksTable2.tsx` to navigate on row click:

```tsx
const handleRowClick = (task: Task) => {
	// User preference or default to stacked
	const layout = userPreferences.taskLogsLayout ?? 'stacked';
	navigate(`/tasks/${task.id}/logs-${layout}`);
};
```

### Phase 2: Real-time Streaming

1. **WebSocket Events**:
    - New event: `B2F_TASK_LOG_ENTRY` with `{taskId, timestamp, message, level, step}`
2. **Component**: `useTaskLogsStream` hook
    - Subscribe to task-specific log events
    - Append to local log buffer
    - Auto-scroll management

### Phase 3: Log Viewer Features

1. **Filtering**:
    - Log level: info, warning, error
    - Step filtering: filter by flow step
    - Timestamp range
2. **Search**: Full-text search in log messages
3. **Export**: Download logs as JSON/TXT
4. **Performance**: Virtualized list (react-window) for 1000+ log lines

### Phase 4: Quick Preview (Bonus)

1. **Badge in Table**: Show log status icon
2. **Popover**: Hover to see last 5 log entries
3. **Navigation**: Click badge or row to go to full page

---

## Technical Architecture

### Data Flow

```
Worker → Orchestrator → WebSocket → Frontend
                          ↓
                    TasksService
                          ↓
                  stores flowResult.trace
                          ↓
                   GET /api/tasks/:id
                          ↓
                    TaskDetailPage
                          ↓
              ┌──────────┴──────────┐
              ↓                     ↓
        TaskInfoPanel        TaskLogsPanel
                                    ↓
                            useTaskLogsStream
                                    ↓
                          subscribes to B2F_TASK_LOG_ENTRY
```

### Key Components

**TaskDetailPage.tsx**

```typescript
export function TaskDetailPage() {
  const { taskId } = useParams();
  const { data: task } = useTask(taskId);
  const logs = useTaskLogsStream(taskId);

  return (
    <Page>
      <PageHeader title={`Task #${taskId}`} />
      <div className="grid grid-cols-[300px_1fr] gap-4">
        <TaskInfoPanel task={task} />
        <TaskLogsPanel logs={logs} taskId={taskId} />
      </div>
    </Page>
  );
}
```

**useTaskLogsStream.ts**

```typescript
export function useTaskLogsStream(taskId: string) {
	const [logs, setLogs] = useState<LogEntry[]>([]);

	useRealtimeRefresh({
		events: [`B2F_TASK_LOG_ENTRY:${taskId}`],
		onEvent: event => {
			setLogs(prev => [...prev, event.data]);
		},
	});

	return { logs, isStreaming: task.status === 'in_progress' };
}
```

### Performance Considerations

1. **Virtualization**: Use `react-window` for log lists >100 entries
2. **Batching**: Batch log updates (max 10 logs/second) to avoid render thrashing
3. **Buffer Limit**: Keep max 1000 logs in memory, paginate for more
4. **Compression**: Consider gzip for log export

---

## Advanced Performance Strategies for Large Logs

### Problem Statement

Tasks can generate **massive log volumes**:

- **Long-running flows**: 10,000+ log entries
- **High-frequency logging**: 100+ entries/second during peak
- **Large payloads**: JSON objects, stack traces (>10KB per entry)
- **Real-time streaming**: Must stay responsive during heavy load

### Strategy 1: Windowed Virtualization

**Problem**: Rendering 10,000+ DOM elements causes browser freeze

**Solution**: Virtual scrolling with `react-window` or `react-virtualized`

```typescript
import { FixedSizeList } from 'react-window';

function TaskLogsPanel({ logs }) {
  const Row = ({ index, style }) => (
    <div style={style}>
      <LogEntry log={logs[index]} />
    </div>
  );

  return (
    <FixedSizeList
      height={600}
      itemCount={logs.length}
      itemSize={35} // px per log line
      width="100%"
    >
      {Row}
    </FixedSizeList>
  );
}
```

**Benefits**:

- Renders only visible logs (~20-30 items)
- Constant 60fps regardless of total log count
- Memory footprint: O(viewport) instead of O(n)

**Trade-off**: Fixed row height requires pre-calculation for multi-line logs

---

### Strategy 2: Log Pagination with Infinite Scroll

**Problem**: Loading 50MB of logs upfront takes 10+ seconds

**Solution**: Server-side pagination + infinite scroll

```typescript
// API endpoint with cursor pagination
GET /api/tasks/:id/logs?cursor=<timestamp>&limit=100

// Frontend hook
function useTaskLogsPaginated(taskId: string) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const loadMore = async () => {
    const response = await fetch(
      `/api/tasks/${taskId}/logs?cursor=${cursor}&limit=100`
    );
    const { logs: newLogs, nextCursor } = await response.json();

    setLogs(prev => [...prev, ...newLogs]);
    setCursor(nextCursor);
    setHasMore(!!nextCursor);
  };

  return { logs, loadMore, hasMore };
}
```

**Implementation Details**:

- **Initial load**: First 100 logs (last 100 chronologically)
- **Scroll to top**: Load previous 100 (historical)
- **Scroll to bottom**: Load next 100 (newer logs)
- **Bidirectional scrolling**: Support both directions

**Benefits**:

- Fast initial render (<200ms)
- Progressive loading as user scrolls
- Reduces network payload by 98% (100 vs 10,000 logs)

---

### Strategy 3: Log Streaming with Backpressure

**Problem**: WebSocket floods UI with 100+ logs/second → UI freeze

**Solution**: Batched updates with requestAnimationFrame

```typescript
function useLogStreamWithBackpressure(taskId: string) {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const bufferRef = useRef<LogEntry[]>([]);
	const rafRef = useRef<number | null>(null);

	const flushBuffer = useCallback(() => {
		if (bufferRef.current.length > 0) {
			setLogs(prev => [...prev, ...bufferRef.current]);
			bufferRef.current = [];
		}
		rafRef.current = null;
	}, []);

	useEffect(() => {
		const ws = new WebSocket(`ws://...`);

		ws.onmessage = event => {
			const logEntry = JSON.parse(event.data);
			bufferRef.current.push(logEntry);

			// Schedule flush on next animation frame (max 60fps)
			if (rafRef.current === null) {
				rafRef.current = requestAnimationFrame(flushBuffer);
			}
		};

		return () => {
			ws.close();
			if (rafRef.current) cancelAnimationFrame(rafRef.current);
		};
	}, [taskId, flushBuffer]);

	return logs;
}
```

**Benefits**:

- **Batches updates**: Groups up to ~100 logs per frame (16ms)
- **60fps guaranteed**: UI stays responsive even during log flood
- **Prevents thrashing**: Single render per frame vs 100 renders/sec

**Alternative**: Use `lodash.throttle` instead of RAF for simpler implementation

---

### Strategy 4: Log Level Filtering (Client-Side)

**Problem**: 95% of logs are DEBUG/INFO, overwhelming actual errors

**Solution**: Real-time filtering without re-fetching

```typescript
function useLogFiltering(logs: LogEntry[]) {
	const [filters, setFilters] = useState({
		debug: true,
		info: true,
		warning: true,
		error: true,
	});

	const filteredLogs = useMemo(() => {
		return logs.filter(log => filters[log.level]);
	}, [logs, filters]);

	return { filteredLogs, filters, setFilters };
}
```

**Optimization**: Use Web Worker for filtering large datasets

```typescript
// log-filter.worker.ts
self.onmessage = e => {
	const { logs, filters } = e.data;
	const filtered = logs.filter(log => filters[log.level]);
	self.postMessage(filtered);
};

// Component
const worker = useMemo(() => new Worker('log-filter.worker.ts'), []);
```

**Benefits**:

- Instant filtering (no API call)
- Non-blocking UI (Web Worker)
- Reduces visible logs by 90%+ when hiding DEBUG

---

### Strategy 5: Log Compression & Lazy Loading

**Problem**: Large JSON payloads in logs (10KB+ per entry)

**Solution**: Collapsible/expandable log details

```typescript
interface LogEntry {
  id: string;
  timestamp: string;
  message: string;
  level: 'debug' | 'info' | 'warning' | 'error';
  metadata?: Record<string, any>; // Lazy load this
  stackTrace?: string; // Lazy load this
}

function LogEntry({ log }: { log: LogEntry }) {
  const [expanded, setExpanded] = useState(false);
  const [details, setDetails] = useState(null);

  const loadDetails = async () => {
    if (!details) {
      const response = await fetch(`/api/logs/${log.id}/details`);
      setDetails(await response.json());
    }
    setExpanded(!expanded);
  };

  return (
    <div>
      <div onClick={loadDetails}>
        {log.timestamp} {log.level} {log.message}
        {log.metadata && <span>(...)</span>}
      </div>
      {expanded && details && (
        <pre>{JSON.stringify(details, null, 2)}</pre>
      )}
    </div>
  );
}
```

**Benefits**:

- **Initial load**: Only timestamps + messages (~100 bytes/log)
- **On-demand**: Full details loaded when user expands (10KB)
- **Reduces payload**: 99% smaller for initial render

---

### Strategy 6: Intelligent Log Sampling

**Problem**: Flow generates 50,000 logs but user only cares about errors

**Solution**: Smart sampling + full logs on-demand

```typescript
// Server-side sampling strategy
function sampleLogs(logs: LogEntry[]): SampledLogs {
	return {
		// Always include
		errors: logs.filter(l => l.level === 'error'), // All errors
		warnings: logs.filter(l => l.level === 'warning'), // All warnings

		// Sample strategically
		milestones: logs.filter(l => l.isMilestone), // Start/end of steps
		sampled: logs.filter(l => l.level === 'info' || l.level === 'debug').filter((_, i) => i % 100 === 0), // Every 100th log

		// Metadata
		totalCount: logs.length,
		hasFullLogs: true, // Full logs available via separate endpoint
	};
}
```

**UI Indicator**:

```
┌────────────────────────────────────────────────────────────────┐
│ Showing 523 of 45,729 logs (sampled)    [ Load All Logs → ]   │
│                                                                │
│ ⚠️  Sampling active: All errors + warnings + every 100th log   │
└────────────────────────────────────────────────────────────────┘
```

**Benefits**:

- **Initial load**: 500 logs instead of 50,000
- **Context preserved**: All important logs (errors, milestones)
- **Opt-in full logs**: Power users can load everything

---

### Strategy 7: Auto-Scroll Management

**Problem**: Auto-scroll fights user when they scroll up to inspect logs

**Solution**: Smart scroll detection

```typescript
function useAutoScroll(logs: LogEntry[], containerRef: React.RefObject<HTMLDivElement>) {
	const [isAutoScrollEnabled, setIsAutoScrollEnabled] = useState(true);
	const lastScrollTopRef = useRef(0);

	// Detect if user scrolled up manually
	const handleScroll = useCallback(() => {
		const container = containerRef.current;
		if (!container) return;

		const { scrollTop, scrollHeight, clientHeight } = container;
		const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;

		// User scrolled up → disable auto-scroll
		if (scrollTop < lastScrollTopRef.current && !isAtBottom) {
			setIsAutoScrollEnabled(false);
		}

		// User scrolled to bottom → re-enable auto-scroll
		if (isAtBottom) {
			setIsAutoScrollEnabled(true);
		}

		lastScrollTopRef.current = scrollTop;
	}, [containerRef]);

	// Auto-scroll when new logs arrive
	useEffect(() => {
		if (isAutoScrollEnabled && containerRef.current) {
			containerRef.current.scrollTo({
				top: containerRef.current.scrollHeight,
				behavior: 'smooth',
			});
		}
	}, [logs, isAutoScrollEnabled, containerRef]);

	return { isAutoScrollEnabled, setIsAutoScrollEnabled, handleScroll };
}
```

**UI Controls**:

```
[ ⬇️ Auto-scroll: ON ]  ← Green when active, user can toggle
```

**Benefits**:

- Doesn't fight user when inspecting historical logs
- Re-enables when user scrolls to bottom
- Manual override available

---

### Strategy 8: Log Indexing for Search

**Problem**: Searching 50,000 logs in browser takes 5+ seconds

**Solution**: Server-side full-text search with debouncing

```typescript
function useLogSearch(taskId: string) {
	const [query, setQuery] = useState('');
	const [results, setResults] = useState<LogEntry[]>([]);
	const [isSearching, setIsSearching] = useState(false);

	const debouncedSearch = useMemo(
		() =>
			debounce(async (searchQuery: string) => {
				if (!searchQuery) {
					setResults([]);
					return;
				}

				setIsSearching(true);
				const response = await fetch(`/api/tasks/${taskId}/logs/search?q=${encodeURIComponent(searchQuery)}`);
				const { results: searchResults } = await response.json();
				setResults(searchResults);
				setIsSearching(false);
			}, 300),
		[taskId]
	);

	useEffect(() => {
		debouncedSearch(query);
	}, [query, debouncedSearch]);

	return { query, setQuery, results, isSearching };
}
```

**Backend**: Use PostgreSQL full-text search or Elasticsearch

```sql
-- PostgreSQL example
SELECT * FROM task_logs
WHERE task_id = $1
  AND to_tsvector('english', message) @@ plainto_tsquery('english', $2)
ORDER BY timestamp DESC
LIMIT 100;
```

**Benefits**:

- **Sub-second search**: Even on millions of logs
- **Debounced**: Reduces API calls while typing
- **Highlighted results**: Show matching context

---

### Strategy 9: Log Persistence Strategy

**Problem**: Where to store logs? Memory? Database? Files?

**Solution**: Tiered storage based on age and size

```
┌─────────────────────────────────────────────────────────────┐
│                      LOG STORAGE TIERS                      │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  TIER 1: Redis (Hot - Last 1 hour)                         │
│  ├─ Real-time logs streaming                               │
│  ├─ Ring buffer (max 10,000 entries)                       │
│  └─ Expiry: 1 hour                                          │
│                                                             │
│  TIER 2: PostgreSQL (Warm - Last 7 days)                   │
│  ├─ Task completion → flush Redis to Postgres              │
│  ├─ Indexed by task_id, timestamp, level                   │
│  └─ Retention: 7 days                                       │
│                                                             │
│  TIER 3: S3/File Storage (Cold - Archive)                  │
│  ├─ Export logs as JSONL after 7 days                      │
│  ├─ Compressed (gzip): 10:1 ratio                          │
│  └─ On-demand download only                                │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Implementation**:

1. **During execution**: Stream logs to Redis
2. **On task completion**: Bulk insert to PostgreSQL, clear Redis
3. **After 7 days**: Archive to S3, delete from Postgres
4. **Access pattern**:
    - Active tasks: Redis (real-time)
    - Recent tasks (<7d): Postgres (fast queries)
    - Old tasks (>7d): S3 download link

**Benefits**:

- **Cost effective**: $0.023/GB in S3 vs $0.115/GB in RDS
- **Fast real-time**: Redis handles 100k+ writes/sec
- **Queryable history**: Postgres for recent investigations

---

### Strategy 10: WebSocket Connection Pooling

**Problem**: 100 users watching 100 tasks = 10,000 WebSocket connections

**Solution**: Shared connection with multiplexing

```typescript
// Singleton WebSocket manager
class LogStreamManager {
	private ws: WebSocket | null = null;
	private subscribers = new Map<string, Set<(log: LogEntry) => void>>();

	subscribe(taskId: string, callback: (log: LogEntry) => void) {
		if (!this.subscribers.has(taskId)) {
			this.subscribers.set(taskId, new Set());
			this.sendSubscribe(taskId);
		}
		this.subscribers.get(taskId)!.add(callback);

		return () => {
			this.subscribers.get(taskId)?.delete(callback);
			if (this.subscribers.get(taskId)?.size === 0) {
				this.sendUnsubscribe(taskId);
				this.subscribers.delete(taskId);
			}
		};
	}

	private handleMessage(event: MessageEvent) {
		const { taskId, log } = JSON.parse(event.data);
		this.subscribers.get(taskId)?.forEach(callback => callback(log));
	}
}

// Usage
function useTaskLogs(taskId: string) {
	const [logs, setLogs] = useState<LogEntry[]>([]);

	useEffect(() => {
		return logStreamManager.subscribe(taskId, log => {
			setLogs(prev => [...prev, log]);
		});
	}, [taskId]);

	return logs;
}
```

**Benefits**:

- **1 WebSocket** instead of N connections
- **Multiplexing**: Server fans out to subscribed tasks
- **Auto-cleanup**: Unsubscribes when component unmounts

---

## Performance Metrics & Targets

| Metric                          | Target       | Strategy                             |
| ------------------------------- | ------------ | ------------------------------------ |
| Initial page load               | < 300ms      | Pagination (Strategy 2)              |
| Render 10,000 logs              | 60fps        | Virtualization (Strategy 1)          |
| Real-time streaming (100 log/s) | 60fps        | Backpressure (Strategy 3)            |
| Search 50,000 logs              | < 500ms      | Server-side search (Strategy 8)      |
| Filter 10,000 logs              | < 100ms      | Client-side memoization (Strategy 4) |
| Memory footprint                | < 50MB       | Pagination + Virtualization          |
| WebSocket connections           | 1 per client | Connection pooling (Strategy 10)     |
| Log storage cost                | < $10/month  | Tiered storage (Strategy 9)          |

---

## Recommended Implementation Phases

### Phase 1: Foundation (MVP)

- ✅ Virtualization (Strategy 1)
- ✅ Pagination (Strategy 2)
- ✅ Auto-scroll (Strategy 7)

### Phase 2: Real-time

- ✅ Streaming with backpressure (Strategy 3)
- ✅ Connection pooling (Strategy 10)

### Phase 3: Filtering & Search

- ✅ Client-side filtering (Strategy 4)
- ✅ Server-side search (Strategy 8)

### Phase 4: Optimization

- ✅ Lazy loading details (Strategy 5)
- ✅ Intelligent sampling (Strategy 6)
- ✅ Tiered storage (Strategy 9)

---

## Visual Design System

### Log Entry Format

```
[HH:MM:SS] Level Icon │ Message
                       └─ Nested Info (indented)
```

### Icons & Colors

- **Info**: `ℹ️` / Blue
- **Warning**: `⚠️` / Yellow
- **Error**: `❌` / Red
- **Success**: `✓` / Green
- **In Progress**: `▶` / Blue (animated)
- **Pending**: `⏳` / Gray

### Status Badges in Table

```
✓  Completed successfully
⊗  Failed with errors
⏳  In progress (real-time)
🔴 Active errors in logs
⚠️  Warnings present
```

---

## Mobile Considerations

On mobile (`<768px`):

- **Single column layout**: Stack TaskInfoPanel above TaskLogsPanel
- **Collapsible info**: Collapse task info by default, focus on logs
- **Touch-friendly**: Larger tap targets for filters
- **Reduced chrome**: Hide less critical metadata on small screens

---

## Files to Create/Modify

### New Files

#### Pages (Both Variants)

- `packages/web-frontend/src/app/pages/tasks/TaskDetailSplitPage.tsx` - Side-by-side layout (Variant A1)
- `packages/web-frontend/src/app/pages/tasks/TaskDetailStackedPage.tsx` - Stacked layout (Variant A2)

#### Shared Components

- `packages/web-frontend/src/app/pages/tasks/components/TaskInfoCard.tsx` - Collapsible task info card
- `packages/web-frontend/src/app/pages/tasks/components/TaskInfoPanel.tsx` - Sidebar task info panel
- `packages/web-frontend/src/app/pages/tasks/components/TaskLogsPanel.tsx` - Main logs viewer panel
- `packages/web-frontend/src/app/pages/tasks/components/TaskLogsViewer.tsx` - Virtualized logs list
- `packages/web-frontend/src/app/pages/tasks/components/LogEntry.tsx` - Single log entry renderer
- `packages/web-frontend/src/app/pages/tasks/components/LogControls.tsx` - Filter/search/export controls

#### Hooks

- `packages/web-frontend/src/app/pages/tasks/hooks/useTask.ts` - Fetch task details
- `packages/web-frontend/src/app/pages/tasks/hooks/useTaskLogs.ts` - Paginated log loading
- `packages/web-frontend/src/app/pages/tasks/hooks/useTaskLogsStream.ts` - Real-time log streaming
- `packages/web-frontend/src/app/pages/tasks/hooks/useLogFiltering.ts` - Client-side log filtering
- `packages/web-frontend/src/app/pages/tasks/hooks/useAutoScroll.ts` - Smart auto-scroll management
- `packages/web-frontend/src/app/pages/tasks/hooks/useLogSearch.ts` - Debounced log search

#### Utilities

- `packages/web-frontend/src/app/pages/tasks/utils/logFormatters.ts` - Log formatting helpers
- `packages/web-frontend/src/app/pages/tasks/utils/logExport.ts` - Export logs to JSON/TXT

#### API

- `packages/web-frontend/src/app/pages/tasks/tasks.api.ts` - Update with logs endpoints

### Modified Files

#### Frontend

- `packages/web-frontend/src/app/App.tsx` - Add routes:
    - `/tasks/:id/logs-split` (Variant A1)
    - `/tasks/:id/logs-stacked` (Variant A2)
    - `/tasks/:id` (redirect to default layout)
- `packages/web-frontend/src/app/pages/tasks2/TasksTable2.tsx` - Add row click handler
- `packages/web-frontend/src/app/pages/tasks2/TasksPage2.tsx` - Add log status badges to table

#### Backend

- `packages/web-backend/src/services/TasksService.ts` - Add methods:
    - `getTaskById(taskId): Task`
    - `getTaskLogs(taskId, cursor, limit): PaginatedLogs`
    - `searchTaskLogs(taskId, query): LogEntry[]`
- `packages/web-backend/src/server.ts` - Add log endpoints and WebSocket handlers

#### Shared/Contracts

- `packages/shared-frontend-backend/src/api/tasks.contract.ts` - Extend schemas:
    - Add `LogEntrySchema`
    - Add `PaginatedLogsSchema`
    - Add log-related endpoints to `TASKS_API_ROUTES`
- `packages/shared-frontend-backend/src/transport/events.ts` - Add events:
    - `B2F_TASK_LOG_ENTRY` - Real-time log event
    - `B2F_TASK_LOGS_COMPLETE` - Task finished logging

#### Infrastructure

- `packages/orchestrator/src/core/TaskManager.ts` - Add log emission during task execution
- `packages/worker/src/flow/FlowWorker.ts` - Capture and emit flow execution logs

---

## Success Metrics

1. **Load time**: Task detail page loads in <500ms
2. **Real-time latency**: Logs appear <200ms after emission
3. **Smooth scrolling**: 60fps even with 1000+ log entries
4. **Mobile usability**: All features accessible on mobile
5. **Developer adoption**: Used for debugging at least 50% of task issues

---

## Next Steps

1. User approval of this UX design plan
2. Create technical implementation plan (if not already in sprint)
3. Design reviews with team
4. Implementation in phases (basic → real-time → features → preview)
5. User testing with real flow executions
