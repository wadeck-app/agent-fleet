# Open Questions — Next Session

## ~~Q26~~ — First implementation milestone: RESOLVED → D38

## ~~Q27~~ — Dynamic step injection: RESOLVED → D35, D36

**Constraints established:**

- Any step type (model, script, policy engine) can inject steps
- The model _chooses_ to inject or not — not forced
- Typed output system: built-in complex types prefixed `default.` (e.g. `default.flow-steps`) to distinguish from user-defined types. `default` is a reserved namespace.
- Content validation for `default.flow-steps` uses existing GraphValidator at runtime — distinct from `flow validate` (which validates a full YAML file upfront). Both are valid approaches, not mutually exclusive.
- Injection scope: steps are injected as sub-tasks _within_ the generating step — the step is not "done" until its injected sub-steps complete. Step B (depends on A) waits for A AND all of A's injected sub-steps. This enables feedback loops (e.g. "I touched JS, inject run-tests if not already present").
- Parallel injection ordering: irrelevant — the graph uses `depends` for ordering, not insertion order.
- `_worker-register` removed from v1 scope — crash recovery is out of scope for MVP.

**Direction confirmed: tool-based injection via `provideSteps`**

- Claude emits a `tool_use` block in stream-json when it wants to inject steps — no `--tools` CLI flag needed; Claude knows the tool_use format from training, the D29 skill documents the schema
- The flow engine detects the `tool_use` event in StreamJsonParser, injects the steps, resumes via `--resume <sessionId>` with a `tool_result` success block
- Auditability (injected steps not visible in static YAML) is a generic dynamic-flow problem — solved by execution history (timestamped, with origin of each injection), not by tooling choice

**Open: `provideSteps` schema** — exact fields needed to describe an injected step and how it attaches to the running graph. What does a `provideSteps` call look like?

**Open: injection scope sémantique** — "sub-tasks of A" model needs daemon implementation design.

## ~~Q28~~ — `.flows/config.yml` schema: RESOLVED → D37

---

## Decisions made this session (summary for reference)

| Decision | Summary                                                                                                                                                                                 |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1–D24   | See `decisions.md` — all decided and audited (4 rounds)                                                                                                                                 |
| D25      | Worker extracts step output; `maxOutputRetries` retry loop before `step_failed`                                                                                                         |
| D26      | Subflow steps expand inline into parent graph; namespace-prefixed IDs; depth limited                                                                                                    |
| D27      | Input schema in flow YAML; values via `--input key=value`; interpolation `${{ inputs.x }}` / `${{ steps.x.outputs.y }}`; daemon validates before queuing                                |
| D28      | `flow cancel`: graceful by default (waits for current step), `--force` for immediate SIGKILL; `CANCELLED` is a distinct terminal state; interrupted step marked `interrupted`, no retry |
| D29      | Flow design skill lives at `~/.claude/` — global, any-project scope. Teaches design→validate→approve→execute pattern. Content depends on D30 (YAML schema).                             |
| D30      | Flow CLI supports all step types and fields from flow-engine without simplification; `user_intervention` and unsupported workspace modes throw `UnsupportedOperationError`              |
| D31      | vars:/secrets: distinct features; URI schemes (env://, file://, value://, input://); eager masking (6 variants); NOTHING default env; Secret class with [REDACTED] serialization        |
| D32      | Hook system: typed objects (`cli`, `http`) with protocol-based dispatch via `HookDispatcher`; declared in `.flows/config.yml`                                                           |
| D33      | `task` CLI: file-based storage (`.flows/tasks/index.json` + per-task files); commands: new, list, show, approve, set-status; hooks triggered on status transitions                      |
| D34      | v1 command surface: flow run + flow validate only; all other commands deferred to v2                                                                                                    |
| D35      | Flow MCP server: per-execution MCP server started at `assign`, exposes `provideSteps` v1, other tools v2                                                                                |
| D36      | Dynamic step injection: `provideSteps` tool, `parent` field (static YAML + dynamic), `maxChildDepth` default 10, recursive hierarchy                                                    |
| D37      | `.flows/config.yml` schema: version, defaults.model, execution.maxChildDepth, hooks (onFlowStart/End/Error, onStepStart/End/Failed), tasks.storage.dir + tasks.hooks.onStatusChange     |
