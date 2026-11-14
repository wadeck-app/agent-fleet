# Host Tools (`hostTools`)

A model step declares tools the worker runs on its own host, behind a closed argv. The model gets the capability, never a shell or the host credentials.

> **Status (slice 1, step 1 of the plan `.claude/plans/2026-11-14_generic-tool-provision-mcp.md`):** the field is parsed and validated. **Execution is not wired yet**: a flow declaring `hostTools` validates today, but the tool is not served to the model (the MCP server, the callback and the runner follow in steps 2-5).
> Slice 1 scope once wired: provider `claude`, local (non-sandbox) worker, `sideEffect: read` only. Codex/opencode and sandbox workers are later slices.

## Fields

`hostTools` is a list on a `type: model` step (any other step type is an error). Maximum 16 tools per step.

| Field            | Required | Rule                                                                                                                                                                |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | yes      | `^[a-z0-9-]+$`, unique in the step, not `provideSteps`. It is the MCP tool name.                                                                                    |
| `description`    | yes      | Non-empty. What the model reads to choose the tool.                                                                                                                 |
| `sideEffect`     | yes      | No default. Only `read`; `write` is refused (`sideEffect: write is not supported yet (slice 3); use read`).                                                         |
| `command`        | yes      | argv array, never a string. First element is a literal executable.                                                                                                  |
| `args`           | no       | Closed set of typed arguments (below). Every `{name}` in `command` must be declared here.                                                                           |
| `cwd`            | no       | `workspace` or `none`. No paths.                                                                                                                                    |
| `env`            | no       | Variable NAMES taken from the worker environment (`^[A-Za-z_][A-Za-z0-9_]*$`). Never `NAME=value`. `FLOW_WORKER_*` and `FLOW_MCP_*` are refused (case-insensitive). |
| `timeoutSeconds` | no       | Integer 1..300.                                                                                                                                                     |
| `maxOutputBytes` | no       | Integer 1..1048576.                                                                                                                                                 |

Optional fields are stored as written; defaults are applied where the tool runs (flow-cli `HostToolLimits`): `cwd: workspace`, `timeoutSeconds: 30`, `maxOutputBytes: 65536`, concurrency 2, 100 calls per step.

### `command`

- `{name}` is allowed only as a whole element (`"{id}"`) or as the value of a flag (`--id={id}`). `x{id}`, `{id}x` and `{id}{id}` are errors.
- The executable cannot be a placeholder.
- Flow templates (`${{ ... }}`) are refused anywhere in `command`: a computed value could inject arguments.
- An argument declared but never used in `command` is a warning (`HOST_TOOL_UNUSED_ARG`).

### `args`

| `type`    | Keys         | Rule                                                                              |
| --------- | ------------ | --------------------------------------------------------------------------------- |
| `enum`    | `values`     | Non-empty, unique strings.                                                        |
| `string`  | `pattern`    | **Mandatory.** Anchored (`^...$`, at most 256 chars); the whole value must match. |
| `integer` | `min`, `max` | Both required integers.                                                           |
| `boolean` |              |                                                                                   |

Common keys: `description`, `required`, `log` (the audit log keeps the value; warning if the name looks like token/secret/password/credential), `allowLeadingDash`.

A value starting with `-` is refused (it would be read as an option) unless the argument sets `allowLeadingDash: true`. This applies to string values, enum values, and negative integers (`min < 0`). The per-call check is `HostToolCallChecker` (flow-engine); it also refuses unknown arguments, values over 1024 characters and NUL.

## Example

```yaml
- id: triage
  type: model
  prompt: Pick the next open task and show it.
  hostTools:
      - id: queue-task-show
        description: Show a task of the queue by id (read only).
        sideEffect: read
        command: [task, show, '{id}', --json]
        args:
            id: { type: string, pattern: '^[A-Za-z0-9_][A-Za-z0-9_-]{0,63}$', required: true }
        timeoutSeconds: 30
```

## Limits on what the model is shown

The serialized model-facing set (id, description, input schema; never the command) must stay within 16384 bytes: `Step 'X': host tools description is N bytes, the limit is 16384. Fix: shorten descriptions or declare fewer tools.`

## Confined profiles

A step with `hostTools` whose requirements include `fs=confined` (profiles `agent`, `inspect`, `untrusted-code`, `hermetic-test`, or `requires: [fs=confined]`, at flow or step level, or the daemon's implicit confinement) gets the finding `HOST_TOOL_UNDER_CONFINED_PROFILE`: a host tool pierces the isolation the profile promises.

- Default: warning. Error when the user config `~/.config/flow/config.yml` sets `validation.hostToolsUnderConfinedProfile: error`.
- The message states which mode applied. A validation run that was not given the setting reports a warning saying so; it never skips the finding.
- Wiring the setting into `flow validate` / `flow run` / `flow show` is not done in this step.

## Injected steps

`provideSteps` steps never inherit host tools and cannot declare `hostTools`: it is not in `InjectedStepGuard.ALLOWED_KEYS`, so the whole batch is refused. Do not add it (guarded by a test).

## Error codes

All start with `HOST_TOOL_` (see `validation/ValidationTypes.ts`). Each message names the step, the tool, the rule and ends with `Fix: ...`; unknown names carry `Did you mean`.

## Source

`packages/flow-engine/src/hosttools/` (types, call check, model view) and `validation/HostTool*Validator.ts`. Design and threat table: `.claude/plans/2026-11-14_generic-tool-provision-mcp.md`.
