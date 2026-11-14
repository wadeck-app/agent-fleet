# Host Tools (`hostTools`)

A model step declares tools the worker runs on its own host, behind a closed argv. The model gets the capability, never a shell or the host credentials.

> **Status (slice 1, steps 1-5 of the plan `.claude/plans/2026-11-14_generic-tool-provision-mcp.md`):** the field is parsed and validated, the wire protocol, the MCP helper and the host-side execution exist, the daemon routes `hostTools` steps only to workers declaring `host-tools`, a sandbox worker refuses them, `flow show` lists them, and the chain is tested end to end with real components (see [Tested end to end](#tested-end-to-end)). **Not proven:** a real model CLI calling a tool.
> Slice 1 scope: provider `claude`, local (non-sandbox) worker, `sideEffect: read` only. Codex/opencode and sandbox workers are later slices.

## Fields

`hostTools` is a list on a `type: model` step (any other step type is an error). Maximum 16 tools per step.

| Field            | Required | Rule                                                                                                                                                                |
| ---------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`             | yes      | `^[a-z0-9-]+$`, unique in the step, not `provideSteps`. It is the MCP tool name.                                                                                    |
| `description`    | yes      | Non-empty. What the model reads to choose the tool.                                                                                                                 |
| `sideEffect`     | yes      | No default. Only `read`; `write` is refused (`sideEffect: write is not supported yet (slice 3); use read`).                                                         |
| `command`        | yes      | argv array, never a string. First element is a literal executable.                                                                                                  |
| `args`           | no       | Closed set of typed arguments (below). Every `{name}` in `command` must be declared here.                                                                           |
| `cwd`            | no       | `none` (default) or `workspace`. No paths. `workspace` warns for config-driven executables (see Working directory).                                                 |
| `env`            | no       | Variable NAMES taken from the worker environment (`^[A-Za-z_][A-Za-z0-9_]*$`). Never `NAME=value`. `FLOW_WORKER_*` and `FLOW_MCP_*` are refused (case-insensitive). |
| `timeoutSeconds` | no       | Integer 1..300.                                                                                                                                                     |
| `maxOutputBytes` | no       | Integer 1..1048576.                                                                                                                                                 |

Optional fields are stored as written; defaults are applied where the tool runs (flow-cli `HostToolLimits`): `cwd: none`, `timeoutSeconds: 30`, `maxOutputBytes: 65536`, concurrency 2, 100 calls per step.

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

## Execution (worker, `packages/flow-cli/src/worker/`)

Path: `McpServer` -> `HostToolCallService` (the `HostToolCallHandler`) -> `HostToolExecutor`. Built per step by `HostToolStepWiring.prepare`; counters die with the step.

| Stage     | Rule                                                                                                                                                                                              |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Run start | Every `command[0]` is resolved; failure ends the step before the server and the model start (`Step 'S' tool 'T': ...`). An `env` name on the deny list is also refused here.                      |
| Per call  | Count the call, find the tool, `HostToolCallChecker`, concurrency, then execute. A refusal text goes back to the model (`Tool 'T' was not run: ...`).                                             |
| argv      | `command[1..]` with `{name}` replaced by the checked value, nothing else: one element per value, no shell, no globbing, no second substitution. An optional argument not given drops its element. |
| Spawn     | `spawn(absolutePath, argv, {shell: false, windowsHide: true})`, no stdin.                                                                                                                         |
| Timeout   | At `timeoutSeconds` the whole process tree is killed (`killProcessTree`: `taskkill /T /F` on Windows, descendants on POSIX); reply `ok:false, timedOut:true`.                                     |

### Executable resolution (F-16)

`HostToolExecutableResolver` resolves once at run start and records absolute path, size and mtime; the executor re-verifies them right before every spawn and refuses a change with a named error.

- Bare name: searched on the worker's `PATH` (with `PATHEXT` on Windows). Absolute path: used as given. Relative path (`./x`, `bin/x`): refused in slice 1.
- A relative or empty `PATH` entry (`.`, `node_modules/.bin`, `::`) refuses the resolution of a bare name, with an error naming the entry. It is not skipped: it resolves against the worker's current directory, which can hold a file the model planted. Fix: give the worker an absolute-only `PATH`, or write an absolute `command[0]`. An absolute `command[0]` ignores `PATH`.
- Windows `.cmd`/`.bat`: refused (cmd.exe re-parses arguments); point `command[0]` to the `.exe`.
- Not found: the error names step, tool, executable and the PATH searched.

### Environment (F-05)

The child gets a fixed baseline (PATH, PATHEXT, SYSTEMROOT, TEMP, HOME, USERPROFILE, APPDATA, locale `LC_*`, ... see `HostToolEnvironment`) plus the names the tool declares in `env`, read from the worker's environment. Never passed, even when declared: `FLOW_WORKER_*`, `FLOW_MCP_*`, `FLOW_SANDBOX_HOST_*`, `FLOW_EXECUTION_ID` (case-insensitive). Declaring one fails the step at run start; the executor also drops it and the audit line lists it in `envDenied`. A declared name the worker lacks is listed in `envMissing`.

### Working directory (F-13)

`none` (default): a fresh empty subdirectory of the OS temp directory (never the temp directory itself), removed after the call. `workspace`: the run's workspace directory (must exist), only when the tool writes `cwd: workspace`.

#### Why the default is `none` (warning `HOST_TOOL_CWD_WORKSPACE_CONFIG_DRIVEN`)

The model can write the workspace. Many executables read configuration or scripts from their working directory and run them: `.git/config` (`core.fsmonitor`), `.npmrc`, `Makefile`, `conftest.py`, `package.json` scripts. With `cwd: workspace`, a steered model plants such a file and the next call executes it on the host, outside any permission mode.

Changed 2026-11-14: the default was `workspace`, it is now `none`. A tool that needs the workspace writes `cwd: workspace`; when it takes a directory, pass it as a path argument instead (for example `git -C {path} ...`).

`flow validate` and `flow run` print a HARD warning for an explicit `cwd: workspace` when the basename of `command[0]` (lower-cased, `.exe` removed) is one of: git, npm, npx, pnpm, yarn, make, python, python3, node, pip, cargo, go, dotnet, mvn, gradle, ruby, php, pwsh, bash, sh (`ConfigDrivenExecutables`, flow-engine). No warning does not mean safe: other executables are not checked.

### Limits (F-12)

| Limit          | Behaviour                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Concurrency    | 2 running calls per tool. A third is refused at once ("already running ... Retry"), not queued: the per-call timer starts at arrival and a queue would spend it waiting.                                                |
| Calls per step | 100, every call counted, refused ones too.                                                                                                                                                                              |
| Output         | The whole reply text is at most `maxOutputBytes` (the connection drops anything larger). stdout is cut on a UTF-8 boundary and followed by `[output truncated at N bytes]`, `truncated: true`. stderr: last 4096 bytes. |

### Reply to the model (F-07)

stdout and the stderr tail are DATA inside `<tool-output tool="id" untrusted="true">...</tool-output>`, followed by `exit code: N`. A `</tool-output` inside the output is escaped so it cannot end the block. A non-zero exit, a signal or a timeout is `ok:false` with a first line saying so.

### Audit (F-17)

One `[host-tool] {json}` line per call, sent as an `info`/`system` log entry of the step through the worker's masked log channel: `stepId, toolId, callId, outcome (ok|failed|timed_out|denied|error), reason, args {name: {sha256, value?}}, exitCode, durationMs, outputBytes, truncated, timedOut, envDenied, envMissing`. A value appears only for an argument declared `log: true` on a call that passed the argument check. Never logged: output content, environment values, tokens, values of denied calls. Argument names from the model are cut to 64 characters, at most 32 names.

## Threat rows (steps 1-3)

| Row       | Status in code                                                                                                 |
| --------- | -------------------------------------------------------------------------------------------------------------- |
| F-03/F-04 | Checker + argv array + `shell:false`; injection corpus tested through the whole call path.                     |
| F-05      | Env allowlist and deny list, canary tests with `FLOW_WORKER_TOKEN` and `FLOW_MCP_TOOL_TOKEN`.                  |
| F-07      | Untrusted data block; slice 1 tools are `read` only.                                                           |
| F-12      | Timeout with tree kill (grandchild test), output cap, concurrency, call count.                                 |
| F-13      | `cwd` is a fresh empty directory (default) or `workspace` if declared (warning for config-driven executables). |
| F-16      | Identity recheck before each spawn; residual: a same-user swap between recheck and exec.                       |
| F-17      | Audit as above.                                                                                                |

## Tested end to end

`worker/HostToolEndToEnd.test.ts` runs the real `McpServer` (loopback TCP, issued tokens), `HostToolStepWiring` / call service / executor / audit log on fixture executables, and the real `mcp-server.cjs` as a child process speaking MCP over stdio (`test-utils/McpStdioTestClient`). The helper gets only the command and env `McpServer` hands out. No fake host.

Proven:

- The MCP session: `initialize`, `notifications/initialized` (no reply: a bug fixed with this test, the helper answered it with a `Method not found` error), `tools/list`, `tools/call`.
- `tools/list` shows description and input schema; the command, executable path, env names and values, and every token appear nowhere the model can read (tool list, `FLOW_MCP_TOOLS`, helper stdout/stderr).
- A valid call returns the fixture's stdout in the untrusted-data block; the audit line has names and sha256 only (value only for `log: true`, never output).
- Injection corpus (`;`, `$()`, backticks, `&&`, newline, pipe, `../..`, 1000 characters): one inert argv element, marker file never written. Leading `-`, over 1024 characters and NUL: refused naming the rule.
- Undeclared id (helper and raw callback), wrong type, out-of-range, missing, unknown argument: actionable error, session usable afterwards.
- Timeout at 1 s: `timed out` reply and the detached grandchild stops. Output cap: marker, reply within the cap, audit `truncated`.
- Child environment: undeclared worker variables, `FLOW_*` and the tokens never arrive; a declared name does. Declaring `FLOW_WORKER_*`, `FLOW_MCP_*`, `FLOW_EXECUTION_ID`, `FLOW_SANDBOX_HOST_*` fails at run start.
- A step without tools: only `provideSteps`, no tool token, v1 inject unchanged. After `McpServer.stop()` both a tool call and `provideSteps` fail with the helper's `cannot reach the flow host callback ... the execution may have ended` message.

Not proven: a real model CLI choosing and calling the tool (the claude mock CLI has no MCP support, so no automated test can), the daemon-to-worker assignment of `stepConfig.hostTools` through a live daemon.

## Confined profiles

A step with `hostTools` whose requirements include `fs=confined` (profiles `agent`, `inspect`, `untrusted-code`, `hermetic-test`, or `requires: [fs=confined]`, at flow or step level, or the daemon's implicit confinement) gets the finding `HOST_TOOL_UNDER_CONFINED_PROFILE`: a host tool pierces the isolation the profile promises.

- Default: warning. Error when the user config `~/.config/flow/config.yml` sets `validation.hostToolsUnderConfinedProfile: error`.
- The message states which mode applied. A validation run that was not given the setting reports a warning saying so; it never skips the finding.
- `flow validate` and `flow run` apply the setting (`flow run` refuses at run start in error mode). `flow show <file>` prints the finding with the same mode text (it reads the setting only for a flow that declares `hostTools`; an invalid setting stops it with the loader's message).
- The daemon passes the project's implicit set (`ImplicitConfinement.implicitSetFor`) at run start, so a flow with no profile of its own is flagged when a declared source serves its project. `flow validate` has no worker knowledge and cannot know it: a hostTools flow that is confined only implicitly is flagged at `flow run`, not at `flow validate`.

## Routing and the `host-tools` feature

`WORKER_FEATURE_HOST_TOOLS = 'host-tools'` (`ipc/Protocol.ts`) is declared by every worker built from `WorkerLaunch.WORKER_FEATURES` (`flow worker`, daemon-forked). The sandbox exec wrapper and the relay harness build their own list (`HarnessMessages.WORKER_FEATURES`) and do NOT declare it in slice 1; a test pins both.

- `stepConfig.hostTools` carries the tools to the worker as written; there is no top-level `assign` field.
- `StepDispatcher` keeps a step with a non-empty `hostTools` off every idle worker without the feature, before the acceptance plugin (`HostToolRouting`, hard filter).
- If no idle worker takes it, it fails at once when no connected worker (idle or busy) with the feature could take it AND at least one connected worker without it would have: `Step 'X' declares hostTools but worker 'Y' does not support hostTools. Fix: ...`. All such workers are named; a worker of a declared source (a sandbox) adds that sandbox workers do not offer host tools in this version.
- Otherwise it waits as any step (capable worker busy, no worker connected: a host worker is forked, a source launches one and that worker is checked on connect).
- No run-start refusal: the daemon cannot know the features of a worker that is not connected yet, so the failure happens at dispatch.
- Defence in depth: `ExecAssignment` (sandbox) refuses a step with `hostTools` (`Step "X" declares hostTools, but hostTools are not available in the sandbox in this version ... Remove hostTools from the step, or run it on a worker without the "sandbox" label.`), for every provider.

## `flow show`

`flow show <file>` prints, under the step table, one block per model step with tools. Limits are the ones the worker applies (`HostToolLimits.describe`), `(default)` marking what the tool did not write:

```
tools of step 'triage':
  queue-task-show [read] task args(id:string) cwd=none (default), timeout=12s, output<=65536 bytes (default)
```

The confined-profile finding follows, as `warning: ...` or `error: ...` with the mode text. Rendering lives in flow-core (`HostToolLines`, limits describer injected by flow-cli); the execution view does not list tools yet.

## Injected steps

`provideSteps` steps never inherit host tools and cannot declare `hostTools`: it is not in `InjectedStepGuard.ALLOWED_KEYS`, so the whole batch is refused. Do not add it (guarded by a test).

## Error codes

All start with `HOST_TOOL_` (see `validation/ValidationTypes.ts`). Each message names the step, the tool, the rule and ends with `Fix: ...`; unknown names carry `Did you mean`.

## Source

`packages/flow-engine/src/hosttools/` (types, call check, model view) and `validation/HostTool*Validator.ts`. Design and threat table: `.claude/plans/2026-11-14_generic-tool-provision-mcp.md`.
