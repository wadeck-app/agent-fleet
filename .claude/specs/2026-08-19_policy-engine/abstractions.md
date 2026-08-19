# Policy Engine — Abstractions and Data Structures

> Extracted from `.claude/specs/2026-07-30-flow-cli/decisions.md` and `abstractions.md` on 2026-08-19.

---

## `provideSteps` input schema

Defined in D39. The payload sent to the `provideSteps` MCP tool:

```typescript
interface ProvideStepsInput {
  steps: InjectedStep[];
}

interface InjectedStep {
  id: string;                             // unique in the execution graph
  type: 'model' | 'script' | 'subflow';  // user_intervention is NOT allowed
  parent?: string;                        // ID of parent step — makes this a sub-step
  depends?: string[];                     // step IDs that must complete first
  onFailure?: { goto: string };           // bounded cycle; maxIterations from D12 applies
  // All standard step fields also apply: prompt, command, env, output, etc.
}
```

**Return value on success:**
```json
{ "injected": ["step-id-1", "step-id-2"] }
```

**Error cases (MCP tool error returned to caller):**
- `id` already exists in graph
- `parent` not found in graph
- `depends` references non-existent step
- `type: user_intervention` used
- `maxChildDepth` exceeded

---

## `parent` field semantics

The `parent` field on `InjectedStep` (and on static YAML steps) creates a parent/child relationship:

- Parent step is **not complete** until all its sub-steps reach a terminal state.
- Sub-steps of step A complete before step B (which `depends: [A]`) can start.
- `parent` controls completion scope; `depends` (within sibling sub-steps) controls start ordering.
- `parent`/child hierarchy is recursive — sub-steps can have their own sub-steps.
- Depth limit: `maxChildDepth` (default: 10, configurable in `.flows/config.yml` → `execution.maxChildDepth`).

---

## Flow MCP server — lifecycle and scope

Each worker starts a per-execution MCP server instance when it receives an `assign` message. The server:

- Is bound to a single `executionId` (implicit — not passed in tool calls).
- Exposes `provideSteps` in v1.
- Is started before `claude -p` is launched for the step.
- Uses `--strict-mcp-config` to prevent user's personal MCP servers from interfering.

The server does not exist before the first `assign` message — workers are execution-agnostic at spawn time.

---

## `ExecutionContext` — context passed to workers

Defined in `packages/flow-cli/src/ipc/Protocol.ts` (CLI-specific type, distinct from `FlowExecutionContext` in flow-engine):

```typescript
interface ExecutionContext {
  executionId: string;
  inputs: Record<string, string>;
  stepOutputs: Record<string, Record<string, any>>;
  workspaceDir: string;
}
```

Workers (and policy steps) receive the full `ExecutionContext` on each `assign` message. This is the data available for a policy step to inspect before deciding what to inject.

---

## `InjectedStep` vs `FlowStep` (from flow-engine)

- `FlowStep` (flow-engine/src/types.ts line 669) — union type `ModelFlowStep | ScriptFlowStep | SubFlowStep`. Used in the static YAML and in `assign` messages.
- `InjectedStep` (D39) — subset of `FlowStep` fields, passed as the `provideSteps` argument. No `executionId` field (implicit from MCP server instance).

A policy step that injects steps passes `InjectedStep[]` objects. The daemon validates, extends them with runtime metadata, and incorporates them into the live graph as `FlowStep` nodes.

---

## `.flows/config.yml` — policy-relevant fields

From D37:

```yaml
execution:
  maxChildDepth: 10    # max parent/child nesting depth; policy steps respect this ceiling
```

This is the only `.flows/config.yml` field directly relevant to policy engine behavior. All other fields relate to hooks, task storage, and defaults.
