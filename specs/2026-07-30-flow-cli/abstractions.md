# Extracted Abstractions

These interfaces decouple the flow engine from infrastructure concerns. Each has a CLI implementation (minimal/unsupported) and a path to full implementation for other contexts (web, orchestrator).

## InterventionHandler

Already exists: `packages/flow-engine/src/executor/InterventionHandler.ts`

CLI implementation: throws `UnsupportedOperationError("user_intervention steps are not supported in CLI mode")`.

## WorkspaceProvider

```typescript
interface WorkspaceProvider {
	prepare(flowDef: FlowDefinition): Promise<string>; // returns workspace directory path
	cleanup(workspaceDir: string): Promise<void>;
}
```

CLI implementation (`DeclaredWorkspaceProvider`):

- Reads `workspace` field from flow definition or `--workspace` flag
- If flow declares `mode: isolated` or a git strategy → throws `UnsupportedOperationError`
- Otherwise returns the declared path as-is

The full `WorkspaceManager` implementation satisfies this interface for orchestrator/web contexts.

## ExecutionReporter

```typescript
interface ExecutionReporter {
	onExecutionStarted(executionId: string): void;
	onLogEntry(executionId: string, entry: LogEntry): void;
	onExecutionCompleted(executionId: string, result: FlowExecutionResult): void;
	onExecutionFailed(executionId: string, error: Error): void;
}
```

CLI implementation: formats and writes to stdout based on TTY detection and `--json`/`--quiet`/`--no-prefix` flags.

**Role clarification:** `ExecutionReporter` is used by `flow attach` (the tailing process) to format and emit log output. It is not used by the CLI process that sends `flow run` -- that process exits immediately after receiving the execution ID (D2).

## QueueStrategy (future)

Not implemented in first version. Single queue with fixed concurrency. Interface defined here as a placeholder for when multiple queues are needed.
