# Policy Engine — Spec Index

> Spec created 2026-08-19. Source material: `.claude/specs/2026-07-30-flow-cli/`.

## What is the policy engine?

The policy engine is an **autonomous external CLI** that enforces rules on running flow executions. It is **not a step inside a flow** — it runs independently, triggered by flow lifecycle events.

It receives events via the daemon's hook system (`HookDispatcher`) and takes actions by calling the **daemon's HTTP API** — the same API that workers also use for step injection. This makes the interface clean, reusable, and not tied to any Claude-specific protocol.

## Architecture

```
Daemon
  ├── WebSocket server (127.0.0.1:<wsPort>)
  │     └── control messages only: assign / ready / step_completed / step_failed / done
  │
  └── HTTP API server (127.0.0.1:<apiPort>)        ← new, shared by workers + policy engine
        POST /api/executions/:id/steps             ← inject steps
        POST /api/executions/:id/block             ← block execution
        GET  /api/executions/:id/state             ← read flow state (v2)
        Auth: Bearer <daemon-token>


Worker (StepExecutor)
  ├── Claude subprocess ── MCP tools/call ──► McpServer (HTTP/JSON-RPC, per-execution)
  │                                                │
  │                         onInjectSteps callback │
  │                                                ▼
  └────────────────── POST /api/executions/:id/steps ──► Daemon HTTP API


Policy Engine CLI (external, autonomous)
  │
  ├── receives events via HookDispatcher (http hook)
  │     payload: { event, executionId, daemonApiUrl, daemonToken, flowState, ... }
  │
  └── evaluates rules + conditions
        │
        └── POST /api/executions/:id/steps   ──► Daemon HTTP API  (same endpoint as workers)
            POST /api/executions/:id/block   ──► Daemon HTTP API
```

## Key design principles

- **One action interface**: workers and the policy engine both call the same daemon HTTP API. No special protocol per caller.
- **MCP stays for Claude only**: `McpServer` is a translation layer for Claude subprocess → daemon API. The policy engine does not speak MCP.
- **Events via hooks**: the `HookDispatcher` delivers events to the policy engine (http hook). The event payload carries `daemonApiUrl` and `daemonToken` so the policy engine can call back.
- **Authentication**: all daemon HTTP API calls require a `Bearer <token>`. The token is generated at daemon startup and distributed via the hook payload and worker environment.

## Documents

- [decisions.md](decisions.md) — Architecture decisions
- [abstractions.md](abstractions.md) — HTTP API endpoints, auth, rule schema, event payload
- [open-questions.md](open-questions.md) — Open design questions
