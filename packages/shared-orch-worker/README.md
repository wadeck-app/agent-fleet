# shared-orch-worker

Contract layer defining the communication protocol between orchestrator and worker.

## Purpose

Owns all typed message envelopes, task domain types, and state management shared by the orchestrator-worker pair.

## Responsibility

- Typed message envelopes: O2WMessage (orchestrator-to-worker) and W2OMessage (worker-to-orchestrator)
- Task domain types: Task, TaskStatus, and related value objects
- Orchestrator event types consumed downstream
- StateManager: shared state tracking logic used by both sides

## Does NOT own

- Transport (WebSocket server/client setup) — that's orchestrator and worker
- Business logic (task queuing, scheduling) — that's orchestrator
- Flow execution — that's flow-engine

## Dependencies on local packages

None (only zod for schema validation).

## Consumers

orchestrator, worker, flow-engine, web-backend, legacy-cli.

## Entry point type

Library.

## Key files

- `src/messages/O2WMessage.ts` — typed messages sent from orchestrator to worker
- `src/messages/W2OMessage.ts` — typed messages sent from worker to orchestrator
- `src/domain/Task.ts` — Task entity and TaskStatus enum
- `src/state/StateManager.ts` — shared state tracking used by orchestrator and worker
- `src/events/` — orchestrator event type definitions
