# Policy Engine — Open Questions

> Spec created 2026-08-19.

## OQ-1 — Daemon HTTP API port: fixed or dynamic?

The daemon already has a WebSocket port (`wsPort`). Should the HTTP API run on a fixed port (e.g. `wsPort + 1`) or be dynamically allocated and written to a known file (like `~/.flow-daemon/api.port`)? Dynamic is safer (no port conflicts), but the policy engine needs a discovery mechanism.

## OQ-2 — Hook failures are silently ignored (D32 in source spec)

`HookDispatcher` v1 ignores all hook failures. If the policy engine is unreachable or returns an error, the flow continues unaffected. Is this acceptable? For blocking use cases it is not — a policy engine that errors should probably fail the flow, not silently let it continue.

## OQ-3 — `GET /state` vs snapshot in hook payload

The hook payload already includes a `flowState` snapshot. Is `GET /api/executions/:id/state` (v2) still necessary, or is the snapshot sufficient? Main gap: the snapshot is stale by the time the policy engine makes an inject call. A live `GET /state` would allow checking for duplicate step IDs before injecting.

## OQ-4 — Multiple policy engines / conflicting actions

Can multiple `http` hooks point to different policy engine instances? If both inject a step with the same ID on the same event, one will get a `409`. Is that the intended conflict resolution, or should there be an ordering guarantee?

## OQ-5 — `block` resume / cancel

`POST /block` suspends execution. How is it resumed? Should the daemon HTTP API expose `POST /api/executions/:id/resume` and `POST /api/executions/:id/cancel`? Who is allowed to resume (only the policy engine that blocked it, or any authenticated caller)?
