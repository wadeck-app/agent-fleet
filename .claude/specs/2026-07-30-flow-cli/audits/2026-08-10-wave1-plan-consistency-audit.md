# Plan Consistency Audit — Wave 1 (2026-08-10)

## Findings

### F1 — D34: `FILE_NOT_FOUND` → `FLOW_NOT_FOUND` (Fixed)
**File:** `src/daemon/CommandHandler.ts`
**Problem:** Spec lists `FLOW_NOT_FOUND` as the error code; code used `FILE_NOT_FOUND`.
**Fix:** Renamed to `FLOW_NOT_FOUND`.

### F2 — D32: CLI hook context delivered as JSON arg, not env vars (Fixed)
**File:** `src/hooks/HookDispatcher.ts`
**Problem:** Spec says "Task context passed as env vars: `TASK_ID`, `TASK_STATUS`, `TASK_DESCRIPTION`, `TASK_FILE`." Code appended JSON as positional argument.
**Fix:** `sendCliHook()` now converts payload to `UPPER_SNAKE_CASE` env vars via `execFileAsync(cmd, args, { env: {...process.env, ...envVars} })`.

### F3 — D32: HTTP hook payload missing `description` and `taskFile` (Fixed)
**File:** `src/cli/TaskIndex.ts`
**Problem:** `onTaskCreated` dispatched `{ taskId, title, status }` — missing `description` and `taskFile`.
**Fix:** Now dispatches `{ taskId, status, description, taskFile: path.join(tasksDir, task.id + '.json') }`.

### F4 — D37: Task hooks read from wrong config path (Fixed)
**File:** `src/cli/TaskIndex.ts`
**Problem:** Read `raw['hooks']` (flow hooks) instead of `raw['tasks']['hooks']` (task hooks).
**Fix:** Now reads `(raw['tasks'] as Record)?.['hooks']`.

### F5 — D31: LogMasker byte-offset algorithm incorrect (Fixed)
**File:** `src/secrets/LogMasker.ts`
**Problem:** Used `buf.subarray(2/3)` (tail of secret) instead of spec's `Buffer.concat([null, raw]).slice(2/3)` (secret at byte offset 1/2 in a blob).
**Fix:** Implemented spec's prepend-null-byte approach.

### F6 — D36: `maxChildDepth` not enforced (Documented deferred v2)
**File:** `src/daemon/StepQueue.ts`
**Comment added:** `// D36: maxChildDepth (default: 10) is not yet enforced. Tracked for v2.`

### F7 — D31: `vars:` block not implemented (Documented deferred v2)
**File:** `src/worker/StepExecutor.ts`
**Comment added:** `// D31: vars: block is not yet resolved. ${{ vars.name }} will be undefined in v1.`

### F8 — D32: per-listener `on-failure` not configurable (Documented deferred v2)
**File:** `src/hooks/HookDispatcher.ts`
**Comment added:** `// D32: per-listener on-failure behavior (fail-task) is not implemented in v1.`

### F9 — D27: secret URI validation labeled v2 (Comment corrected)
**File:** `src/cli/RunCommand.ts`
**Problem:** Comment said "tracked for v2" but D34 explicitly lists D27 as v1 scope.
**Fix:** Comment updated to say "v1 scope, not yet implemented".

### F10 — `re-queued` unreachable in v1 (Documented)
**File:** `src/ipc/Protocol.ts`
**Comment added:** `// 're-queued' is reserved for v2 crash recovery (D12). Unreachable in v1.`

### F11 — exit 3 for YAML parse errors (Documented intentional extension)
**File:** `src/validation/FlowValidator.ts`
**Comment added:** Explains exit 3 is an intentional extension beyond D34's exit 1/2, distinguishing YAML parse from semantic validation errors.
