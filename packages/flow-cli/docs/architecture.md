# flow-cli Architecture

## Component overview

```
┌────────────────────────────────────────────────────────────────────────────┐
│  User terminal                                                             │
│                                                                            │
│  $ flow run my-flow.yml                                                    │
│  $ task new "implement feature X"                                          │
└─────────────────────────────┬──────────────────────────────────────────────┘
                              │  Channel 1: HTTP/1.1 loopback
                              │  (via singleton-daemon-kit)
                              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Daemon process  (~/.flow-daemon/)                                         │
│                                                                            │
│  ┌──────────────────┐  ┌────────────────────┐  ┌──────────────────────┐    │
│  │ CommandHandler   │  │    StepQueue       │  │    WorkerPool        │    │
│  │                  │─►│                    │─►│                      │────┼──►
│  │ - handleRun()    │  │ - enqueueExecution │  │ - spawnWorker()      │    │
│  │ - tryDispatch()  │  │ - dequeue()        │  │ - getIdleWorker()    │    │
│  │                  │  │ - injectSteps()    │  │ - registerWorker()   │    │
│  └────────┬─────────┘  │ - onStepCompleted()│  │ - markBusy()         │    │
│           │            │ - onStepFailed()   │  └──────────────────────┘    │
│           │            └────────────────────┘    Channel 2 (WebSocket)     │
│           │                                       port: HTTP_PORT + 1      │
│  ┌────────▼──────────┐  ┌──────────────────────┐                           │
│  │  ExecutionStore   │  │      LogWriter        │                          │
│  │                   │  │                       │                          │
│  │ executions/*.json │  │ logs/YYYY-MM-DD.ndjson│                          │
│  │ - create()        │  │ - write()             │                          │
│  │ - markRunning()   │  │ - writeExecution()    │                          │
│  │ - markCompleted() │  │ - rotate()            │                          │
│  │ - pruneOldExec()  │  └──────────────────────┘                           │
│  └───────────────────┘                                                     │
│                                                                            │
│  ┌─────────────────────────┐  events: onFlowStart / onFlowEnd / onFlowError│
│  │ HookDispatcher          │         onStepStart / onStepEnd / onStepFailed│
│  │ - dispatch(event)       │         onTaskCreated / onStatusChange        │
│  │ - type: cli  (execFile) │                                               │
│  │ - type: http (fetch)    │                                               │
│  └─────────────────────────┘                                               │
└────────────────────────────────────────────────────────────────────────────┘
                              │  WebSocket  ws://127.0.0.1:WS_PORT
                              ▼
┌────────────────────────────────────────────────────────────────────────────┐
│  Worker process  (one per concurrent step)                                 │
│                                                                            │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────────────────┐    │
│  │ Worker.ts        │  │  StepExecutor    │  │      McpServer         │    │
│  │ (WS entry point) │─►│                  │─►│                        │    │
│  │                  │  │ - executeScript()│  │ port: random (OS)      │    │
│  │ → send ready     │  │ - executeModel() │  │ tool: provideSteps     │    │
│  │ ← receive assign │  │                  │  │ JSON-RPC 2.0 over HTTP │    │
│  │ → step_completed │  └──────────────────┘  └────────────┬───────────┘    │
│  │ → send ready     │                                      │ --mcp-config  │
│  └──────────────────┘                                      ▼               │
│                                              ┌──────────────────────┐      │
│                                              │   Claude process     │      │
│                                              │   claude -p          │      │
│                                              │   --mcp-config <f>   │      │
│                                              │   --output-format    │      │
│                                              │     stream-json      │      │
│                                              └──────────────────────┘      │
└────────────────────────────────────────────────────────────────────────────┘
```

## Communication channels

### Channel 1 — CLI ↔ Daemon (HTTP/1.1)

Managed by `singleton-daemon-kit`. Port discovered from `~/.flow-daemon/config.port`.

```
CLI                                        Daemon
 │                                            │
 │─── POST /run { flowFile, inputs } ────────►│
 │                                            │── enqueue execution
 │◄── { type: 'execution_started',            │
 │      executionId: "abc12345" } ────────────│
 │                                            │
 │  exit(0)                                   │  (continues running)
```

If the daemon is not running, the CLI process **becomes** the daemon inline via `createDaemon()`, then sends the command to itself over the now-running HTTP server.

### Channel 2 — Daemon ↔ Worker (WebSocket)

Workers connect to `ws://127.0.0.1:WS_PORT` (loopback only — never exposed to the network).

```
Daemon                                       Worker
  │                                            │
  │◄──────── WS connect ───────────────────────│
  │◄──────── { type: 'ready', pid } ───────────│
  │                                            │
  │──────── { type: 'assign',                  │
  │           stepId,                          │
  │           stepConfig,                      │
  │           executionContext } ─────────────►│
  │◄──────── { type: 'log',                    │
  │            executionId, stepId,            │
  │            entry } ────────────────────────│  (0..N streaming)
  │◄──────── { type: 'step_completed',         │
  │            executionId, stepId,            │
  │            output } ───────────────────────│
  │◄──────── { type: 'ready' } ────────────────│  (loop back)
  │                                            │
  │──────── { type: 'done' } ─────────────────►│
  │                                            │  close WS → exit(0)
```

Step injection travels back on this channel:

```
Worker ──── { type: 'inject_steps', executionId, steps } ────► Daemon
```

### Channel 3 — Worker ↔ Claude (MCP / JSON-RPC 2.0)

For `model` steps only. Claude is launched with `--mcp-config` pointing to the worker's per-execution HTTP server on a random loopback port.

```
McpServer (Worker)                      Claude subprocess
       │                                        │
       │◄─── POST /mcp                          │
       │      { method: 'initialize' } ─────────│
       │──── { protocolVersion,                 │
       │       capabilities,                    │
       │       serverInfo } ───────────────────►│
       │                                        │
       │◄─── POST /mcp                          │
       │      { method: 'tools/list' } ─────────│
       │──── { tools: [provideSteps] } ────────►│
       │                                        │
       │◄─── POST /mcp                          │
       │      { method: 'tools/call',           │
       │        name: 'provideSteps',           │
       │        arguments: { steps } } ─────────│
       │──── { content: [{                      │
       │        type: 'text',                   │
       │        text: '{"injected":[...]}'}]} ─►│
```

After `provideSteps` succeeds, McpServer sends `inject_steps` to the Daemon via Channel 2.

## Worker lifecycle

```
spawn
  │
  ▼
connect WebSocket  ws://127.0.0.1:WS_PORT
  │
  ▼
send { type: 'ready', pid }
  │
  ▼
  ┌─────────────────────────────────────────────────────────────────────┐
  │  receive { type: 'assign', stepId, stepConfig, executionContext }   │
  │    │                                                                │
  │    ├─ type: 'script' ──► ScriptExecutor.execute()                   │
  │    │                      isolateEnv: true  (no env inherited)      │
  │    │                                                                │
  │    └─ type: 'model'  ──► McpServer.start()                          │
  │                          ClaudeLauncher.launchBackground()          │
  │                          McpServer.stop()   (always, in finally)    │
  │    │                                                                │
  │    ▼                                                                │
  │  send { type: 'step_completed', executionId, stepId, output }       │
  │   or { type: 'step_failed',    executionId, stepId, error }         │
  │    │                                                                │
  │    ▼                                                                │
  │  send { type: 'ready' }                                             │
  │    │                                                                │
  │    ├─ receive 'assign' ──► loop back to top                         │
  │    └─ receive 'idle'   ──► wait for next assign  [v2: not yet sent] │
  └─────────────────────────────────────────────────────────────────────┘
  │
  ▼
receive { type: 'done' }
  │
  ▼
close WebSocket → exit(0)
```

## Step dependency tracking (StepQueue)

Example: A has no deps. B and C both depend on A. D depends on both B and C.

```
                    ┌──► B ──┐
A ──────────────────┤        ├──► D
                    └──► C ──┘

Dependency sets at start:
  A: {}        ← ready immediately → enqueued
  B: { A }
  C: { A }
  D: { B, C }

On A completed:
  B: {}        ← ready → enqueued
  C: {}        ← ready → enqueued
  D: { B, C }

On B completed:
  D: { C }

On C completed:
  D: {}        ← ready → enqueued
```

## Execution state machine

```
                        ┌──────────────────────────────────────────┐
                        │           any step fails                 │
                        │                                          ▼
queued ─── first step ──►  running ──────────────────────────────► failed
           assigned                │
                                   │  all steps completed
                                   ▼
                               completed

Other statuses:
  re-queued  — reserved for v2 crash recovery (not used in v1)

Pre-execution rejections (returned immediately to CLI, no state file created):
  user_intervention step found → error UNSUPPORTED_STEP_TYPE
  workspace.mode: isolated      → error UNSUPPORTED_OPERATION
```

Step states: `pending` → `running` → `completed | failed`

## Daemon shutdown sequence (D13)

```
1. Worker sends step_completed
2. Worker sends ready
3. Daemon evaluates:
     StepQueue.isEmpty()              (no steps waiting)
     AND !StepQueue.hasActiveExec()   (no in-progress executions)
     AND !WorkerPool.hasActiveWorkers (no busy workers)
   → all true:
       WorkerPool.broadcastDone()     (sends 'done' to ALL registered workers)
       daemonHandle.stop('idle')
4. Workers receive done → close WebSocket → exit(0)
5. Daemon process exits
```

Note: `broadcastDone()` sends to all registered workers, not only idle ones. A worker receiving `done` while processing a step will see it only after its current WS message handler returns.

## Secret handling

> **v1 note:** `SecretProvider` and `LogMasker` are implemented and tested but not yet wired into step execution. Secret resolution and log masking are deferred to v2 (D31). See `docs/threat-model.md` for consequences.

```
SecretProvider.resolve(uri)
  │
  ├─ "env://NAME"        → process.env[NAME]
  ├─ "file://./rel"      → fs.readFileSync(resolve(workspaceDir, rel)).trim()
  │                         path traversal blocked: resolved path must be
  │                         within workspaceDir (path.relative() check)
  ├─ "input://name"      → inputs[name]
  ├─ "value://..."       → throw SecretResolutionError  (always forbidden)
  └─ unknown scheme      → throw SecretResolutionError
  │
  ▼
Secret { #value }  (private field — inaccessible from outside)
  │
  ├─ .use()           → "actual-value"    (only explicit call returns plaintext)
  ├─ String(secret)   → "[REDACTED]"
  ├─ JSON.stringify   → "[REDACTED]"
  └─ `${secret}`      → "[REDACTED]"


LogMasker.register("actual-value")
  → registers 6 regex patterns covering all encoding variants:
      raw           "actual-value"
      base64-nopad  "YWN0dWFsLXZhbHVl"
      base64-off1   "Y3R1YWwtdmFsdWU"      (slice from byte offset 1)
      base64-off2   "dHVhbC12YWx1ZQ"       (slice from byte offset 2)
      base64url     "YWN0dWFsLXZhbHVl"
      hex           "61637475616c2d76616c7565"

LogMasker.mask("Bearer YWN0dWFsLXZhbHVl")
  → "Bearer [REDACTED]"
```

Values shorter than 4 characters are not registered (too short to mask reliably).

## Files on disk

```
~/.flow-daemon/                            (daemon home)
  config.port                              HTTP port bound by daemon
  config.pid                               daemon PID
  executions/
    abc12345.json                          one file per execution
    def67890.json
  logs/
    2026-08-09.ndjson                      one file per calendar day
    2026-08-08.ndjson                      all executions multiplexed

~/.flow-config.yaml                        (optional, user-global daemon config)

.flows/                                    (project-local, gitignored)
  config.yml                               hooks, defaults, execution config
  tasks/
    index.json                             task summary array
    abc12345.json                          one file per task (full record)
```

### Execution state file schema

```json
{
  "executionId": "abc12345",
  "flowFile": "/path/to/flow.yml",
  "flowId": "my-flow",
  "status": "completed",
  "currentSteps": [],
  "startedAt": "2026-08-09T10:00:00.000Z",
  "completedAt": "2026-08-09T10:00:05.123Z",
  "steps": {
    "greet": {
      "status": "completed",
      "startedAt": "2026-08-09T10:00:00.100Z",
      "completedAt": "2026-08-09T10:00:05.000Z",
      "iterations": 1
    }
  }
}
```

Status values: `queued` | `running` | `completed` | `failed` | `re-queued`

### Log line schema (NDJSON)

```json
{ "prefix": "[abc12345|greet]",        "timestamp": "...", "level": "info",  "message": "..." }
{ "prefix": "[abc12345|__execution]",  "timestamp": "...", "level": "info",  "message": "Execution completed" }
{ "prefix": "[abc12345|__execution]",  "timestamp": "...", "level": "error", "message": "Step greet failed: ..." }
```

`__execution` is the reserved stepId for flow-level lifecycle events (not tied to any step).
Rotation: keep last `min(retainDays, 120)` daily files. Default retainDays: 30.
