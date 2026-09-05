# Coherence Audit -- Round 3 (General subagent)

18 issues found. Ranked by severity.

## CONTRADICTIONS

- **C1** `execution-model.md` -- RE-QUEUED says "new execution ID", D12 says "same execution ID"
- **C2** `decisions.md` D23 -- bufferSpillMs defined as both derived (reconnectTimeoutMs/2) and independent key
- **C3** `ipc-protocol.md` -- WebSocket on "separate port" but port is undiscoverable (not in port file, not in startup sequence)
- **C4** `execution-model.md` -- SIGKILL in failure table vs SIGTERM in D4
- **C5** `decisions.md` D23 -- same as C2 (duplicate finding)

## GAPS

- **G1** No consolidated `~/.flow-config.yaml` reference
- **G2** `daemon-lifecycle.md` startup sequence missing D24 reconnection window
- **G3** `quiet` in ClientCommand has no defined daemon-side behavior
- **G4** `maxIterations` does not bound idempotent crash retries
- **G5** `worker-register` HTTP vs WebSocket `ready` -- purpose overlap undefined
- **G6** Execution ID format never specified
- **G7** Worker spawn arguments (argv/env) not specified

## STALE / WRONG REFERENCES

- **S1** `index.md` "40-line in-memory tail (D17)" -- not in D17
- **S2** `index.md` worker pool item cites D18, should cite D5
- **S3** `decisions.md` D11 body describes D23's model, not D11's original model
- **S4** `daemon-lifecycle.md` "heartbeat monitoring" stale after D23

## TERMINOLOGY

- **T1** "execution queue" (D13) vs "ready-step queue" (D16) -- same thing, two names
- **T2** `POST /quit` (daemon-lifecycle.md) vs `{ type: 'stop' }` (ipc-protocol.md)
