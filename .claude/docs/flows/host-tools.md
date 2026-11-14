# Host Tools (`hostTools`)

A model step declares tools the worker runs on its own host, behind a closed argv. The model gets the capability, never a shell or the host credentials.

> **Status (slice 1, steps 1-2 of the plan `.claude/plans/2026-11-14_generic-tool-provision-mcp.md`):** the field is parsed and validated, and the wire protocol and the MCP helper exist. **Execution is not wired yet**: `WorkerAdapter` does not pass the tools to `McpServer` and no handler runs a command, so a flow declaring `hostTools` validates today but the tool is not served to the model (the runner and the routing follow in steps 3-5).
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

## Callback protocol v2

Newline-delimited JSON on the loopback callback port (`McpCallbackConnection`). The host accepts both shapes; the VM image carries its own copy of the helper, so helper and host versions can differ.

| Line                                                                | Meaning                             | Reply                                                           |
| ------------------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------- |
| `{token, executionId, steps}` (no `v`, no `kind`)                   | v1 `provideSteps` inject, unchanged | none                                                            |
| `{v:2, kind:'call_tool', token, executionId, callId, toolId, args}` | call a declared host tool           | `{v:2, callId, ok, text, truncated, exitCode, timedOut?}`, once |

- One call per connection: the host writes the reply line, then ends the socket. Any other line while a call is in flight, or after it, destroys the connection.
- A line with `v` or `kind` is routed by `kind`. An unknown `kind` or `v` is logged and rejected: a peer that spoke `v: 2` gets a `v:2` error line (`ok:false`, `callId:''`) first, any other peer is destroyed. Other connections are unaffected.
- A malformed line, bad `executionId`, bad token or oversize line destroys the socket (as for v1). An id that is not declared is not a violation: the reply is `ok:false` and names the allowed ids.
- Arguments are NOT checked by the connection; the injected `HostToolCallHandler` does that (step 3: `HostToolCallChecker`), from the host's own registry, never from the helper's list.

### Bearers

| Token (env of the helper) | Valid for                                       | Issued                            |
| ------------------------- | ----------------------------------------------- | --------------------------------- |
| `FLOW_MCP_CALLBACK_TOKEN` | `provideSteps` (v1) only                        | every step                        |
| `FLOW_MCP_TOOL_TOKEN`     | `call_tool` only, the declared ids of this step | only when the step declares tools |

A token presented for the wrong kind destroys the connection (logged without the token). Both die with `McpServer.stop()`, also for connections already open. The helper and the model share the environment, so the split limits what a leaked token buys, not who holds it.

### Timers and sizes

| What             | Value                                                                                                                                                                                                        |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Idle             | 30 s, replaced by the per-call timer while a call is in flight, restored after the reply                                                                                                                     |
| Per-call (host)  | `timeoutSeconds` + 5 s. When it fires and the handler has not answered, the host replies `ok:false, timedOut:true` and drops a late result. The handler is expected to kill the process at `timeoutSeconds`. |
| Helper socket    | `timeoutSeconds` + 10 s (`FLOW_MCP_HELPER_TIMEOUT_MARGIN_MS` overrides the 10 s: test seam)                                                                                                                  |
| Reply text       | at most the tool's `maxOutputBytes`, and the encoded line under 2 MiB (the line cap); otherwise replaced by an `ok:false` error                                                                              |
| `FLOW_MCP_TOOLS` | at most 16 tools and 16384 bytes of model view; above that `McpServer.start()` throws `HostToolSetTooLargeError` (run start fails, no fallback)                                                              |

### The helper (`mcp-server.cjs`)

`FLOW_MCP_TOOLS` is the only way tools reach it: a JSON array of `{name, description, inputSchema, timeoutSeconds}` built by `McpServer` from `HostToolModelView` (never the command). `tools/list` returns `provideSteps` then these; `tools/call` forwards the v2 line and returns the reply text (`isError: true` on `ok:false`). A malformed `FLOW_MCP_TOOLS`, or tools without `FLOW_MCP_TOOL_TOKEN`, make the helper exit 1 with a message on stderr. A connection closed without a reply is reported as `host too old for host tools` (old host, or the execution ended).

## Confined profiles

A step with `hostTools` whose requirements include `fs=confined` (profiles `agent`, `inspect`, `untrusted-code`, `hermetic-test`, or `requires: [fs=confined]`, at flow or step level, or the daemon's implicit confinement) gets the finding `HOST_TOOL_UNDER_CONFINED_PROFILE`: a host tool pierces the isolation the profile promises.

- Default: warning. Error when the user config `~/.config/flow/config.yml` sets `validation.hostToolsUnderConfinedProfile: error`.
- The message states which mode applied. A validation run that was not given the setting reports a warning saying so; it never skips the finding.
- `flow validate` and `flow run` apply the setting (`flow run` refuses at run start in error mode). `flow show` does not print the finding or the tools yet (planned with the routing step).
- The daemon passes the project's implicit set (`ImplicitConfinement.implicitSetFor`) at run start, so a flow with no profile of its own is flagged when a declared source serves its project. `flow validate` has no worker knowledge and cannot know it: a hostTools flow that is confined only implicitly is flagged at `flow run`, not at `flow validate`.

## Injected steps

`provideSteps` steps never inherit host tools and cannot declare `hostTools`: it is not in `InjectedStepGuard.ALLOWED_KEYS`, so the whole batch is refused. Do not add it (guarded by a test).

## Error codes

All start with `HOST_TOOL_` (see `validation/ValidationTypes.ts`). Each message names the step, the tool, the rule and ends with `Fix: ...`; unknown names carry `Did you mean`.

## Source

`packages/flow-engine/src/hosttools/` (types, call check, model view) and `validation/HostTool*Validator.ts`. Design and threat table: `.claude/plans/2026-11-14_generic-tool-provision-mcp.md`.
