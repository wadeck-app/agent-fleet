# Architecture Decisions

## V1 scope

v1 ships the minimum to execute the scenario: `task new` → elaborate → review → execute.

**In scope for v1:** D1-D11, D13-D18, D20-D22, D25, D27, D29-D39
**Deferred to v2:** D12 (crash recovery), D19 (observation commands), D23-D24 (worker reconnection), D26 (subflow expansion), D28 (flow cancel)

---

## D1 -- One binary, two roles (client and daemon)

The `flow` binary is always the same executable. On invocation, it checks whether a daemon is already running:

- If yes: acts as a thin client, forwards the command to the daemon, exits immediately after receiving the execution ID.
- If no: calls `createDaemon()` inline -- the current process becomes the daemon -- then processes the command.

**Why:** No separate install, no daemon management ceremony. Same pattern as `ssh-agent`, Bazel, Buck2.

## D2 -- CLI exits immediately after sending command

The CLI sends the command to the daemon, receives an execution ID, and exits. It does not stay alive to stream logs.

**Why:** The daemon owns the execution. The caller's lifetime must not affect flow execution. A long-running flow cannot be coupled to a terminal session.

To observe a running execution: `flow attach <execution-id>` -- pure file tail, no daemon connection needed (D19). Deferred to v2 (D34).

## D3 -- Worker liveness is signaled by WebSocket connection health, not heartbeats

The daemon detects worker failure via WebSocket connection close events. No separate heartbeat messages are sent. The CLI sends no heartbeats -- it exits immediately after sending a command (D2).

**Why:** D23 (WebSocket worker↔daemon channel) makes explicit heartbeats redundant. Connection close = immediate liveness signal, faster and simpler than a heartbeat timeout.

## D4 -- Execution workers are child processes, not threads

Workers are independent OS processes spawned by the daemon via `child_process.spawn()`.

**Why:** A thread cannot be cleanly killed if the Claude subprocess it owns hangs. A child process can be killed via SIGKILL on its process group. SIGKILL is used for immediate termination -- steps are idempotent where retry is expected, so graceful cleanup is not required. Worker isolation also prevents a crashed step from destabilizing the daemon.

This is not configurable. Threads are a footgun under Claude subprocess timeout scenarios.

## D5 -- Single queue, concurrency configured globally

One queue, one concurrency limit. The limit is the worker pool size -- number of steps that can run simultaneously across all active flow executions.

**Configuration:** `~/.flow-config.yaml`

```yaml
queue:
    concurrency: 1 # default
```

**Why:** Starting simple. Multiple queues add topology complexity with no demonstrated need.

## D6 -- Flow file is passed explicitly at invocation time

No discovery, no registry, no daemon-side file watching.

```
flow run ./my-flow.yml           # single flow in file
flow run ./flows.yml my-flow-id  # multiple flows, explicit ID
```

The client passes the file path (and optional ID) to the daemon. The daemon reads the file at execution time.

**Why:** Explicit over implicit. The daemon holds no file state. Any invocation is fully self-described.

## D7 -- WorkspaceProvider is an abstracted interface

`WorkspaceProvider` is an interface with `prepare(flowDef): workspaceDir` and `cleanup()`.

The CLI ships a `DeclaredWorkspaceProvider` that resolves the workspace from the flow definition or a `--workspace` flag. If a flow declares `workspace.mode: isolated` or a git strategy, and the CLI provider does not support it, it throws -- no silent degradation.

**Why:** The flow YAML controls where the agent executes, not the directory from which the CLI was invoked. CWD is irrelevant to execution. The abstraction allows a full `WorkspaceManager` implementation to be plugged in later without changing the engine.

## D8 -- InterventionHandler is an abstracted interface

`InterventionHandler` already exists in `flow-engine/src/executor/InterventionHandler.ts`.

The CLI implementation throws `UnsupportedOperationError` for any intervention request.

**Why:** `user_intervention` steps require a UI or interactive channel. The CLI has neither. Fail fast rather than silently skipping blocking interventions.

## D9 -- Log output format is context-aware

- TTY detected → human-readable
- No TTY (piped, agent) → JSON
- `--json` flag forces JSON explicitly
- `--quiet` suppresses all streaming output; only the execution ID is returned

**Why:** Same binary serves humans and agents. Output format should require no explicit flag in the common case.

## D10 -- Log lines prefixed `[executionId|stepId]` -- superseded by D20

See D20.

D20 is a strict superset of D10, adding the `__execution` reserved step ID and terminal-state-as-log-line behavior. No contradiction.

## D11 -- ~~Execution workers model: child process with fork() IPC and heartbeat~~

**Superseded by D23.** Original design: workers spawned via `child_process.fork()`, communicating over Node.js IPC channels, with explicit heartbeat messages to detect liveness.

**Superseded because:** A new daemon process cannot re-attach to `fork()` IPC channels from a previous process, making crash recovery impossible. WebSocket reconnection works across daemon restarts because workers always initiate the connection.

## D12 -- Idempotency is declared per-step, not per-flow _(v2 -- deferred)_

```yaml
steps:
    - id: generate-pr
      type: model
      idempotent: false # default -- creating a PR twice is a side effect
      onFailure:
          goto: review-step
          maxIterations: 3
      prompt: '...'

    - id: run-tests
      type: script
      idempotent: true # safe to re-run -- tests produce the same result
      script: npm test
```

When the worker WebSocket connection closes unexpectedly mid-step, the daemon inspects the step that was running:

- `idempotent: true` → daemon re-runs that step from scratch (same execution ID, step retried)
- `idempotent: false` (default) → execution moves to FAILED; no automatic retry

**`onFailure.goto` is orthogonal:** `onFailure.goto` is flow-control on clean failure (step ran and returned an error). `idempotent` is crash recovery (step was killed before it could report any result). Both can coexist on the same step. `onFailure` takes precedence for clean failures.

**`maxIterations`** on a step bounds the number of `onFailure.goto` loop iterations (default: 3). Prevents infinite feedback loops. It does not bound idempotent crash retries.

**`maxCrashRetries`** on a step bounds idempotent crash retries (default: 3). Independent of `maxIterations` -- applies only when the worker process is killed unexpectedly (`idempotent: true` path).

**Why per-step:** A flow has steps with different safety profiles. `run-tests` is safe to retry; `create-pull-request` is not. The flow author is the only one who knows.

**Why `idempotent: false` is default:** Failing safe. Undecorated steps that get silently retried could produce duplicate side effects (double commits, double API calls).

## D13 -- Daemon self-exits when ready-step queue drains

When all executions are in terminal state (COMPLETED or FAILED) and the ready-step queue is empty, the daemon exits cleanly.

**Exception:** During the D24 reconnection window, executions with `status: running` are not counted as terminal. The idle check is deferred until the reconnection window closes.

**Why:** The daemon has no persistent state to maintain -- disk is the source of truth (D21). Keeping the process alive serves no purpose. Next `flow run` spawns a fresh daemon.

## D14 -- CLI↔daemon transport: loopback TCP HTTP/1.1 (singleton-daemon-kit)

`singleton-daemon-kit` uses TCP `127.0.0.1` exclusively for CLI↔daemon communication. No Unix sockets, no named pipes.

**Why:** Cross-platform -- Unix sockets don't work on Windows. The kit enforces this by design.

**Daemon detection:** port file at `~/.flow-daemon/config.port`. No socket probe.

**Note:** This applies only to CLI↔daemon. Worker↔daemon uses WebSocket (D23), which is a separate channel on the daemon's own WebSocket server.

## D15 -- singleton-daemon-kit handles daemon lifecycle primitives; flow CLI owns the queue

The kit provides: port file management, PID liveness detection, mtime-based heartbeat (file utimes), auth token, single-instance enforcement (takeover), idle timer hooks, and lifecycle callbacks.

The kit does NOT provide: queue management, execution worker spawning, WebSocket server, or log file management. These are flow CLI's responsibility.

**Why:** The kit is intentionally minimal -- a bootstrapping and coordination layer, not an execution framework.

## D16 -- Daemon owns graph intelligence; worker is a dumb per-step executor

The daemon constructs the step graph, tracks dependencies, maintains the global ready-step queue across all active executions, and assigns steps to free workers via WebSocket. Each worker executes one step at a time, streams logs, reports completion/failure, then receives the next assignment (or exits).

Workers are execution-agnostic at spawn time -- they are not bound to a flow or execution ID when spawned. The execution ID and step details are delivered in the first `assign` message over WebSocket. A worker that just finished a step from flow A may be assigned a step from flow B next.

**Why:** Full daemon visibility at all times -- necessary for crash recovery (D12). Worker statelessness between steps makes the failure surface small.

**Impact on current code:** `FlowOrchestrator` currently runs inside what would be the worker process. It moves to the daemon. The worker becomes a thin executor receiving serialized step configs and returning outputs.

## D17 -- Log persistence: daily rotation, 30-day retention

Logs written to `~/.flow-daemon/logs/<YYYY-MM-DD>.ndjson` (daily files, all executions multiplexed).

Rotation: keep last 30 daily files, hard cap at 120 days.

```yaml
logs:
    retainDays: 30 # also controls execution file retention (D22)
```

**Why disk over memory-only:** The daemon exits when the queue drains (D13). In-memory logs would be routinely lost before agents can query them.

## D18 -- The step graph is a Directed Graph with bounded cycles, not a DAG

`onFailure.goto` introduces cycles. The graph is a Directed Graph, not a Directed Acyclic Graph. Cycles are bounded by `maxIterations` per step (default: 3).

**Impact on current code:** `DAGBuilder` and `DAGValidator` in `flow-engine/src/validation/` are misnamed. Rename to `GraphBuilder` and `GraphValidator` during the refactor. Cycle detection must allow bounded cycles rather than rejecting them.

## D19 -- `flow attach`, `flow logs`, and `flow list` are pure file operations _(v2 -- deferred)_

`flow attach <id>` tails `~/.flow-daemon/logs/*.ndjson` filtered by execution ID, stops on `[id|__execution] COMPLETED|FAILED`.
`flow logs <id>` greps the same files.
`flow list` reads `~/.flow-daemon/executions/*.json`.

No daemon connection needed for any observation command. All work after daemon exit.

**Why:** D17 (logs on disk) + D20 (prefixed log lines with terminal state as log line) + D21 (execution files on disk) eliminate all need for daemon involvement in observation.

## D20 -- Log lines prefixed `[executionId|stepId]` in all files and on stdout

Every log line carries a `[executionId|stepId]` prefix. `__execution` is a reserved step ID for lifecycle events. Terminal state is written as a log line:

```
[abc1|generate-pr] prompt sent to claude
[abc1|generate-pr] output received (342 tokens)
[abc2|run-tests] npm test exited 0
[abc1|__execution] COMPLETED
[abc2|__execution] FAILED: run-tests exceeded maxIterations
```

`--no-prefix` suppresses the prefix on stdout only. The prefix is always written to the log file.

**Why:** All filtering becomes a pure grep. No index file, no daemon metadata query, no streaming protocol.

## D21 -- All execution state is persisted to disk; daemon is not a state store

Every execution state transition is written to `~/.flow-daemon/executions/<executionId>.json` immediately by the daemon. Workers report state via WebSocket; the daemon writes to disk -- workers never write directly (single writer, no race conditions).

```
~/.flow-daemon/
  logs/
    2026-07-30.ndjson
  executions/
    abc1.json
    abc2.json
```

**Why:** Disk is the single source of truth. Daemon crash loses nothing observable. History preserved across restarts.

## D22 -- Execution file retention tied to log retention

Execution files in `~/.flow-daemon/executions/` expire after `logs.retainDays` days (default: 30). One config key controls both -- they describe the same event and should expire together.

## D23 -- Worker↔daemon communication is WebSocket, independent of the SDK _(v2 -- deferred)_

The SDK is only involved in CLI↔daemon communication. Worker↔daemon communication is pure business logic with no SDK dependency.

**Normal operation:** persistent WebSocket connection per worker. Bidirectional -- daemon pushes step assignments, worker pushes log entries and results. Connection health is the liveness signal -- no separate heartbeat needed.

```
Daemon                          Worker
  |                               |
  | <── WS connect ─────────────  |
  | ──── assign(step) ──────────> |
  | <── log entry ──────────────  |
  | <── log entry ──────────────  |
  | <── step_completed ─────────  |
  | ──── assign(nextStep) ──────> |
```

**On daemon crash -- fallback to CLI binary:**
Worker detects daemon loss via WebSocket close. It buffers logs locally (memory first; spills to temp file after `worker.bufferSpillMs` to prevent loss) and calls the CLI binary (`flow worker-register ...`) with exponential backoff. That CLI subprocess either finds an existing daemon or becomes one (D1). Once reachable, worker opens a fresh WebSocket and flushes buffered logs in order.

**Multi-worker crash recovery:**

```
Worker1    Worker2    Worker3    CLI subprocess
  |          |          |
  [all WebSocket connections drop simultaneously]
  |          |          |
  +- buffer  +- buffer  +- buffer
  +- call CLI ─────────────────────────────────> |
  |          +- call CLI ─────────────────────── | (waits for daemon)
  |          |          +- call CLI ──────────── | (finds daemon)
  |          |          |    first: createDaemon() inline → becomes daemon
  |          |          |
  +- WS reconnect + flush buffered logs (in order)
             +- WS reconnect + flush buffered logs
                        +- WS reconnect + flush buffered logs
```

Race resolution: D1 handles it naturally.

**Why WebSocket not fork() IPC:** A new daemon process cannot re-attach to `fork()` IPC channels from a previous process. WebSocket reconnection works across daemon restarts because workers always initiate the connection.

**Why CLI binary not custom HTTP client:** Reuses D1. Workers use the same daemon discovery and startup logic as every other caller.

**Log buffer spill threshold:** `worker.bufferSpillMs` (default: 15000ms). Independent configuration key -- not derived from `reconnectTimeoutMs`.

## D24 -- Daemon restart: reconnection window before resuming normal step assignment _(v2 -- deferred)_

On startup, the daemon reads `executions/*.json`, counts steps with `status: running` across all execution files -- call this N. It enters a **reconnection window**: holds new step assignments (but accepts `flow run` commands) until either all N workers reconnect or the timeout expires.

**Timeout:** `worker.reconnectTimeoutMs` (default: 30s) -- same as the max exponential backoff value workers use, so a surviving worker will always attempt at least one reconnect before the window closes.

Workers reconnecting within the window reclaim their pool slot and resume. Workers that do not appear within the window are declared dead -- D12 applies (idempotent → retry, non-idempotent → FAILED).

**Why hold assignments:** Prevents assigning new steps into slots about to be reclaimed by reconnecting workers, which would temporarily exceed `queue.concurrency`.

**Test scenarios required:**

- Worker survives daemon crash, reconnects within window, flushes buffered logs in order -- no log loss
- Multiple workers survive crash, all reconnect -- pool correctly restored
- Worker dies with daemon -- not seen in window → D12 applies
- Worker reconnects after window expires -- treated as new, slot granted if available
- Daemon restarts with 0 running steps -- no window, immediate normal operation
- Two workers call CLI simultaneously on crash -- D1 ensures only one becomes daemon

## D25 -- Step output extraction is the worker's responsibility; failed extraction triggers multi-shot retry

After Claude responds, the worker applies the `output:` extraction config from the step YAML. If the expected format is not present, the worker injects a correction prompt into the Claude conversation and calls `/resume` -- it does not immediately fail the step.

This retry loop is bounded by `maxOutputRetries` per step (default: 3). After exhausting retries, the worker reports `step_failed` to the daemon.

**Session ID requirement:** `/resume` must be called with `--resume <sessionId>`. The session ID is emitted by Claude in the first `system` init event of the `stream-json` output. The worker captures it from `StreamJsonParser` and stores it for the duration of the step. Without it, each retry starts a fresh conversation with no context -- making the correction loop useless. This requires `StreamJsonParser` to surface `session_id` from the init event (currently not implemented -- see TODO in StreamJsonParser.ts).

**Why worker, not daemon:** The extraction and retry loop is tightly coupled to the Claude subprocess lifecycle (same conversation context). The daemon never sees the raw Claude output -- only clean `StepOutput` or a failure signal.

**Why multi-shot not immediate failure:** Multi-shot with a correction prompt is consistent with how the current `agent-fleet` handles unexpected output. A single bad response is often recoverable without human intervention.

## D26 -- Subflow steps are expanded inline into the parent execution graph _(v2 -- deferred)_

When the daemon encounters a step of type `subflow`, it loads the referenced flow definition and injects its steps into the current execution's graph under a namespace prefix (e.g. `subflow-generate-pr.run-tests`). No child execution is created.

**Why not a blocking worker:** A worker holding a pool slot while waiting for a nested execution would starve the pool (e.g. if subflow has 5 steps and pool size is 3, the waiting slot would never free). Inline expansion means subflow steps compete fairly for workers alongside parent steps.

**Why not a non-blocking child execution:** Requiring the flow author to explicitly `depends` on a subflow-status step would break the natural expectation that the next step runs after the subflow completes. Inline expansion preserves sequential semantics automatically.

**Namespace prefix:** Subflow step IDs in logs and execution state appear as `<subflow-step-id>.<original-step-id>`. This makes them distinguishable without ambiguity.

**Recursive subflows:** Depth-limited. Maximum nesting depth is configurable (`queue.maxSubflowDepth`, default: 5). Exceeding depth → step fails immediately.

## D27 -- Flow inputs: schema in YAML, values via CLI, validation in daemon

Input schema is declared in the flow YAML:

```yaml
id: create-pr
inputs:
    - name: branch
      required: true
    - name: base
      required: false
      default: 'main'
steps:
    - id: generate-pr
      prompt: 'Create a PR for branch ${{ inputs.branch }} targeting ${{ inputs.base }}'
```

Values are passed at invocation time:

```
flow run ./my-flow.yml --input branch=feat/my-feature --input base=main
```

Interpolation syntax is identical to the current agent-fleet: `${{ inputs.<name> }}` and `${{ steps.<stepId>.outputs.<field> }}`. `ExecutionContext` carries resolved inputs and accumulated step outputs -- workers receive the full context on each `assign` message.

**`type` field on inputs:**

```yaml
inputs:
    - name: branch
      required: true
    - name: deploy_key
      required: true
      type: secret # caller must pass a URI (env://, file://) -- literal values rejected
```

`type` accepted values: `string` (default), `secret`.

For `type: secret` inputs: the CLI validates that the value passed via `--input` is a URI scheme (`env://` or `file://`). Literal values are rejected at CLI validation time with exit 2. The URI travels to the worker as a string; the worker resolves it via `SecretsProvider`.

**Validation:** The daemon validates required inputs and the full flow graph before queuing any step.

**Exception -- `type: secret` inputs:** the CLI reads the flow YAML to identify which inputs are `type: secret`, then validates that their `--input` values are URI schemes (`env://`, `file://`). Literal values are rejected at CLI time with exit 2. This is the only pre-validation the CLI performs -- all other validation stays in the daemon.

**Why this exception:** a literal secret value would travel through the CLI→daemon HTTP channel in plaintext. The CLI must intercept it before it leaves the process.

**`ClientCommand.run` includes `cwd`:** the CLI passes `process.cwd()` so the daemon can resolve relative `flowFile` paths and use it as the default workspace directory.

## D28 -- `flow cancel`: graceful cancellation _(v2 -- deferred)_

Deferred to v2 (D34). The following behavior is designed but not implemented in v1.

`flow cancel <executionId>` -- graceful by default: waits for the current step to finish, then stops. `--force` sends SIGKILL immediately to the running worker.

`CANCELLED` is a distinct terminal state (alongside `COMPLETED` and `FAILED`). An interrupted step (mid-execution when cancel fires) is marked `interrupted` -- not retried, not failed.

The daemon idle-exit check (D13) treats `CANCELLED` as a terminal state.

## D29 -- Flow design skill: global, user-home scope

A Claude skill installed at `~/.claude/` teaches any agent in any project the design→validate→approve→execute pattern for Flow CLI. Not project-scoped -- no assumptions about workspace paths or project config.

Content depends on the YAML schema (D30). The skill will include: step type reference, the two-phase interaction pattern (design+validate before execute), a minimal working template, and what NOT to do (no execution without user approval, no `user_intervention` steps).

## D30 -- YAML step schema: full flow-engine feature set, no removals

Flow CLI supports all step types and fields from flow-engine without simplification. The rule: if flow-engine implements it, flow-cli supports it. Removals require explicit justification and user approval.

**Step types:** `model`, `script`, `subflow`, `user_intervention`

**Base fields (all steps):** `id`, `name`, `depends`, `when`, `retry`, `onFailure`, `output`, `contract`, `context`

**Approved exceptions (carry over as throws):**

- `user_intervention` → `UnsupportedOperationError` (D8)
- `workspace.mode: isolated` / git strategies → `UnsupportedOperationError` (D7)
- `${{ task.* }}` expressions → resolve to undefined (no task concept in CLI); documented behavior, not an error

**New fields added by Flow CLI on top of flow-engine (not in current engine):**

- `idempotent: boolean` (default: false) -- crash recovery behavior (D12)
- `maxCrashRetries: number` (default: 3) -- crash retry bound, independent of `maxIterations` (D12)

**Note on `context:` field:** `StepContext` (`files`, `previousOutputs`, `taskMetadata`) is schema-only in current flow-engine -- no runtime effect. `previousOutputs` has referential validation only. Flow CLI carries this behavior as-is.

## D31 -- Env vars and secrets: declaration model, provider hierarchy, security constraints

### `vars:` and `secrets:` are distinct features

`vars:` -- non-sensitive flow-level configuration. Accessible via `${{ vars.name }}`. Inherited by all steps unless overridden.

`secrets:` -- sensitive values. Never in plaintext in YAML (except `value://` which is blocked). Accessible only when a step explicitly maps them to an env var. Resolved by the worker, never by the daemon.

### URI schemes

| Scheme              | vars: | secrets: | Notes                                     |
| ------------------- | ----- | -------- | ----------------------------------------- |
| `env://NAME`        | yes   | yes      | Reads worker process env at resolve time  |
| `file://./rel/path` | yes   | yes      | Relative to workspace -- validated         |
| `file:///abs/path`  | yes   | yes      | Default: error; configurable to warn      |
| `value://literal`   | yes   | NO       | Plaintext in YAML -- vars only             |
| `input://name`      | yes   | yes      | Reads from flow inputs at invocation time |

`cmd://` is not supported -- shell injection surface with no safe parsing strategy.

`value://` is forbidden in `secrets:` -- error at `flow validate` time.

### Provider hierarchy

```
ValueProvider (interface)
  ├─ VarsProvider    -- resolves vars: block
  └─ SecretsProvider -- resolves secrets: block; rejects value:// at construction
```

### Step env construction

Steps receive NOTHING by default. All env vars must be explicitly declared:

```yaml
vars:
    NODE_ENV: production

secrets:
    github_token: 'env://MY_GITHUB_TOKEN'
    npm_token: 'file://./secrets/npm_token'

steps:
    - id: create-pr
      type: model
      env:
          GITHUB_TOKEN: ${{ secrets.github_token }} # secret mapped to env var
          NODE_ENV: ${{ vars.NODE_ENV }} # var mapped to env var

    - id: run-tests
      type: script
      script: npm test
      env:
          NODE_AUTH_TOKEN: ${{ secrets.npm_token }}
          PATH: /usr/local/bin:/usr/bin:/bin # must be explicit -- no inheritance
```

`vars:` values are available as `${{ vars.name }}` in any step field. Secrets are NOT available via `${{ secrets.name }}` directly in prompt text -- only via env: mapping.

### Secret object model

Resolved secret values are wrapped in a `Secret` class that overrides all serialization methods to return `[REDACTED]`. Plaintext is accessed via `.use()` only at subprocess env construction. The `Secret` object must never appear in error messages, log entries, or IPC messages.

### Masking

All 6 variants registered per secret: raw, base64 (no padding), base64 byte-offset-1 (slice(2)), base64 byte-offset-2 (slice(3)), URL-safe base64, hex.

Registration is EAGER (at worker startup, before any step runs) -- not lazy. This prevents parallel-step TOCTOU races.

Masking applies to every output path: Claude subprocess stdout/stderr, script subprocess stdout/stderr, worker log entries before WebSocket send, StepOutput before writing to executions/\*.json, error messages crossing I/O boundaries.

### Security constraints enforced at validation

- `value://` in `secrets:` → error
- Absolute `file:///` paths → error by default (configurable to warn via `validation.absoluteSecretPath: warn`)
- `${{ secrets.x }}` in script text → error (secrets only via env: mapping, never interpolated into script content)
- `input://` in `secrets:` → caller must pass a URI scheme (`env://`, `file://`) via `--input name=env://X` at invocation time; literal values rejected at CLI validation

### What the operator is responsible for

The subprocess env is empty by default -- no `PATH`, no `HOME`, no `TMPDIR`. Scripts that call system binaries must declare `PATH` explicitly. This is by design: silent env inheritance is the source of CI/local divergence.

## D32 -- Hook system: typed objects with protocol-based dispatch

Hooks are declared in `.flows/config.yml` as typed objects. A `HookDispatcher` routes by `type` field to the appropriate resolver.

```yaml
hooks:
    on-task-created:
        - type: cli
          command: flow
          args: ['run', '.flows/elaborate-task.yml']
        - type: http
          url: https://hooks.slack.com/services/xxx
    on-status-change:
        - when: 'approved'
          type: cli
          command: flow
          args: ['run', '.flows/implement-task.yml']
```

| type   | Behavior                                                                                                                                                           |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `cli`  | `child_process.execFile(command, args)` -- no shell, no injection risk. Task context passed as env vars: `TASK_ID`, `TASK_STATUS`, `TASK_DESCRIPTION`, `TASK_FILE`. |
| `http` | POST JSON `{ taskId, status, description, taskFile }` to `url`. Supports `http://` and `https://`.                                                                 |

Multiple listeners per event -- array, all called in order. Default on failure: `on-failure: ignore` (configurable per listener to `fail-task`).

**Why typed objects not URI strings:** `cli://flow run .flows/foo.yml` embeds shell syntax (spaces, flags) inside a URI -- confusing and requires shell splitting. Typed objects map directly to `execFile` args, eliminating the injection surface and the parsing ambiguity.

**Why `execFile` not `exec`:** `exec` spawns a shell, enabling command injection via untrusted args. `execFile` passes args as an array directly to the OS -- no shell interpretation.

## D33 -- `task` CLI: file-based storage, minimal command surface

Storage layout (project-local):

```
.flows/tasks/
  index.json          ← { tasks: [{ id, title, status, createdAt }] }
  <taskId>.json       ← full task: description, history, generated steps, status transitions
```

Commands:

```
task new <description>       # create task, trigger on-task-created hook
task list                    # read index.json
task show <id>               # read <taskId>.json
task approve <id>            # set status → approved, trigger on-status-change hook
task set-status <id> <status> # general status transition, triggers on-status-change hook
```

Status values (initial set): `created`, `elaborating`, `flow-review`, `approved`, `in-progress`, `failed`, `done`

Config lives at `.flows/config.yml` (project-local, never in `~`). The `task` CLI reads hooks from this file and calls `HookDispatcher` on each status transition.

**Why one file per task:** enables per-task history (all status transitions, generated steps, LLM output) without unbounded growth of a single file. Index file stays small for fast listing.

**Why `.flows/tasks/` not `~`:** tasks are project-specific. Global task storage would mix concerns across projects. `.flows/tasks/` should be gitignored by default.

## D35 -- Flow MCP server: tool interface between Claude subprocess and flow engine

Each worker starts a per-execution MCP server upon receiving the `assign` message (which provides the executionId). The MCP server is started before launching `claude -p` for that step. Workers are execution-agnostic before `assign` -- no MCP server exists before that point. Claude is invoked with `--mcp-config <temp_config> --strict-mcp-config` so only the flow engine's tools are available.

**Why MCP:** `claude -p` natively supports `--mcp-config`. Claude calls tools via the MCP protocol -- the worker's MCP server receives calls and responds. No stream-json interception, no stdin injection needed.

**`--strict-mcp-config`:** prevents the user's personal MCP servers from interfering with the execution environment.

**v1 tools exposed (minimum for step injection):**

- `provideSteps(steps: Step[])` -- inject steps into the running graph

**v2+ tools (not scoped now but the architecture supports them):**

- `logMessage`, `setTodo`, `askUser`, `getFlowState`, `getStepOutput`

**Why this matters beyond step injection:** this is the primary bidirectional interface between Claude and the flow engine. Future tools can expose flow state, user interaction (web UI prompts), and task management without any architectural change.

---

## D34 -- v1 command surface: `flow run` and `flow validate` only

v1 ships exactly two user-facing commands:

```
flow run <file> [flowId] [--input k=v] [--quiet]
flow validate <file> [flowId]
```

All other commands are deferred to v2: `attach`, `logs`, `list` (pure file-tail operations -- no daemon, designed in D19/D20/D21 but not shipped in v1), `status`, `cancel`, `stop`, `retry`, `_worker-register`.

**`flow run`:** triggers daemon startup if needed (D1), queues the execution, returns execution ID and exits (D2).

**`flow validate`:** validates the flow YAML (graph structure, input schema, step schema) without executing. Used by the task elaboration flow's deterministic validation step -- calls `flow validate` on the LLM-generated steps before injecting them into the graph. Returns structured errors on failure, exits 0 on success.

**`flow validate` output contract:**

- Exit 0: valid. No output (silent success -- consumed by script steps).
- Exit 1: invalid. Writes JSON to stdout regardless of TTY:
    ```json
    { "valid": false, "errors": [{ "type": "string", "message": "string", "path": "string" }] }
    ```
    `type` values: `graph`, `input`, `schema`, `cycle`, `template`.
- Exit 2: file not found or unreadable.

**`flow run` output contract:**

- Exit 0: execution queued. Prints `<executionId>` to stdout (suppressed with `--quiet`).
- Exit 1: daemon error (prints error JSON to stderr: `{ "code": "string", "message": "string" }`).
- Exit 2: validation error before queue (same JSON format as `flow validate` exit 1, to stderr).
- Exit 3: daemon could not be started (port conflict, binary not found -- message to stderr).

Known error codes: `VALIDATION_FAILED`, `DAEMON_START_FAILED`, `PORT_CONFLICT`, `FLOW_NOT_FOUND`, `MISSING_INPUT`.

**Why only two:** the v1 scenario (`task new` → elaborate → review → execute) requires only `flow run` (called by hooks) and `flow validate` (called by the deterministic validation step). Observation commands and lifecycle management are v2 concerns.

## D36 -- Dynamic step injection: `provideSteps` tool, `parent` field, recursive hierarchy

**Injection mechanism:** model steps call `provideSteps` via the flow MCP server (D35). Any step type can inject steps.

**`parent` field:** injected steps declare `parent: "<step-id>"` to become sub-steps of that step. The parent step is not `done` until all its sub-steps are `done`. Without `parent`, the injected step is a regular graph step.
The `parent` field is valid in both static YAML and in steps injected via `provideSteps`.

```yaml
# Injected via provideSteps -- sub-step of implement-feature
id: run-tests
type: script
command: npm test
parent: implement-feature
onFailure:
    goto: implement-feature
```

**Recursive hierarchy:** sub-steps can themselves have sub-steps. Depth is configurable (`maxChildDepth`, default: 10). Exceeding the limit throws at injection time.

**`depends` within sub-steps:** governs ordering between siblings. Does not create deadlock with `parent` -- `parent` controls completion scope, `depends` controls start order.

**Why unbounded recursion with a limit:** policy engine steps need to inject feedback loops on injected steps (e.g. a security scan injected by a model step may itself inject a remediation step). Capping at 10 prevents runaway recursion without constraining real use cases.

**UI representation:** `parent`/child relationships render as nested sub-steps under the parent, preserving a high-level flow view. Only top-level steps (no `parent`) appear at the root level.

**Policy engine use cases:** a policy step can inject missing feedback loops (e.g. "no security scan detected → inject one"), or validate that required loops exist before allowing execution to proceed.

## D37 -- `.flows/config.yml` schema

Full schema for the project-level flow configuration file:

```yaml
version: 1

defaults:
    model: claude-opus-5 # default model for all model steps

execution:
    maxChildDepth: 10 # max parent/child step nesting depth (D36)

hooks:
    onFlowStart:
        - type: cli
          command: ...
          args: [...]
    onFlowEnd:
        - type: cli
          command: ...
    onFlowError:
        - type: http
          url: ...
    onStepStart:
        - type: cli
          command: ...
    onStepEnd:
        - type: cli
          command: ...
    onStepFailed:
        - type: cli
          command: ...

tasks:
    storage:
        dir: .flows/tasks # project-local task storage (D33)
    hooks:
        onStatusChange:
            - type: cli
              command: ...
              args: [...]
```

Hook listener schema per D32: `type: cli | http`. All hook events accept an array of listeners. Hook events are distinct from task hooks -- flow hooks fire on step/flow lifecycle; task hooks fire on status transitions.

**Why `defaults.model` here:** avoids repeating the model on every model step. Step-level `model:` overrides the default.

**Why `execution.maxChildDepth` here:** configurable safety ceiling per D36, applies per project. Global default (10) is overridable here.

## D38 -- First implementation milestone

**Smallest working slice:** a single `script` step flow, no model, no MCP. Validates the full plumbing: daemon startup → `/run` → queue → worker spawn → WebSocket `assign` → step executes → WebSocket `result` → execution file written → daemon idle exit.

**Build on, don't rewrite:** reuse flow-engine's `GraphValidator`, `OutputExtractor`, `TemplateRenderer`, `StreamJsonParser`, `ClaudeLauncher`. New code: daemon (HTTP + WebSocket), worker process, CLI binary.

**No web frontend in v1:** the scenario is fully CLI-driven (`task` + `flow` + hooks).

**Tests:** flow-engine unit tests for `GraphValidator`, `OutputExtractor`, `TemplateRenderer`, `StreamJsonParser` are reusable as-is. `FlowExecutor`/`FlowOrchestrator` tests test the in-process runner -- rewrite for the daemon+worker+WebSocket model.

## D39 -- `provideSteps` MCP tool: JSON schema

The `provideSteps` tool exposed by the flow MCP server (D35) accepts:

```typescript
interface ProvideStepsInput {
	steps: InjectedStep[];
}

interface InjectedStep {
	id: string; // required -- must be unique in the execution graph
	type: 'model' | 'script' | 'subflow'; // user_intervention not allowed in injected steps
	parent?: string; // ID of the step that owns this sub-step (D36)
	depends?: string[]; // IDs of steps that must complete before this one starts
	onFailure?: { goto: string }; // creates a bounded cycle (D12 maxIterations applies)
	// All other standard step fields apply (prompt, command, env, output, etc.)
}
```

**Validation at injection time (throws, returns MCP error to Claude):**

- `id` already exists in the graph → error
- `parent` references a non-existent step → error
- `depends` references a non-existent step → error
- `type: user_intervention` → error
- `maxChildDepth` exceeded → error (D36)

**On success:** MCP tool returns `{ "injected": ["step-id-1", "step-id-2"] }`. Claude continues.

**Why no `executionId` in the call:** the MCP server is per-execution (started at `assign` -- D35). The executionId is implicit in the server instance.
