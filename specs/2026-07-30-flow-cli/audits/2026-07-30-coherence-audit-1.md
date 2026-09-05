# Coherence Audit -- 2026-07-30 (Round 1)

Performed by automated agent after brainstorm session decisions D1-D24.

## Issues found and resolved

### Contradictions

1. **D11 vs D23** -- D11 described `child_process.fork` + Node IPC heartbeats. D23 superseded it with WebSocket. D11 not marked as superseded. **Fixed:** D11 now marked superseded by D23.

2. **D3 vs D23** -- D3 stated workers send heartbeats. D23 stated no heartbeat needed (connection health is liveness). **Fixed:** D3 rewritten to reflect WebSocket liveness model.

3. **`ipc-protocol.md` heartbeat message vs D23** -- `WorkerMessage` included `{ type: 'heartbeat' }`. Contradicted D23. **Fixed:** removed from protocol, no heartbeat message type exists.

4. **`execution-model.md` worker lifecycle diagram vs D23** -- showed HTTP POST `/worker-register`, `/heartbeat`, `/log`, `/step-completed`. Entire diagram was pre-WebSocket. **Fixed:** diagram rewritten for WebSocket model.

5. **`execution-model.md` reconnection diagram vs D23** -- showed reconnection via HTTP POST to new port. Contradicted CLI binary fallback model. **Fixed:** rewritten with CLI binary + WebSocket reconnect sequence.

6. **`ipc-protocol.md` client commands `attach`/`logs`/`list` vs D19/D21** -- these commands were listed as daemon commands. D19/D21 say they are pure file operations. **Fixed:** removed from protocol, added note explaining why.

7. **`ipc-protocol.md` `log` DaemonResponse type vs D19** -- daemon streaming log entries to client contradicts D19 (logs are read from disk). **Fixed:** removed.

8. **`execution-model.md` queue behavior vs D16** -- "max simultaneous RUNNING executions" framing contradicted D16's cross-flow step queue model. **Fixed:** queue behavior now describes max simultaneous steps (not flows).

9. **`execution-model.md` heartbeat failure table vs D23** -- table said "IPC closed" and "heartbeat timeout". Neither applies under WebSocket model. **Fixed:** table rewritten for WebSocket connection close events.

### Stale content

10. **D11 not marked superseded** -- Fixed (see item 1).
11. **D21 used "IPC" for worker communication** -- Fixed: "IPC" replaced with "WebSocket" throughout.
12. **`ipc-protocol.md` "internal IPC" section title** -- Fixed: section renamed "Worker↔Daemon (WebSocket)".

### Gaps filled

13. **`ExecutionSummary` undefined** -- Removed undefined type reference; `flow list` reads execution files directly.
14. **`FlowExecutionResult` / `LogEntry` / `StepOutput` undefined** -- Added note in `ipc-protocol.md` pointing to `flow-engine/src/types.ts` as definition source.
15. **`maxIterations` default and syntax** -- Added YAML example with `maxIterations: 3` and `onFailure.goto` in D12.
16. **Worker buffer spill threshold N undefined** -- Defined as `worker.bufferSpillMs` (default: 15000ms) in D23.
17. **`orphaned` DaemonResponse delivery mechanism** -- Removed: under D19 there is no daemon response for `flow attach`. Idempotent retry creates a new execution file; `flow attach` on the old ID sees `FAILED` + a new execution ID in the log.
18. **`onFailure.goto` YAML syntax** -- Added example in D12.

### Index open items

19. All resolved items confirmed marked `[x]` in `index.md`.
20. `ipc-protocol.md` stale content now fixed (items 3, 6, 7, 12 above).
