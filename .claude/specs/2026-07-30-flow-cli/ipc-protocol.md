# IPC Protocol

Two separate communication channels exist. They must not be confused.

## Channel 1 — CLI↔Daemon (singleton-daemon-kit, HTTP/1.1 loopback)

Used by: human callers, agent callers. Workers use Channel 1 only for crash recovery fallback (v2 only, D23/D34).

Transport: TCP `127.0.0.1`, plain HTTP/1.1 with JSON bodies. Port discovered from `~/.flow-daemon/config.port`. Auth: `Authorization: Bearer <token>` from `~/.flow-daemon/health_token`.

### CLI → Daemon commands

```typescript
type ClientCommand =
  | { type: 'run'; flowFile: string; flowId?: string; inputs?: Record<string, string>; quiet?: boolean; cwd: string }
  // cwd: caller's process.cwd() — used by daemon to resolve relative flowFile paths and default workspace
  // v2 only — not implemented in v1 (crash recovery deferred, D34)
  // | { type: 'worker-register'; executionId: string; stepId: string; pid: number }
  // { type: 'stop' } — deferred to v2 (D34)
```

**`quiet` field:** client-side only. Controls whether the CLI prints the execution ID to stdout after `flow run`. No server-side effect — the daemon processes the command identically regardless of this flag.

**`worker-register` (Channel 1 fallback only):** This command is used exclusively during crash recovery (D23). In normal operation, workers connect directly via Channel 2 (WebSocket). `stepId` is the step the worker was executing when the crash occurred — used by the daemon for re-adoption. In normal operation, only the WebSocket `ready` message (Channel 2) is used.

### Daemon → CLI responses

```typescript
type DaemonResponse =
  | { type: 'execution_started'; executionId: string }
  | { type: 'error'; message: string; code: string }
```

**Note:** `attach`, `logs`, and `list` are NOT daemon commands. They are pure file operations (D19, D21) — the CLI reads `~/.flow-daemon/logs/` and `~/.flow-daemon/executions/` directly without contacting the daemon.

---

## Channel 2 — Worker↔Daemon (WebSocket)

Workers use Channel 2 exclusively in normal operation. Channel 1 is only used during crash recovery fallback (D23).

Used by: worker processes only. Independent of the SDK.

Transport: WebSocket on a separate port from the daemon's HTTP server. Workers connect on spawn; reconnect via CLI binary fallback if connection drops (D23).

**Port discovery:** The WebSocket port is passed to the worker as the `FLOW_WS_PORT` environment variable at spawn time. Default: HTTP port + 1. This port is also present in the daemon config schema as `worker.wsPort`.

### Daemon → Worker messages

```typescript
type DaemonToWorker =
  | { type: 'assign'; stepId: string; stepConfig: FlowStep; executionContext: ExecutionContext }
  // FlowStep = ModelFlowStep | ScriptFlowStep | SubFlowStep from flow-engine/src/types.ts
  | { type: 'idle' }   // no ready steps right now, worker waits
  | { type: 'done' }   // no more steps, worker should exit
```

### Worker → Daemon messages

```typescript
type WorkerToDaemon =
  | { type: 'ready'; pid: number }   // no executionId — worker is execution-agnostic at spawn (D16)
  | { type: 'log'; executionId: string; stepId: string; entry: LiveLogEntry }
  // LiveLogEntry from flow-engine/src/types.ts — NOT LogEntry (that name doesn't exist)
  | { type: 'step_completed'; executionId: string; stepId: string; output: Record<string, any> }
  // output: extracted runtime values, e.g. { pr_url: "https://...", branch: "feat/x" }
  // NOT StepOutput from flow-engine — that is an output schema declaration, not runtime values
  | { type: 'step_failed'; executionId: string; stepId: string; error: string }
```

No heartbeat message type — WebSocket connection health is the liveness signal (D3, D23).

---

## Shared types

Types from `flow-engine/src/types.ts`:
- `LiveLogEntry` — single log line from a step execution (line 711)
- `FlowStep` — union `ModelFlowStep | ScriptFlowStep | SubFlowStep` (line 669)
- `StepOutput` (line 413) is an output *schema* declaration — NOT used in IPC messages

CLI-specific types (defined in `packages/flow-cli/src/ipc/Protocol.ts`):
- `ExecutionContext` — `{ executionId, inputs, stepOutputs, workspaceDir }` — NOT `FlowExecutionContext` from flow-engine
