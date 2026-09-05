# web-frontend

React SPA (Vite) -- the agent-fleet web user interface.

## Purpose

Provides the complete browser-based UI for managing tasks, flows, projects, workspaces, workers, and interventions.

## Responsibility

- Dashboard and navigation shell
- Task management views
- Visual flow editor (using @xyflow/react)
- Project and workspace management views
- Worker status views
- Intervention handling UI
- Real-time event consumption via typed transport (SSE, WebSocket, long-polling)

## Does NOT own

- API business logic -- that's web-backend
- Data persistence -- that's web-backend
- Flow execution -- that's flow-engine

## Dependencies on local packages

- shared-frontend-backend (typed API contracts and transport types)

## Consumers

None -- end-user browser application.

## Entry point type

React SPA (Vite build, served as static assets).

## Key files

- `src/App.tsx` -- root component, routing setup
- `src/features/flows/FlowEditor.tsx` -- visual flow editor built on @xyflow/react
- `src/features/tasks/` -- task list, detail, and creation views
- `src/transport/` -- typed real-time event client (SSE/WS/polling abstraction)
- `src/api/` -- typed HTTP client generated from shared-frontend-backend contracts
