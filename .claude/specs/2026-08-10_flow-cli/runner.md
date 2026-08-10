# FlowCliRunner

Source: `packages/flow-cli/src/FlowCliRunner.ts`

## Construction

```ts
new FlowCliRunner(projectRoot: string)
```

- Creates `FlowRegistry(projectRoot)` — `projectRoot` is the `cwd` argument
- Creates `FlowExecutor(false, registry)` — `false` = non-interactive mode
- Both are stored as instance fields

## `run(options: RunOptions): Promise<FlowExecutionResult>`

### Options

```ts
interface RunOptions {
  flowRef: string;          // file path or flow ID
  flowsFile?: string;       // unused — loadProjectFlows() uses fixed paths
  inputs?: Record<string, string>;  // default: {}
  cwd?: string;             // default: process.cwd()
}
```

### ExecutionConfig passed to `executor.execute()`

```ts
{
  taskId:   `cli-${Date.now()}`,
  flow,     // FlowDefinition from registry
  workspace: {
    id:           `ws-${taskId}`,
    path:         cwd,
    mode:         'manual',
    concurrency: {
      key:         taskId,
      activeTasks: new Set<string>(),
      locked:      false,
    },
    createdAt:    new Date().toISOString(),
    lastUsedAt:   new Date().toISOString(),
    usageCount:   1,
  },
  inputs,               // from RunOptions.inputs
  interventionHandler:  new ThrowInterventionHandler(),
}
```

Fields NOT set (all default inside `FlowExecutor`): `taskMetadata`, `claudeEnv`, `onClaudeProcessStarted`, `onTraceUpdate`, `nestingDepth`.

## ThrowInterventionHandler

Source: `packages/flow-cli/src/interventions/ThrowInterventionHandler.ts`

Implements `InterventionHandler`. On any `requestIntervention()` call:

```
Error: Flow contains a user_intervention step ('<stepId>'). Use Agent Fleet for interactive flows, or run with a flow that has no user_intervention steps.
```

Interactive HITL is not supported in v1. Throwing propagates up through `FlowExecutor` → `FlowCliRunner.run()` → caught in `RunCommand` → exit 1.

## Output printing

Output is printed by `RunCommand.ts`, not by `FlowCliRunner`. The runner returns a `FlowExecutionResult`; the command formats it:

```
✓ Flow '<flowRef>' completed in <N>ms

Outputs:
  <stepId>.<key>: <value>
```

- Duration: `Date.now() - start` recorded around `runner.run()`
- `result.outputs` is `Record<string, Record<string, unknown>>`
- Objects → `JSON.stringify(value)`, primitives → `String(value)`
- The `Outputs:` block is omitted entirely when `Object.entries(result.outputs).length === 0`
