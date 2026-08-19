# Policy Engine — Architecture Decisions

> Extracted from `.claude/specs/2026-07-30-flow-cli/decisions.md` on 2026-08-19.

---

## D35 — Flow MCP server: per-execution, exposes `provideSteps`

Each worker starts a per-execution MCP server upon receiving the `assign` message (which provides the `executionId`). The MCP server is started before launching `claude -p` for that step. Workers are execution-agnostic before `assign` — no MCP server exists before that point. Claude is invoked with `--mcp-config <temp_config> --strict-mcp-config` so only the flow engine's tools are available.

**Why MCP:** `claude -p` natively supports `--mcp-config`. Claude calls tools via the MCP protocol — the worker's MCP server receives calls and responds. No stream-json interception, no stdin injection needed.

**`--strict-mcp-config`:** prevents the user's personal MCP servers from interfering with the execution environment.

**v1 tools exposed (minimum for step injection):**
- `provideSteps(steps: Step[])` — inject steps into the running graph

**v2+ tools (not scoped yet, architecture supports them):**
- `logMessage`, `setTodo`, `askUser`, `getFlowState`, `getStepOutput`

**Why this matters for the policy engine:** this is the primary bidirectional interface between Claude (or a policy step) and the flow engine. All policy enforcement happens through `provideSteps` in v1. Future tools (`getFlowState`, `getStepOutput`) will enable read-before-enforce patterns without any architectural change.

---

## D36 — Dynamic step injection: `provideSteps` tool, `parent` field, recursive hierarchy

**Injection mechanism:** Model steps (and, by design, any step type including a future `policy` type) call `provideSteps` via the flow MCP server (D35). Any step type can inject steps.

**`parent` field:** injected steps declare `parent: "<step-id>"` to become sub-steps of that step. The parent step is not `done` until all its sub-steps are `done`. Without `parent`, the injected step is a regular graph step.
The `parent` field is valid in both static YAML and in steps injected via `provideSteps`.

```yaml
# Injected via provideSteps — sub-step of implement-feature
id: run-tests
type: script
command: npm test
parent: implement-feature
onFailure:
  goto: implement-feature
```

**Recursive hierarchy:** sub-steps can themselves have sub-steps. Depth is configurable (`maxChildDepth`, default: 10). Exceeding the limit throws at injection time.

**`depends` within sub-steps:** governs ordering between siblings. Does not create deadlock with `parent` — `parent` controls completion scope, `depends` controls start order.

**Why unbounded recursion with a limit:** policy engine steps need to inject feedback loops on injected steps (e.g. a security scan injected by a model step may itself inject a remediation step). Capping at 10 prevents runaway recursion without constraining real use cases.

**UI representation:** `parent`/child relationships render as nested sub-steps under the parent, preserving a high-level flow view. Only top-level steps (no `parent`) appear at the root level.

**Policy engine use cases (explicit in spec):**
- A policy step can inject missing feedback loops (e.g. "no security scan detected → inject one").
- A policy step can validate that required loops exist before allowing execution to proceed.

---

## D39 — `provideSteps` MCP tool: JSON schema

The `provideSteps` tool exposed by the flow MCP server (D35) accepts:

```typescript
interface ProvideStepsInput {
  steps: InjectedStep[];
}

interface InjectedStep {
  id: string;                    // required — must be unique in the execution graph
  type: 'model' | 'script' | 'subflow';  // user_intervention not allowed in injected steps
  parent?: string;               // ID of the step that owns this sub-step (D36)
  depends?: string[];            // IDs of steps that must complete before this one starts
  onFailure?: { goto: string };  // creates a bounded cycle (D12 maxIterations applies)
  // All other standard step fields apply (prompt, command, env, output, etc.)
}
```

**Validation at injection time (throws, returns MCP error to Claude):**
- `id` already exists in the graph → error
- `parent` references a non-existent step → error
- `depends` references a non-existent step → error
- `type: user_intervention` → error
- `maxChildDepth` exceeded → error (D36)

**On success:** MCP tool returns `{ "injected": ["step-id-1", "step-id-2"] }`. Claude continues.

**Why no `executionId` in the call:** the MCP server is per-execution (started at `assign` — D35). The executionId is implicit in the server instance.

---

## D29 — Flow design skill scope (relevant: policy engine excluded from v1 skill)

The global flow design skill at `~/.claude/` teaches the design→validate→approve→execute pattern. It explicitly states **what NOT to do:** no `user_intervention` steps in injected steps. The skill depends on D30 (YAML schema). Policy engine step type (`type: policy`) is not in v1 scope and would not appear in the v1 skill.

---

## D30 — YAML step schema: `user_intervention` excluded from injected steps

Flow CLI supports all step types from flow-engine. The `type` field on `InjectedStep` (D39) explicitly excludes `user_intervention` — it cannot be injected dynamically. All other types (`model`, `script`, `subflow`) are allowed.

The policy engine step type is referenced in design notes and open questions but is **not yet a first-class `type` value** in the schema. It currently manifests as `type: model` or `type: script` steps that call `provideSteps`.
