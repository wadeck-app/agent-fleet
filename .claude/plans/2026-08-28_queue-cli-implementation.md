# Plan: Queue CLI Implementation

**Date:** 2026-08-28
**Spec:** `.claude/specs/2026-08-28_10-26_queue-cli/`
**Status:** Draft

---

## Pre-requisites

- `@wadeck/orchestrator` must ship `--once --delay` before Phase 3 (retry scheduling)
- All other phases can start without it

---

## Phase 0 — `@wadeck/orchestrator`: add one-shot delayed jobs

**Repo:** `C:/Workspace_Tooling/scrapers/`
**Blocks:** Phase 3 (D-33)

- [ ] Add `type: 'once'` to `Job` type in `src/types.ts`
- [ ] Add `delayMs: number` field (parsed from `--delay <duration>` flag, e.g. `2m`, `1h`)
- [ ] Scheduler: execute once after delay, then auto-remove from registry
- [ ] CLI: `orch add --once --delay <duration> "<command>"`
- [ ] `orch list-jobs` shows one-shot jobs with `remainingMs`
- [ ] One-shot jobs persist to `registry.json` with `scheduledAt` timestamp. On orch startup, re-arm one-shot jobs with remaining delay = `delayMs - (now - scheduledAt)`. If remaining delay < 0, fire immediately.
- [ ] Tests: one-shot fires once, does not repeat, is removed from registry after execution
- [ ] Publish updated `@wadeck/orchestrator`

---

## Phase 1 — `@wadeck/queue-cli`: project scaffold + WAL + daemon skeleton

**New repo:** `C:/Workspace_Tooling/queue-cli/` (own repo, published as `@wadeck/queue-cli`)

### 1a — Project setup
- [ ] `package.json` with `@wadeck/shared-cli`, `@wadeck/singleton-daemon-kit`, `jsonpath-plus`
- [ ] `tsconfig.json`, esbuild config, Go launcher (same pattern as flow-cli)
- [ ] `~/.config/queue/` config dir via `ConfigDir` from shared-cli
- [ ] `UpdateManager` wired (same pattern as flow-cli)

### 1b — Storage layer
- [ ] `Wal.ts`: append-only NDJSON, atomic writes (write to `.tmp` + `renameSync`)
  - Entry schema: `{id, timestamp, event, payload, meta, subscriberId, status: 'pending'|'acked'|'failed', attempts, lastError?, ackedAt?}`
  - Owner-only file permissions (D-30)
- [ ] `DlqStore.ts`: NDJSON, bounded by `maxDlqSize` (default 1000, oldest pruned with warn)
  - Entry schema: `{id, event, payload, meta, subscriberId, attempts, lastError, movedAt}`
- [ ] `EventLogger.ts`: NDJSON daily log, `~/.config/queue/logs/YYYY-MM-DD.ndjson`
  - Entry schema: `{id, timestamp, event, meta, mode: 'async'|'sync', dispatches: [{subscriberId, status, durationMs, error?, filterMatch: bool}]}`

### 1c — Daemon skeleton
- [ ] `Daemon.ts` via `singleton-daemon-kit`, port `47910` (verify against other daemons in workspace)
- [ ] Auto-shutdown after 1 min of inactivity (no pending WAL entries + no active dispatches)
- [ ] Startup scan: on start, scan WAL for `pending` entries with no scheduled orch job → re-schedule
- [ ] Shutdown scan: before exit, scan WAL for `pending` entries → register orch one-shot for each using `execFileSync` (not async) to ensure registration completes before process exits
- [ ] RPC protocol (local socket): `push`, `retry`, `status`, `list-subscribers`, `dlq-*`, `logs`
- [ ] Define `QueueCommands` type map with full request/response shapes for each RPC command:
  - `push({event, payload, timeout?}) → {status, result?}`
  - `retry({eventId}) → {status}`
  - `status() → {pendingCount, dlqCount, daemonStatus}`
  - `list-subscribers({event?}) → {subscribers[]}`
  - `dlq-list() → {entries[]}`
  - `dlq-replay({id}) → {status}`
  - `dlq-clear({id?}) → {cleared: number}`
  - `logs({follow?}) → stream`
- [ ] Suppress idle-shutdown when WAL has pending entries: call `idleTimer.reset()` on each WAL non-empty check (every 10s). Idle timer only counts down when `wal.pendingCount() === 0 && activeDispatches === 0`.

---

## Phase 2 — Config loading + dispatch engine

### 2a — Config
- [ ] `ConfigLoader.ts`: load `~/.config/queue/subscribers.yml` (global) + `.queue/subscribers.yml` (project)
- [ ] Merge strategy: APPEND for same event (D-34)
- [ ] `meta.projectName` resolution: walk up from cwd looking for `.queue/` folder; use folder name as projectName if found, else undefined
- [ ] `subscribers.yml` schema (validated with zod or equivalent):
  ```yaml
  subscribers:
    "event.name":           # exact or wildcard
      - type: cli | http
        command: string      # cli only
        url: string          # http only
        method: POST         # http only, default POST
        headers: {}          # http only
        timeout: 30s         # default 30s
        retries: 5           # default 5
        backoff: exponential # default
        when: string         # optional filter (dot-notation or JSONPath)
  ```

### 2b — Event name matching
- [ ] `EventMatcher.ts`: exact match, `*` (single segment), `**` / `>` (any depth)

### 2c — Payload filtering
- [ ] `PayloadFilter.ts`:
  - dot-notation: `meta.projectName=agent-fleet` (string), `exitCode=1` (numeric coercion)
  - JSONPath: `$.meta.projectName == "agent-fleet"` via `jsonpath-plus`
  - Log match AND miss with `{subscriberId, filter, result: 'match'|'miss'}`

### 2d — Dispatch engine
- [ ] `AsyncDispatcher.ts`: `onXxx` — parallel dispatch, each subscriber independent
- [ ] `SyncDispatcher.ts`: `beforeXxx` — sequential waterfall
  - Each subscriber receives `payload` field from previous response (not the wrapper)
  - Empty stdout = pass-through with original payload (D-24)
  - Invalid JSON on stdout = abort with reason `"subscriber returned invalid JSON"` (D-24)
  - Timeout = abort with reason `"subscriber timeout after Xs"` (D-22)
- [ ] `CliTransport.ts`: spawn command, pipe payload JSON to stdin, read stdout, timeout
- [ ] `HttpTransport.ts`: POST JSON body, read response body, timeout

---

## Phase 3 — Retry + DLQ (requires Phase 0)

- [ ] `RetryScheduler.ts`: on dispatch failure, call `orch add --once --delay <backoff> "queue retry --event <id>"`
  - Pre-condition check: if `orch` not found → hard error with message (D-9)
  - Self-healing: each `queue retry` re-registers next attempt before dispatching (D-25)
- [ ] Backoff: per-subscriber config, default exponential (1m, 2m, 4m, 8m, 16m)
- [ ] After `maxRetries` exhausted: move WAL entry to DLQ
- [ ] `queue retry --event <id>`: manual replay from WAL or DLQ
- [ ] Shutdown scan uses `execFileSync` (not async) for orch calls to ensure all retry jobs are registered before daemon exits (M-02)

---

## Phase 4 — CLI commands

- [ ] `queue push <event> <json> [--timeout <duration>]`
  - Daemon auto-start: checks `client.isRunning()`, if false spawns daemon and waits for ready signal (up to 5s timeout). Implement as `DaemonClient.ensureRunning()`.
  - Sends RPC to daemon
  - `beforeXxx`: blocks, returns exit 0 (continue) or exit 1 + error message (abort)
  - `onXxx`: returns immediately after WAL write confirmed
- [ ] `queue status` — pending WAL count, DLQ count, daemon status, orch connectivity
- [ ] `queue list-subscribers [event]` — show resolved subscribers for an event (global + project merged)
- [ ] `queue dlq list` — list DLQ entries
- [ ] `queue dlq replay --id <id>` — re-dispatch a DLQ entry
- [ ] `queue dlq clear [--id <id>]` — remove DLQ entries
- [ ] `queue retry --event <id>` — manual retry of a WAL pending entry
- [ ] `queue start / stop / status` — daemon lifecycle
- [ ] `queue logs [--follow]` — tail the NDJSON log (formatted output); use `fs.watch` on Windows

---

## Phase 5 — Distribution

- [ ] esbuild bundle (`dist/index.js`)
- [ ] Go launcher (`launcher-go/`, builds `queue.exe` / `queue_darwin_*`)
- [ ] Platform packages (`@wadeck/queue-cli-win32-x64`, etc.)
- [ ] GitLab CI pipeline: build → test → publish
- [ ] `@wadeck/shared-cli` `UpdateManager` integration
- [ ] README with install + quickstart

---

## Phase 6 — Producer integrations

Each integration is independent and can be done in parallel after Phase 4 ships.

| Producer | Change | Notes |
|---|---|---|
| `task-cli` | Replace `HookDispatcher` calls with `queue push onTaskCreated / onStatusChange` | Remove HookDispatcher dependency |
| `flow-cli` | Replace `HookDispatcher` calls with `queue push beforeStepEnd / onFlowEnd / ...` | beforeXxx replaces blocking HTTP hook pattern |
| `@wadeck/orchestrator` | Add native `queue push` calls in `scheduler.ts`: `onJobStarted`, `onJobCompleted`, `onJobFailed` | Separate from Phase 0 `--once --delay` work; after Phase 0 ships |
| `web-backend EventBus` | Remove "internal only" restriction; wire `EventBus.emit()` → `queue push` for all `ticket.*` events | D-32-replacement |
| `wdrive` | Wire `FileEventKind` handlers to `queue push onFileDetected / onFileSynced / ...` | Replaces PowerShell popup for sync.stuck |
| `gemini-generator` | Add `queue push onImageGenerated / onQuotaRateLimited / ...` at generation completion | Manual handoff to image-tooling becomes automatic |
| `image-tooling` | Add `queue push onStepCompleted / onManualStepRequired / onPipelineCompleted` | Pipeline chain automation |
| `violations-framework` | Add `queue push onViolationsCheckCompleted / onViolationRuleFailed` | Gate integration |
| `agent-browser` | Deferred to v2 -- low priority per producers-inventory | Explicitly out of scope for v1 |
| `meta-hooks-flow-cli spec` | Archive / mark superseded in spec index | D-3 |

---

## Implementation order

```
Phase 0 (orch --once --delay)          ─────────────────────────────────────────► (unblocks Phase 3)
Phase 1a-c (scaffold/WAL/daemon)       ──────────────────►
Phase 2 (dispatch engine)                                  ──────────────────►
Phase 3 (retry/DLQ)                                                             ──► (needs Phase 0 + 2)
Phase 4 (CLI stub + RPC plumbing)      ──────────────────►
Phase 4 (CLI dispatch wiring)                              ──► (needs Phase 2)
Phase 5 (distribution)                                                           ──►
Phase 6 (integrations, parallel)                                                      ──►
```

Note: Phase 4 has two sub-parts -- RPC plumbing (CLI → daemon socket, can start with Phase 1) and dispatch wiring (requires Phase 2).

---

## Testing strategy

- Unit tests:
  - WAL atomic writes, concurrent access safety
  - EventMatcher wildcards (`*`, `**`, `>`)
  - PayloadFilter dot-notation + JSONPath
  - SyncDispatcher waterfall: N>1 subscribers, first abort stops chain, subsequent not called (D-13)
  - SyncDispatcher: empty stdout = pass-through with original payload (D-24)
  - AsyncDispatcher parallel dispatch
  - Retry self-healing: startup scan re-schedules pending WAL entries; shutdown scan registers orch one-shots (D-25)
  - DLQ maxDlqSize pruning: oldest entry removed with warn when limit reached (D-29)
  - Filter-miss logging: missed filter produces log entry with envelope, no payload body (D-11/D-31)
  - Idle timer: daemon does not shut down while WAL has pending entries
- Integration tests: full `queue push → dispatch → WAL ack` cycle with mock CLI subscriber
- Integration tests: `beforeXxx` abort chain, timeout behavior
- No real orch/external dependencies in automated tests (mock orch binary)
- Coverage target: >70% all classes, >90% dispatch engine (business logic)
