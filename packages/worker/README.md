# worker

Long-running agent process that receives tasks from the orchestrator and executes them.

## Purpose

Executes assigned tasks by invoking flow-engine and managing the Claude subprocess lifecycle.

## Responsibility

- WebSocket connection to orchestrator (port 3738)
- Task assignment reception and acknowledgement
- FlowExecutor invocation for task execution
- Claude subprocess lifecycle management via ClaudeLifecycleManager
- Result and status reporting back to orchestrator

## Does NOT own

- Task queuing or scheduling -- that's orchestrator
- Flow graph construction or YAML parsing -- that's flow-engine
- Human intervention routing -- that's orchestrator

## Dependencies on local packages

- flow-engine
- shared-common
- shared-orch-worker

## Consumers

None -- standalone process spawned by the orchestrator or by the user directly.

## Entry point type

Long-running process.

## Key files

- `src/WorkerAgent.ts` -- main process entry: connects to orchestrator, handles task lifecycle
- `src/ClaudeLifecycleManager.ts` -- manages Claude subprocess start, output streaming, and termination
- `src/TaskExecutor.ts` -- bridges task assignment to flow-engine execution
