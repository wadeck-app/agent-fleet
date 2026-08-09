# web-backend

Fastify HTTP/WebSocket server — the backend of the agent-fleet web application.

## Purpose

Serves the REST API and real-time event streams consumed by the web frontend, while embedding the orchestrator for task coordination.

## Responsibility

- REST API implementation (controllers, services, repositories per domain)
- File-based and in-memory storage for persistence
- JWT authentication
- Workspace CRUD and git integration
- Task, intervention, flow, worker, and project management endpoints
- Real-time event broadcasting to clients: SSE, WebSocket, and long-polling transports
- Orchestrator bridging: embeds orchestrator in `ORCHESTRATOR_MODE=library`

## Does NOT own

- UI rendering — that's web-frontend
- Flow execution — that's flow-engine (via embedded orchestrator)
- Worker process management — that's orchestrator (embedded)

## Dependencies on local packages

- orchestrator (embedded)
- shared-common
- shared-frontend-backend
- shared-orch-worker

## Consumers

web-frontend (HTTP API client), e2e-web (test target).

## Entry point type

Long-running process.

## Key files

- `src/server.ts` — Fastify server setup, plugin registration, startup
- `src/controllers/` — route handlers per domain (tasks, flows, workspaces, etc.)
- `src/services/` — business logic layer between controllers and repositories
- `src/repositories/` — data access (file-based and in-memory)
- `src/events/EventBroadcaster.ts` — dispatches backend events to connected clients via SSE/WS/polling
