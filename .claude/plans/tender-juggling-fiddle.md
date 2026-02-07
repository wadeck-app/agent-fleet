# Plan: Stream-JSON Real-Time Claude CLI Logging

## Context

Currently, when a model step (Claude CLI) executes in background mode, the application waits for the **entire process to exit** before showing any output in the web UI. For long-running steps (several minutes), the user sees nothing — just a loading indicator.

This plan adds `--output-format=stream-json --verbose` to Claude CLI invocations, parses the NDJSON output in real-time, and streams structured log entries to the frontend throughout execution. It also makes `--dangerously-skip-permissions` configurable (currently hardcoded).

## Changes Overview

### 1. Add `ExecutionConfig` type and wire it into FlowDefinition

**Files:**
- `packages/flow-engine/src/types.ts` — Add `ExecutionConfig` interface + `execution?` field on `FlowDefinition` + `liveLogEntries?` on `StepTrace`
- `packages/web-frontend/src/app/pages/flows/flow-editor/types/flow-engine.types.ts` — Mirror `ExecutionConfig` and add to frontend `FlowDefinition`

```typescript
// In types.ts
export interface ExecutionConfig {
  /** Enable --output-format=stream-json (default: true) */
  streamJson?: boolean;
  /** Enable --verbose flag (default: true) */
  verbose?: boolean;
  /** Enable --dangerously-skip-permissions (default: true) */
  skipPermissions?: boolean;
}
```

`StepTrace` gets a new optional field:
```typescript
/** Live log entries streamed during model step execution */
liveLogEntries?: LiveLogEntry[];
```

With `LiveLogEntry` defined as:
```typescript
export interface LiveLogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warning' | 'error';
  message: string;
  /** Stream-json event type: 'init', 'assistant_text', 'tool_use', 'tool_result', 'result' */
  eventType: string;
  metadata?: Record<string, any>;
}
```

### 2. Create `StreamJsonParser` — NDJSON line parser

**New file:** `packages/flow-engine/src/processing/StreamJsonParser.ts`

Responsibilities:
- Buffer partial lines from stdout chunks (Claude may emit partial JSON across `data` events)
- Parse each complete line as JSON
- Emit typed `StreamJsonEvent` objects via callback
- Silently skip non-JSON lines (Claude CLI may emit setup text)

**New test file:** `packages/flow-engine/src/processing/StreamJsonParser.test.ts`

### 3. Create `StreamEventMapper` — Maps events to LiveLogEntry

**New file:** `packages/flow-engine/src/processing/StreamEventMapper.ts`

Mapping rules (smart filtering to avoid noise):

| Stream Event | → LogEntry Level | Message Format |
|---|---|---|
| `system` (init) | `debug` | `"Session: {model}, {tools.length} tools"` |
| `assistant` with `text` content | `info` | `"Claude: {text truncated to 500 chars}"` |
| `assistant` with `tool_use` content | `warning` | `"🔧 Tool: {name}({summary of input})"` |
| `user` with `tool_result` | `debug` | `"Tool result [{toolName}]: {truncated output}"` |
| `result` (final) | `info` | `"Completed: {num_turns} turns, ${cost} USD, {duration}s"` |

Key design choices:
- **`warning` level for tool calls** = amber color in the log viewer, making them visually distinct without being errors
- **`debug` level for tool results** = hidden by default (user must change filter to "debug" to see them), reducing noise
- **`info` for assistant text** = standard blue, easy to follow the narrative
- Metadata stores full content for expand-on-click

**New test file:** `packages/flow-engine/src/processing/StreamEventMapper.test.ts`

### 4. Modify `ClaudeLauncher` — Add CLI flags and streaming integration

**File:** `packages/flow-engine/src/processing/ClaudeLauncher.ts`

Changes to `ClaudeLaunchOptions`:
- Add `streamJson?: boolean`, `verbose?: boolean`, `skipPermissions?: boolean`
- Add `onStreamEvent?: (event: StreamJsonEvent) => void`

Changes to `buildCommand()` (lines 130-161):
- Remove hardcoded `--dangerously-skip-permissions`
- Add it conditionally: only when `skipPermissions !== false` (default: true)
- Add `--output-format stream-json` when `streamJson === true`
- Add `--verbose` when `verbose === true`

Changes to `executeBackground()` (lines 203-256):
- When `streamJson && onStreamEvent`, create `StreamJsonParser` and feed stdout chunks to it
- Still accumulate raw stdout in buffer (needed for `ClaudeBackgroundResult`)
- Call `parser.flush()` on process close

**File:** `packages/flow-engine/src/processing/ClaudeLauncher.test.ts` — Update tests

### 5. Modify `StepRunner.executeModelStep()` — Wire streaming to StepTrace

**File:** `packages/flow-engine/src/executor/StepRunner.ts`

Changes to `StepRunnerConfig`:
- Add `executionConfig?: ExecutionConfig`

Changes to `executeModelStep()` (lines 227-300):
- Read `streamJson`/`verbose`/`skipPermissions` from `this.config.executionConfig` (defaulting all to true)
- Create `StreamEventMapper` and initialize `stepTrace.liveLogEntries = []`
- Pass `onStreamEvent` callback that maps events and appends to `stepTrace.liveLogEntries`
- Capture final `result` event's `.result` text for `OutputExtractor` (instead of raw NDJSON stdout)
- When stream-json is active: `stepTrace.response = finalResultText` (clean text, not NDJSON)

### 6. Modify `FlowExecutor.execute()` — Pass execution config to StepRunner

**File:** `packages/flow-engine/src/executor/FlowExecutor.ts` (lines 114-121)

When creating StepRunner at line 114, add `executionConfig: options.flow.execution`:
```typescript
this.stepRunner = new StepRunner({
  interactive: this.stepRunner['config'].interactive,
  claudeEnv,
  onClaudeProcessStarted,
  interventionHandler,
  flowRegistry: this.flowRegistry,
  flowExecutor: this,
  executionConfig: options.flow.execution, // NEW
});
```

### 7. Modify backend `TasksService.getTaskLogs()` — Convert liveLogEntries to LogEntry

**File:** `packages/web-backend/src/services/TasksService.ts` (lines 651-722)

After existing stderr block (line 721), add conversion of `step.liveLogEntries`:
```typescript
if (step.liveLogEntries?.length) {
  for (const entry of step.liveLogEntries) {
    allLogs.push({
      id: `${taskId}-${step.stepId}-live-${logCounter++}`,
      timestamp: entry.timestamp,
      level: entry.level as LogLevel,
      message: entry.message,
      stepId: step.stepId,
      stepName: step.stepName,
      stepType: step.stepType,
      metadata: { ...entry.metadata, eventType: entry.eventType, source: 'stream-json' },
    });
  }
}
```

When `liveLogEntries` is present, skip the legacy `"Response: ..."` and `"stdout: ..."` log entries (they'd be redundant — the stream events contain much more detail).

### 8. Modify frontend `LogEntry.tsx` — Visual distinction for tool calls

**File:** `packages/web-frontend/src/app/pages/tasks/components/LogEntry.tsx`

Add conditional rendering based on `metadata.eventType`:
- `tool_use`: Replace warning icon with wrench icon (`🔧`), show tool name in bold
- `tool_result`: Show with collapsible output preview
- `assistant_text`: Standard info rendering (already handled by `info` level)
- `result`: Show with cost/turns summary styling

### 9. Modify frontend `FlowSettingsDialog.tsx` — Add execution config toggles

**File:** `packages/web-frontend/src/app/pages/flows/flow-editor/FlowSettingsDialog.tsx`

Add a new "Execution" section with three toggles (Switch components):
- "Stream JSON output" → `execution.streamJson` (default: on)
- "Verbose logging" → `execution.verbose` (default: on)
- "Skip permissions" → `execution.skipPermissions` (default: on, with warning tooltip)

Update `handleSave()` to include `execution` in the saved payload.

## How the Real-Time Pipeline Works

```
ClaudeLauncher.executeBackground()
  │ stdout.on('data') → StreamJsonParser.feed(chunk)
  │                        └→ onEvent(StreamJsonEvent)
  │                             └→ StreamEventMapper.map(event) → LiveLogEntry
  │                                  └→ stepTrace.liveLogEntries.push(entry)
  │                                       ↑ trace object is mutated in-place
  │
  ↓ (existing 500ms timer in FlowWorker)
FlowWorker.sendTraceUpdate()
  │ JSON.stringify(trace) → hash changed? → yes (liveLogEntries grew)
  │   └→ W2O TASK_TRACE_UPDATE message
  │
  ↓ (existing WebSocket pipeline)
OrchestratorEventHandler → writeTrace() → broadcast(B2F_TASK_TRACE_UPDATED)
  │
  ↓ (existing frontend subscription)
TaskDetailStackedPage → appendNewLogs() → GET /api/tasks/:id/logs
  │
  ↓ (backend conversion)
TasksService.getTaskLogs() → liveLogEntries → LogEntry[]
  │
  ↓ (existing rendering)
LogEntry.tsx → renders with eventType-aware styling
```

**No changes needed** to: FlowWorker, FlowOrchestrator, OrchestratorEventHandler, TraceChunkStorage, WebSocket transport, useTaskLogs, TaskDetailStackedPage, LogBuffer. The existing 500ms trace polling + hash-based dedup handles everything.

## Trace Size Mitigation

Each stream event ≈ 200 bytes. A step with 200 tool calls = ~40KB of liveLogEntries on the trace. The 500ms timer serializes the entire trace for hashing. To prevent memory issues:
- Cap `liveLogEntries` to 1000 entries per step (drop oldest `debug` entries first)
- After step completion, optionally compact: keep only `tool_use` and `result` entries, remove `debug` tool_result entries

## File Summary

| File | Action | Description |
|---|---|---|
| `packages/flow-engine/src/types.ts` | Modify | Add `ExecutionConfig`, `LiveLogEntry`, extend `FlowDefinition` and `StepTrace` |
| `packages/flow-engine/src/processing/StreamJsonParser.ts` | **New** | NDJSON line parser with buffering |
| `packages/flow-engine/src/processing/StreamJsonParser.test.ts` | **New** | Parser tests |
| `packages/flow-engine/src/processing/StreamEventMapper.ts` | **New** | Stream event → LiveLogEntry mapper |
| `packages/flow-engine/src/processing/StreamEventMapper.test.ts` | **New** | Mapper tests |
| `packages/flow-engine/src/processing/ClaudeLauncher.ts` | Modify | CLI flags, streaming integration |
| `packages/flow-engine/src/processing/ClaudeLauncher.test.ts` | Modify | Test new flags and streaming |
| `packages/flow-engine/src/executor/StepRunner.ts` | Modify | Wire streaming to StepTrace |
| `packages/flow-engine/src/executor/FlowExecutor.ts` | Modify | Pass `flow.execution` to StepRunner |
| `packages/web-backend/src/services/TasksService.ts` | Modify | Convert liveLogEntries to LogEntry[] |
| `packages/web-frontend/.../LogEntry.tsx` | Modify | Visual distinction for stream events |
| `packages/web-frontend/.../FlowSettingsDialog.tsx` | Modify | Execution config toggles |
| `packages/web-frontend/.../types/flow-engine.types.ts` | Modify | Mirror ExecutionConfig type |

## Verification

1. **Unit tests**: Run `StreamJsonParser.test.ts` and `StreamEventMapper.test.ts`
2. **Unit tests**: Run `ClaudeLauncher.test.ts` with updated assertions
3. **Type check**: `check` skill across monorepo
4. **Integration test**: Create a flow with a model step, execute a task, verify:
   - Log entries appear in the web UI while Claude is still running (not after completion)
   - Tool calls show with amber/wrench styling
   - Assistant text shows progressively
   - Final "Completed" entry shows cost and turns
   - OutputExtractor still correctly extracts variables from the result
5. **Backward compat**: Set `execution.streamJson: false` in a flow, verify behavior matches current (batch output)
6. **Config UI**: Open FlowSettingsDialog, toggle switches, save, verify YAML includes `execution` block
