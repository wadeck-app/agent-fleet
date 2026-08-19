# Policy Engine — Decisions

> Spec created 2026-08-19.

## D-PE1 — Policy engine is an external autonomous CLI, not a flow step

The policy engine runs independently of the flow graph. It is triggered by events, not scheduled as a step. It can therefore observe and modify any execution without being subject to the same graph constraints.

## D-PE2 — Daemon exposes a dedicated HTTP API for step injection and flow control

The daemon runs an HTTP server (`127.0.0.1:<apiPort>`) alongside the existing WebSocket server. The WebSocket remains for control messages between daemon and workers (assign, ready, step_completed, etc.). The HTTP API handles all action calls: inject steps, block execution, read state (v2).

**Why HTTP and not WebSocket for actions:** HTTP is stateless, standard, and reusable by any caller (worker, policy engine, future tooling). WebSocket messages are an internal implementation detail — exposing them to external tools would couple the external interface to the internal control protocol.

**Implication:** the current `inject_steps` WebSocket message (Worker → Daemon) must be replaced by `POST /api/executions/:id/steps`. The `McpServer`'s `onInjectSteps` callback makes this HTTP call instead of calling `sendMessage`.

## D-PE3 — Workers and the policy engine use the same daemon HTTP API

There is one action interface. `McpServer.onInjectSteps` calls `POST /api/executions/:id/steps`. The policy engine calls the same endpoint. No special protocol per caller type.

**Why:** avoids duplicating validation logic (step ID uniqueness, parent resolution, depth check). The daemon validates once, for everyone.

## D-PE4 — MCP stays for Claude subprocess only

`McpServer` is a translation layer: Claude calls `tools/call provideSteps` via JSON-RPC, the server translates to `POST /api/executions/:id/steps`. External tools (policy engine) do not speak MCP — they call the HTTP API directly.

## D-PE5 — Event delivery via existing HookDispatcher (http hook)

The policy engine registers as an `http` hook in `.flows/config.yml`. The daemon fires it on each configured event. The payload includes `daemonApiUrl` and `daemonToken` so the policy engine can call back without any separate discovery step.

## D-PE6 — Daemon HTTP API requires Bearer token authentication

The daemon generates a token at startup (`crypto.randomBytes(32).toString('hex')`). It is distributed to workers via `FLOW_DAEMON_TOKEN` env var and to external hooks via the event payload (`daemonToken` field). All API requests without a valid token return `401`.

**Why:** the daemon HTTP API mutates execution state. Even on loopback, an unauthenticated endpoint would be callable by any local process.
