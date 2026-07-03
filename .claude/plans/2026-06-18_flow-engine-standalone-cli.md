# Plan: Flow Engine Standalone CLI

## Context

The flow engine (`packages/flow-engine`) is currently driven exclusively by `FlowWorker` (WebSocket → orchestrator). The goal is to expose it as an independent CLI tool — zero Agent Fleet required. Agent Fleet becomes the "managed" mode; the CLI is the lightweight standalone mode.

`FlowExecutor(interactive, flowRegistry)` is already standalone — no orchestrator/WebSocket needed. `InterventionHandler` is already an interface, injectable per-execution. The coupling to `shared-orch-worker` is minimal (only 4 symbols, all replaceable). **No existing package needs refactoring.**

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    packages/flow-engine                      │
│  (zero deps on shared-orch-worker after decoupling)         │
│                                                              │
│  types.ts: TaskStatus/TicketStatus → local type aliases     │
│  SchemaValidator: validStatuses injected via ExecutionConfig │
│                                                              │
│  ┌──────────────┐  ┌─────────────┐  ┌────────────────────┐ │
│  │ FlowRegistry │  │FlowValidator│  │   FlowExecutor     │ │
│  └──────────────┘  └─────────────┘  │ InterventionHandler│ │
│                                     │   (interface)      │ │
│                                     └────────────────────┘ │
│  Exports (add): FlowExecutor, FlowValidator                 │
└────────────────────┬────────────────────────────────────────┘
                     │
          ┌──────────┴──────────────────────────┐
          │                                      │
┌─────────▼────────────┐           ┌────────────▼──────────────┐
│  packages/flow-cli   │           │   packages/worker          │
│  (NEW, thin)         │           │   FlowWorker (unchanged)   │
│                      │           │                            │
│  flow run <yml|id>   │           │  Injects:                  │
│  flow validate       │           │  - WebSocketInterventionH  │
│  flow docs           │           │  - Task/TaskStatus from    │
│  flow generate       │           │    shared-orch-worker      │
│                      │           └────────────────────────────┘
│  Injects:            │
│  - ThrowIntervention │           ┌────────────────────────────┐
│    Handler (v1)      │           │  packages/shared-orch-     │
│  - FlowRegistry      │           │  worker (unchanged)        │
│    (from yml file)   │           └────────────────────────────┘
│                      │
│  .claude/skills/     │
│  flow.md (new)       │
└──────────────────────┘
```

---

## Phases (each independently shippable)

### Phase 1 — Decouple flow-engine from shared-orch-worker (~2h)

Only 3 files to touch:

| File                                                         | Change                                                                                                                                  |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/flow-engine/src/types.ts`                          | Replace `import type { TaskStatus, TicketStatus }` with local aliases: `type FlowTaskStatus = string`, `type FlowTicketStatus = string` |
| `packages/flow-engine/src/validation/SchemaValidator.ts:223` | Replace `Object.values(TaskStatus)` with `config.validStatuses ?? []` — inject via `ExecutionConfig` (if empty, skip status validation) |
| `packages/flow-engine/src/test-utils/factories.ts`           | Replace `Task`, `WorkerInfo` from `shared-orch-worker` with local minimal interfaces                                                    |
| `packages/flow-engine/src/index.ts`                          | Add exports: `FlowExecutor`, `FlowValidator`                                                                                            |

`FlowWorker` in `packages/worker` is untouched — it continues passing `Task`/`TaskStatus` from `shared-orch-worker` unchanged.

### Phase 2 — New `packages/flow-cli` package (~1 day)

```
packages/flow-cli/
  src/
    cli.ts                          # commander.js entry, registers commands
    commands/
      RunCommand.ts                 # flow run <file.yml|flowId> [--inputs k=v] [--non-interactive]
      ValidateCommand.ts            # flow validate <file.yml>
      DocsCommand.ts                # flow docs [--output file.md]
      GenerateCommand.ts            # flow generate "<description>" [--output flow.yml]
    interventions/
      ThrowInterventionHandler.ts   # v1 default: fail with clear message on HITL step
    FlowCliRunner.ts                # wires FlowRegistry + FlowExecutor + handler
  bin/
    flow.js                         # shebang entry
  package.json
```

**Flow source resolution:**

```
flow run my-flow.yml                     # direct YAML file
flow run feature-review                  # ID in .agent-fleet/flows.yml (cwd)
flow run --flows custom.yml my-flow-id   # explicit flows file
```

**Interventions (v1 — non-interactive only):**

- `ThrowInterventionHandler` is the default (and only) implementation
- If a flow contains a `user_intervention` step → fail with: `"Flow contains a user_intervention step. Use Agent Fleet for interactive flows."`
- Interactive readline mode deferred to Phase 4

### Phase 3 — Agent support: docs + generate + skill (~half day)

- `flow docs [--output file.md]` — calls existing `FlowCapabilitiesGenerator`
- `flow generate "<description>" [--output flow.yml]` — calls existing `FlowGenerator`
- `zod-to-json-schema` on `FlowDefinition` → `flow.schema.json` (bundled artifact)
- New Claude Code skill: `.claude/skills/flow.md` — describes commands + schema location, enables agents to scaffold flows without reading source code

### Phase 4 — Interactive mode (future, not planned now)

- `ReadlineInterventionHandler` (stdin/stdout)
- Handle log/prompt interleaving (suspend streaming during readline)

---

## Test strategy

### `packages/flow-engine` (minimal changes)

- `SchemaValidator.test.ts` — add: injected `validStatuses` respected; empty `validStatuses` skips status validation
- `test-utils/factories.ts` — replace `Task`/`WorkerInfo` imports with local mocks (no test logic changes)

### `packages/flow-cli` (new)

| File                               | Type        | What it tests                                                                         |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------- |
| `RunCommand.test.ts`               | Integration | Executes a script-only YAML flow end-to-end (no Claude CLI, no HITL) → correct output |
| `ValidateCommand.test.ts`          | Unit        | Valid flow → 0 errors; invalid flow → readable error messages                         |
| `ThrowInterventionHandler.test.ts` | Unit        | `requestIntervention()` throws with clear message                                     |
| `GenerateCommand.test.ts`          | Unit        | `FlowGenerator` mocked → verifies output written to file + is valid YAML              |

`flow generate` real Claude integration → manual verification only (not in automated tests).

---

## What does NOT change

- `packages/flow-engine` internals (FlowExecutor, StepRunner, etc.)
- `packages/worker` / FlowWorker
- `shared-orch-worker`, `shared-common`
- All existing tests

---

## Verification

1. `cd packages/flow-cli && npm run build` ✓
2. `flow validate .agent-fleet/flows.yml` prints validation summary
3. `flow run feature-requirements-interview --inputs taskDescription="test"` executes script steps
4. `flow run <flow-with-intervention>` fails with clear human-readable message
5. `flow docs` outputs valid Markdown
6. `flow generate "review a PR and post a summary" --output test.yml && flow validate test.yml` ✓
7. `npm run check` passes monorepo-wide
