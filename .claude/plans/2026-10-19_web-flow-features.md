# Flow CLI features in the web part

## Decision

"Web part" = `packages/web-backend` (Fastify, the only HTTP API both UIs call) and its two clients: `packages/web-frontend` (React) and the DSL app `capability-framework/packages/dsl-agent-fleet-app` (same `/api/*` paths, same origin). `app-module-flow` is a separate app-core host, not the web part.

Evidence: `dsl-agent-fleet-app/src/runners/fetchApi.ts` calls web-backend paths (`/api/tasks/`, `/api/workers/`...); web-frontend and DSL app both active (commits 2026-10-17); no doc declares one obsolete. Neither has flow-core features today.

## Gaps (CLI feature vs web)

| Feature | web-backend | web-frontend | DSL app |
|---|---|---|---|
| Executions history | missing | missing | missing |
| Execution detail (step errors) | missing | missing | missing |
| Worker declared sources | missing (live workers only, via orchestrator) | missing | missing |
| CLI/daemon logs | missing (only task logs) | missing | missing |
| Plugins list/detail | missing | missing | missing |
| Flow definition | `/api/flows/:id` exists | flow editor exists | n/a |

## Scope

1. flow-core (additions only): `ExecutionView` projection (moved from app-module-flow, which should import it), neutral `classifyFlowError`.
2. web-backend: contract `/api/flow-daemon/*` (Zod), `FlowDaemonController` over an injected `FlowQueryService`, factory wiring, tests.
3. Dependency direction test: flow-cli and web-* never import each other; both may import flow-core.
4. DSL pages (capability-framework): executions, execution detail, plugins, logs, workers sources, if time allows.
5. web-frontend pages: delegated to `frontend-dev` only.

Out: flow definition (already covered), write operations.
