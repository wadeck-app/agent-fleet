# Execution Model

## Execution state file

`~/.flow-daemon/executions/<executionId>.json` — written by the daemon on every state transition. Workers never write to this file directly (single writer rule, D21).

```json
{
  "executionId": "abc1",
  "flowFile": "/path/to/my-flow.yml",
  "flowId": "my-flow",
  "status": "running",
  "currentSteps": ["generate-pr"],
  "workerPid": 1234,
  "startedAt": "2026-07-30T14:23:00Z",
  "completedAt": null,
  "steps": {
    "generate-pr": { "status": "running", "startedAt": "...", "iterations": 1 },
    "run-tests": { "status": "pending" }
  }
}
```

`status` field: `"queued" | "running" | "completed" | "failed" | "re-queued"`

`currentSteps` is an array to support parallel step execution. Contains the IDs of all steps currently in `"running"` state.

**Execution ID format:** 8-character alphanumeric strings (base36). The `|` separator in log prefixes is safe because execution IDs never contain it.

## Execution states

```
QUEUED → RUNNING → COMPLETED
                 → FAILED
         RUNNING → FAILED     (worker WebSocket closed, non-idempotent step — D12)
         RUNNING → RE-QUEUED  (worker WebSocket closed, idempotent step — D12, same execution ID, step re-queued)
```

## Responsibility split

The daemon owns all execution intelligence. Workers are dumb step executors.

| Responsibility | Owner |
|---|---|
| Graph construction and dependency tracking | Daemon |
| Deciding which steps are ready | Daemon |
| Global ready-step queue across all executions | Daemon |
| Assigning a step to a free worker (via WebSocket) | Daemon |
| Writing execution state to disk | Daemon (single writer) |
| Executing a step (Claude, script, subflow) | Worker |
| Streaming log entries | Worker → Daemon (WebSocket) |
| Reporting step completion/failure | Worker → Daemon (WebSocket) |
| Liveness signal | WebSocket connection health |
| Crash detection and idempotency decision | Daemon |

## Worker pool model

`queue.concurrency` in `~/.flow-config.yaml` defines the global worker pool size. Workers are not bound to a flow — they pull from a shared ready-step queue fed by all active executions.

```
Active flows:  FlowA (steps: s1✓ s2 s3)   FlowB (steps: t1 t2)
                                  |                  |
                         Global ready-step queue: [ s2, s3, t1, t2 ]
                                         |
                              Worker pool (concurrency=3)
                              W1: s2   W2: s3   W3: t1   [ t2 waiting ]
                                                             |
                                            first free worker picks this up
```

## Worker lifecycle (per step)

Workers communicate with the daemon via WebSocket (D23). The daemon pushes assignments; the worker pushes logs and results.

Workers are execution-agnostic at spawn time — no execution ID is passed as a spawn argument. The worker receives the execution ID in the first `assign` message (D16).

Daemon spawns workers via: `child_process.spawn('node', ['worker.js'], { env: { FLOW_DAEMON_PORT, FLOW_WS_PORT } })`

```
Daemon                              Worker (child process)
  |                                       |
  +- spawn(worker) ─────────────────────> |  (env: FLOW_DAEMON_PORT, FLOW_WS_PORT)
  |                                       +- connect WebSocket to daemon
  |  <── ready { pid } ─────────────────  |
  |                                       |
  +- assign(stepId, stepConfig,           |  (via WebSocket)
  |          executionContext) ─────────> |  ← first message carries executionId
  |                                       +- execute step
  |  <── log entry ─────────────────────  |
  |  <── log entry ─────────────────────  |
  |  <── step_completed(stepId, output) ─  |
  |                                       |
  +- [graph: update state, find next      |
  |    ready steps across all executions] |
  |                                       |
  +- assign(nextStep) ─────────────────> |  or idle / done
  |                                       +- exit(0) on done
  |
  +- update executions/abc1.json
```

## Worker reconnection after daemon crash

WebSocket close is detected immediately by both sides. Workers buffer logs locally and call the CLI binary to re-establish contact (D23, D24).

```
Worker1    Worker2    Worker3    CLI subprocess
  |          |          |
  [all WebSocket connections drop simultaneously]
  |          |          |
  +- buffer  +- buffer  +- buffer  (memory; spill to disk after bufferSpillMs)
  +- call CLI binary ──────────────────────────> |
  |          +- call CLI ─────────────────────── | (finds daemon starting)
  |          |          +- call CLI ──────────── | (finds daemon up)
  |          |          |    first: createDaemon() inline → this process is the daemon
  |          |          |
  +- WS reconnect + flush buffered logs (in order)
             +- WS reconnect + flush buffered logs
                        +- WS reconnect + flush buffered logs
```

## Heartbeat failure handling

Liveness is signaled by WebSocket connection health — no explicit heartbeat messages.

| Scenario | `idempotent` on running step | Action |
|---|---|---|
| Worker WebSocket closes unexpectedly | false (default) | mark step + execution FAILED |
| Worker WebSocket closes unexpectedly | true | SIGKILL worker process, re-queue step |
| Worker reconnects within window (D24) | any | re-adopt, resume from current step |
| Worker absent after reconnection window | any | declare dead, apply row 1 or 2 above |

## Graph structure: Directed Graph with bounded cycles

The flow step graph is a **Directed Graph**, not a DAG. `onFailure.goto` introduces cycles (feedback loops). Cycles are valid but bounded by `maxIterations` per step (default: 3) to prevent infinite loops.

The existing `DAGBuilder` / `DAGValidator` names in `flow-engine/src/validation/` are incorrect and will be renamed to `GraphBuilder` / `GraphValidator` during the refactor (D18).

## Queue behavior

- FIFO queue of ready steps, global across all active executions
- `queue.concurrency` controls max simultaneously executing steps (not flows)
- `flow list` reads `executions/*.json` directly — no daemon contact needed (D19, D21)
