# Agent Fleet

Multi-agent orchestration system for autonomous software development using Claude Code.

## Architecture

Two independent systems live in this monorepo:

1. **Agent Fleet** — the current production system: orchestrator + workers + web UI
2. **Flow CLI** — in design (see `specs/2026-07-30-flow-cli/`) — a standalone daemon-based CLI for running flows without the web stack

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

| Package | Role |
|---|---|
| `packages/orchestrator` | Long-running coordinator. Owns task queue, worker pool, WebSocket server for workers (port 3738), REST API (port 3737), intervention routing, and event bridge to web-backend. Can run as a standalone process or embedded inside web-backend. |
| `packages/worker` | Long-running agent process. Connects to orchestrator via WebSocket, receives task assignments, runs `FlowExecutor` from `flow-engine`, manages Claude subprocess lifecycle, reports results. |
| `packages/web-backend` | Fastify HTTP/WebSocket server. REST API for the frontend, SSE/WebSocket event broadcasting, auth (JWT), workspace/project/flow/task CRUD, storage. Embeds `orchestrator` in library mode. |
| `packages/web-frontend` | React SPA (Vite). Dashboard, task management, visual flow editor (`@xyflow/react`), real-time event consumption. |
| `packages/legacy-cli` | Thin CLI binary (`fleet-task`). Submits tasks to the orchestrator REST API from the command line. No web UI needed. |

### Libraries

| Package | Role |
|---|---|
| `packages/flow-engine` | Pure engine library. Flow YAML parsing, validation (graph, schema, semantic), step execution (`StepRunner`, `FlowExecutor`, `FlowOrchestrator`), Claude process launching, workspace management, flow registry. No process lifecycle — consumed by orchestrator and worker. |
| `packages/shared-common` | Zero-dependency utilities: WebSocket message serialization protocol, structured logger, port calculator, shutdown interface, error helpers. |
| `packages/shared-orch-worker` | Contract layer between orchestrator and worker processes. Typed message envelopes (`O2WMessage`, `W2OMessage`), task domain types (`TaskStatus`, `Task`), orchestrator event types, `StateManager`. |
| `packages/shared-frontend-backend` | HTTP API contract layer between web-backend and web-frontend. Typed API contracts per domain, route-builder helpers, WebSocket/SSE/polling transport protocol types. |

### Test infrastructure

| Package | Role |
|---|---|
| `packages/test-utils` | Shared test factories, mock builders, REST API helpers. Dev-only dependency. |
| `packages/e2e-web` | Playwright end-to-end test suite against the full running web app and Storybook. |

## Dependency graph

```
shared-common           (no local deps)
shared-orch-worker      (no local deps)
flow-engine          ←  shared-common, shared-orch-worker
orchestrator         ←  flow-engine, shared-common, shared-orch-worker
worker               ←  flow-engine, shared-common, shared-orch-worker
shared-frontend-backend ← shared-common
web-backend          ←  orchestrator, shared-common, shared-frontend-backend, shared-orch-worker
web-frontend         ←  shared-frontend-backend
legacy-cli           ←  orchestrator, shared-common, shared-orch-worker
```

## Quick start

```bash
npm install

# Start the full stack (orchestrator + web-backend)
npm run dev

# Start a worker (separate terminal)
npm run worker:flow

# Submit a task via CLI
npm run add-task create "Add user authentication" high
```

Web UI: `http://localhost:5173`
Orchestrator API: `http://localhost:3737`

## Flow CLI (in design)

A standalone alternative to the web stack. One binary, no server required.

```bash
flow run ./my-flow.yml --input branch=feat/my-feature
flow attach <execution-id>
flow logs <execution-id>
```

See `specs/2026-07-30-flow-cli/` for the full architecture spec (27 decisions, actively being brainstormed).

## Development

```bash
npm run build       # build all packages
npm test            # run all tests
npm run check       # TypeScript + ESLint across monorepo
```

Test files live next to implementation (`FlowExecutor.ts` / `FlowExecutor.test.ts`).
