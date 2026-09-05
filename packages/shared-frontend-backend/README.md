# shared-frontend-backend

HTTP API contract layer between web-backend and web-frontend.

## Purpose

Single source of truth for the shape of every HTTP request/response, WebSocket message, SSE event, and polling payload exchanged between backend and frontend.

## Responsibility

- Typed API contracts per domain: tasks, flows, projects, workspaces, interventions, workers, auth, monitoring
- Route-builder helpers for constructing typed API paths
- WebSocket, SSE, and long-polling transport protocol types
- Backend-to-frontend event constants (event names and payload shapes)

## Does NOT own

- Runtime HTTP handling -- that's web-backend
- UI rendering -- that's web-frontend
- Business logic -- that's web-backend services

## Dependencies on local packages

- shared-common

## Consumers

web-backend (implements the contracts), web-frontend (consumes them), e2e-web (uses types for assertions).

## Entry point type

Library.

## Key files

- `src/contracts/tasks.ts` -- task API request/response types
- `src/contracts/flows.ts` -- flow API request/response types
- `src/transport/` -- WebSocket/SSE/polling protocol type definitions
- `src/events/` -- backend-to-frontend event name constants and payload types
- `src/routes/` -- route-builder helpers for type-safe path construction
