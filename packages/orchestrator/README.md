# orchestrator

Long-running coordinator process that manages task queuing, worker dispatch, and external integrations.

## Purpose

Central coordinator: accepts tasks, assigns them to workers, tracks state, and exposes APIs to clients.

## Responsibility

- Task queue via TaskManager
- Worker lifecycle and task dispatch via WorkerCoordinator
- WebSocket server for workers on port 3738
- REST API for clients on port 3737
- Human intervention routing via InterventionManager
- Metrics collection and state snapshots
- Flow discovery registry via FlowDiscoveryRegistry
- Event bridge to web-backend via BackendEventBridge

## Does NOT own

- Flow execution logic -- that's flow-engine
- UI or HTTP clients -- that's web-frontend
- Per-task Claude subprocess management -- that's worker

## Deployment modes

Can run as a standalone process OR embedded inside web-backend (`ORCHESTRATOR_MODE=library`).

## Dependencies on local packages

- flow-engine
- shared-common
- shared-orch-worker

## Consumers

web-backend (embeds it), legacy-cli (sends tasks via REST API).

## Entry point type

Long-running process (also usable as embedded library).

## Key files

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
