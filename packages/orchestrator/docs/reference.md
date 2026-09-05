# Reference

_Moved from README -- see [README](../README.md) for the overview._

- `src/TaskManager.ts` -- task queue: enqueue, dequeue, status tracking
- `src/WorkerCoordinator.ts` -- worker registration and task dispatch
- `src/InterventionManager.ts` -- routes human intervention requests to the right worker
- `src/FlowDiscoveryRegistry.ts` -- discovers available flows and surfaces them via API
- `src/BackendEventBridge.ts` -- forwards orchestrator events to web-backend for client broadcasting
