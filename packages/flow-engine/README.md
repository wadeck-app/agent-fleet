# flow-engine

Pure execution library for parsing and running agent flows.

## Purpose

Owns everything required to load a flow definition from YAML and execute it step by step, with no process lifecycle or networking concerns.

## Responsibility

- Flow YAML parsing and schema validation
- Graph validation -- flows support bounded cycles via `onFailure.goto`; the graph is NOT required to be a strict DAG
- Step execution: StepRunner drives individual steps, FlowExecutor runs a full flow, FlowOrchestrator coordinates multi-flow scenarios
- Claude process launching via ClaudeLauncher
- Workspace management (per-flow working directories) via WorkspaceManager
- Flow auto-discovery and registration via FlowRegistry
- Template rendering for step inputs
- Output extraction from step results

## Does NOT own

- Process lifecycle (starting/stopping worker processes) -- that's worker
- WebSocket servers or clients -- that's orchestrator and worker
- Task queuing and scheduling -- that's orchestrator

## Dependencies on local packages

- shared-common
- shared-orch-worker

## Consumers

orchestrator, worker.

## Entry point type

Library.

## Key files

- `src/FlowExecutor.ts` -- executes a single flow end-to-end
- `src/StepRunner.ts` -- executes one step within a flow
- `src/FlowOrchestrator.ts` -- coordinates execution across multiple flows
- `src/ClaudeLauncher.ts` -- spawns and manages Claude subprocess per step
- `src/FlowRegistry.ts` -- auto-discovers and registers available flows from disk
