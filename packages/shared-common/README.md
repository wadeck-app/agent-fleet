# shared-common

Zero-dependency utility library shared across all packages in the monorepo.

## Purpose

Provides foundational primitives that every package depends on: serialization, logging, port assignment, and shutdown coordination.

## Responsibility

- WebSocket message serialization/deserialization protocol
- Structured logger (consistent log format across all processes)
- Port calculator (deterministic port assignment per service)
- Shutdown interface (graceful-stop contract)
- Error helpers (typed error construction and handling)

## Does NOT own

- Business domain types (tasks, flows, workers) — those live in shared-orch-worker or shared-frontend-backend
- Transport concerns (HTTP, WebSocket servers) — those live in the consuming packages
- Configuration loading

## Dependencies on local packages

None.

## Consumers

Every package in the monorepo: shared-orch-worker, flow-engine, orchestrator, worker, web-backend, web-frontend (via shared-frontend-backend), legacy-cli, test-utils, e2e-web.

## Entry point type

Library.

## Key files

- `src/logger/` — structured logger, used by all processes for consistent output
- `src/websocket/` — message serialization protocol shared between server and client sides
- `src/ports/` — port calculator so each service resolves its own port deterministically
- `src/shutdown/` — shutdown interface implemented by long-running processes
- `src/errors/` — typed error helpers
