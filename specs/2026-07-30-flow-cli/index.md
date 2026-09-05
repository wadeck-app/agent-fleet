# Flow CLI -- Architecture Decisions Index

Standalone CLI for creating, updating, and executing flows described in YAML.
Targets human and agent callers. No dependency on the web server stack.

## Goals

- Lightweight: no server required, no frontend, no orchestrator
- Simple: one file + one ID → one execution
- Composable: abstractions allow adding capabilities without rewriting core logic
- Fail fast: unsupported features throw, no silent fallbacks

## Documents

- [decisions.md](decisions.md) -- All architecture decisions with rationale
- [daemon-lifecycle.md](daemon-lifecycle.md) -- Daemon startup, shutdown, and execution worker model
- [execution-model.md](execution-model.md) -- Queue, concurrency, flow execution lifecycle
- [ipc-protocol.md](ipc-protocol.md) -- CLI↔Daemon communication protocol
- [log-streaming.md](log-streaming.md) -- Log output, prefixing, buffering, filtering
- [abstractions.md](abstractions.md) -- Interfaces extracted from flow-engine for modularity
- [open-questions.md](open-questions.md) -- Pending questions for next session (Q20-Q26)

## Open items

- [x] Read `singleton-daemon-kit` source -- at `C:\Users\Wadeck\Workspace\__exp\singleton-daemon-kit`
- [x] IPC mechanism confirmed: loopback TCP HTTP/1.1 (see D14, ipc-protocol.md)
- [x] `idempotent` declared per-step in YAML (D12)
- [x] Log retention: daily rotation, 30 files, 120-day hard cap (D17)
- [x] All execution state persisted to disk -- daemon holds no authoritative in-memory state (D21)
- [x] `flow attach`, `flow list`, `flow logs` are pure file reads -- no daemon needed (D19, D21)
- [x] Worker pool: global pool of size `queue.concurrency`, not bound per-flow (D5, D16)
- [x] Graph is Directed with bounded cycles, not acyclic -- `DAGBuilder` → `GraphBuilder` rename flagged (D18)
