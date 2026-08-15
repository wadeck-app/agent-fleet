# Coherence Audit — Round 4 (CLI subprocess, `claude --print`)

15 issues found. Exit code -1 (process detached before clean exit).

## CRITICAL

- **C1** `execution-model.md` — RE-QUEUED says "new execution ID", D12 says "same execution ID"
- **C2** `decisions.md` D23 — bufferSpillMs two conflicting definitions (derived vs independent key)

## HIGH

- **H1** `index.md` — "40-line in-memory tail (D17)" — phantom feature, defined nowhere
- **H2** `daemon-lifecycle.md` — "heartbeat monitoring" stale (contradicts D23 — no heartbeats exist)
- **H3** `ipc-protocol.md` — WebSocket worker port: discovery mechanism never defined
- **H4** `decisions.md` D13/D24 — D13 self-exit condition fires before D24 reconnection window completes (UNIQUE — not found by other agents)

## MEDIUM

- **M1** `execution-model.md` + `ipc-protocol.md` — worker spawned with executionId contradicts D16 (workers not bound to execution)
- **M2** `daemon-lifecycle.md` + `ipc-protocol.md` — `POST /quit` vs `{ type: 'stop' }` mismatch
- **M3** `ipc-protocol.md` — `worker-register` HTTP vs WebSocket `ready` — purpose and relationship undefined
- **M4** No canonical `~/.flow-config.yaml` schema
- **M5** `execution-model.md` — RE-QUEUED status string never defined in JSON schema enum

## LOW

- **L1** `log-streaming.md` / D17 — 120-day hard cap unexplained (fixed constant? derived from retainDays?)
- **L2** `daemon-lifecycle.md` — "log buffering" attributed to command handlers; actually a worker responsibility (D23)
- **L3** `ipc-protocol.md` — Channel 1 "Used by: workers" misleading; workers use Channel 1 only in crash fallback
- **L4** `decisions.md` D10 — "superseded by D20" without explaining direction of supersession

## Unique findings (not found by other agents)

**H4 — D13 self-exit fires before D24 reconnection window:** On restart, execution files show `status: running`, queue is empty. D13's condition is immediately satisfied — daemon would self-exit before any workers reconnect. D24 never runs. Fix: add carve-out to D13 for the reconnection window.
