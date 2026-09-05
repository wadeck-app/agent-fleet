# Agent Fleet

Multi-agent orchestration system for autonomous software development using Claude Code.

## Architecture

Two independent systems live in this monorepo:

1. **Agent Fleet** -- the current production system: orchestrator + workers + web UI
2. **Flow CLI / Task CLI** -- standalone daemon-based CLIs for running flows and managing tasks without the web stack

```
web-frontend  ──HTTP/WS──>  web-backend  ──embedded──>  orchestrator
                                                              │
                                                         WebSocket
                                                              │
                                              ┌───────────────┼───────────────┐
                                          worker          worker          worker
                                              │
                                        flow-engine
                                        (StepRunner, ClaudeLauncher, ...)
```

## Packages

### Runtime processes

| Package                 | Role                                                                                                                                                                                                                                           |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/orchestrator` | Long-running coordinator. Owns task queue, worker pool, WebSocket server for workers (port 3738), REST API (port 3737), intervention routing, and event bridge to web-backend. Can run as a standalone process or embedded inside web-backend. |
| `packages/worker`       | Long-running agent process. Connects to orchestrator via WebSocket, receives task assignments, runs `FlowExecutor` from `flow-engine`, manages Claude subprocess lifecycle, reports results.                                                   |
| `packages/web-backend`  | Fastify HTTP/WebSocket server. REST API for the frontend, SSE/WebSocket event broadcasting, auth (JWT), workspace/project/flow/task CRUD, storage. Embeds `orchestrator` in library mode.                                                      |
| `packages/web-frontend` | React SPA (Vite). Dashboard, task management, visual flow editor (`@xyflow/react`), real-time event consumption.                                                                                                                               |
| `packages/legacy-cli`   | Thin CLI binary (`fleet-task`). Submits tasks to the orchestrator REST API from the command line. No web UI needed.                                                                                                                            |
| `packages/flow-cli`     | Standalone CLI (`flow`). Runs and validates agent flows via a background daemon. No web stack required. Install: `npm install -g @wadeck-app/flow-cli`.                                                                                       |
| `packages/task-cli`     | Standalone CLI (`task`). Local task tracker with YAML config and lifecycle hooks. Install: `npm install -g @wadeck-app/task-cli`.                                                                                                             |

### Libraries

| Package                            | Role                                                                                                                                                                                                                                                                        |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/flow-engine`             | Pure engine library. Flow YAML parsing, validation (graph, schema, semantic), step execution (`StepRunner`, `FlowExecutor`, `FlowOrchestrator`), Claude process launching, workspace management, flow registry. No process lifecycle -- consumed by orchestrator and worker. |
| `packages/shared-common`           | Zero-dependency utilities: WebSocket message serialization protocol, structured logger, port calculator, shutdown interface, error helpers.                                                                                                                                 |
| `packages/shared-orch-worker`      | Contract layer between orchestrator and worker processes. Typed message envelopes (`O2WMessage`, `W2OMessage`), task domain types (`TaskStatus`, `Task`), orchestrator event types, `StateManager`.                                                                         |
| `packages/shared-frontend-backend` | HTTP API contract layer between web-backend and web-frontend. Typed API contracts per domain, route-builder helpers, WebSocket/SSE/polling transport protocol types.                                                                                                        |

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
