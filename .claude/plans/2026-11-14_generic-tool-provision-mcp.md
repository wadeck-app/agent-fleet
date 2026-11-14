# Generic host-tool provisioning through one MCP server

Status: draft plan, 2026-11-14. Separate plan/spec from the sandbox worker plan (`2026-10-25_docker-sandbox-worker.md`), as the user asked.

## Goal / non-goals

Goal: a step declares host tools (id, description, command template, allowed arguments); the worker exposes them to ANY model (claude, codex, opencode) on ANY worker (local, sandbox exec, sandbox relay) through ONE generic MCP server. The model gets the capability, never the host credentials or a shell.

End state = the goal above (all models, all workers). Delivery is phased (D10): slice 1 is claude on a local worker only; codex/opencode and sandbox workers are DEFERRED to later slices, not out of scope.

Non-goals: arbitrary third-party MCP servers in a sandbox (stays refused); a policy engine; per-call human approval UI; replacing `host: true` scripts; tools that mutate the flow graph (that is `provideSteps`).

## User constraints (verbatim, 2026-11-08)

- "le MCP Server doit être quelque chose de propre à designer, je veux que le worker puisse fournir un MCP 'générique' à son model (quel que soit le model et quel que soit le worker !!!!) où on vient ajouter des tool à la volée selon les besoins, comme un accès à la CLI de 'task' de 'queue', de 'flow' etc pour des commandes particulières, avec id/description."
- "Ces informations doivent être définies dans la step et utilisées par le worker pour envoyer les infos au model."
- "un model qui a besoin d'un outil de l'hôte, l'hôte doit pouvoir lui fournir dans la définition de la step"
- A sandboxed model step must use specific HOST tools WITHOUT broad host permissions or credentials.

## Current state (verified in code)

| Fact | Where |
|---|---|
| One engine MCP server, name `flow`, one tool `provideSteps`; stdio JSON-RPC, `tools/list` returns a constant | `packages/flow-cli/src/worker/mcp-server.cjs:32,279-281,283-290` |
| Built per model step by the worker, injected as `mcpServers` into the runner factory | `WorkerAdapter.ts:220-230`; `McpServer.ts:46-116` |
| Callback = loopback TCP on host, random port, per-step token + executionId, one JSON line `{token, executionId, steps}`, NO reply channel, 2 MiB line cap, 8 connections, 30 s idle | `McpServer.ts:80-104`; `McpCallbackConnection.ts:6-47`; `mcp-server.cjs:215-234` |
| `McpServer { name, command[], env?, cwd?, enabled? }` is also a user-facing step field (`mcpServers:`), merged after the engine's: `[...config.mcpServers, ...step.mcpServers]` | `ModelStepExecutor.ts:323`; `processing/ModelProvider.ts:15-24`; `types.ts:666-670`; docs `.claude/docs/flows/mcp-and-tool-hooks.md` |
| Claude: JSON temp file + `--mcp-config` | `ClaudeModelProvider.ts:34-49,139` |
| OpenCode: `{mcp:{name:{type:local,command,environment}}}`, inline `OPENCODE_CONFIG_CONTENT` (file `OPENCODE_CONFIG` above a size cap) | `OpenCodeModelProvider.ts:162-184,303-323` |
| Codex: `-c mcp_servers.<name>.command/args/env/required=true/default_tools_approval_mode="approve"` | `CodexConfigBuilder.ts:65-92` |
| Sandbox exec, claude only: the engine config is rewritten to `node /opt/flow/mcp-callback-forwarder.cjs` (VM loopback -> `host.docker.internal:<port>`); any server not named `flow` or not `<host node> .../mcp-server.cjs` is refused | `McpConfigRewriter.ts:34-108` |
| Sandbox exec, codex/opencode: a step with non-empty `mcpServers` or `toolHooks` is refused ("plain prompt"); the engine's own server is dropped for them (`tool === 'claude'` gate), so today a codex/opencode step in the sandbox has NO MCP at all, not even `provideSteps` | `ExecAssignment.ts:106-121`; `ExecMain.ts:196-197` |
| Injected steps are whitelisted by key: `hostTools` is not in `ALLOWED_KEYS`, so it is refused today; `mcpServers` and `toolHooks` too. `mcp-server.cjs` still advertises `additionalProperties: true` for step items (wider than the daemon accepts; flow-owner aligns it) | `InjectedStepGuard.ts:21-45,81-89`; `StepInjection.ts:45-47`; `mcp-server.cjs` step items schema |
| Callback port gets a per-step, per-sandbox network rule `localhost:<port>`, removed with the process (T-08) | `McpCallbackRules.ts:6-48`; `.claude/specs/2026-10-25_docker-sandbox-worker/threat-model.md:62` |
| The worker engine (`WorkerAdapter` + `StepRunner`) runs on the HOST even for the exec variant; only the model process runs in the VM | `ExecMain.ts:191-200` |
| Precedent for "leave the confinement": `host: true` on SCRIPT steps only; never on injected steps, whole batch refused | `schema-reference.md:596-603`; `InjectedHostMarkerGuard.ts:10-30`; `StepInjection.ts:37-42` |
| Requirements: `requires:` / `profile:`, guarantees come from the source, hard filter in `StepRouter`, injected steps inherit the run's set, `assign` carries `requires` | `WORKERS.md:148-193` |

Consequence: the host-side execution point already exists (worker process on host receives the callback). Missing: a reply channel on the callback, a tool registry, tools in `tools/list`, and a non-claude/sandbox path.

## Design decisions

### D1. Where tools are declared

| Option | Pros | Cons |
|---|---|---|
| A. Inline in the step (`hostTools:`) | Matches the user's words ("définies dans la step"); self-contained, reviewable in the flow file | Every flow re-declares `task`/`flow` wrappers; a flow author, not the host owner, defines what runs on the host; flow files from untrusted sources define host commands |
| B. Named on the worker source, referenced by id (`hostTools: [task-show]`) | Host owner controls what can run; flow carries no commands; reuse | Not what the user literally asked; flow not self-describing; every worker needs config before a flow runs |
| C. Both: the step MAY declare inline definitions, but a definition only runs if the worker-side policy allows its binary (allowlist), and a step MAY reference a named tool of the source | Flexible; host keeps the final say | Two mechanisms, precedence rules, more docs |

Recommendation: C, phased. Slice 1 ships A only, on a LOCAL worker, with no allowlist (safe: see D10). Slice 2 adds the worker-side executable allowlist, which becomes mandatory for any sandbox worker; B (named tools, referenced by id) follows. Precedence: a step-inline id equal to a named id is a validation error (no shadowing). Note: the user asked for step-defined tools (A); the allowlist-first ordering was our proposal, see O1.

### D2. Tool definition schema

```yaml
hostTools:
  - id: queue-task-show          # [a-z0-9-]+, unique in the step; the MCP tool name
    description: "Show a task of the queue by id (read only)."
    sideEffect: read             # read | write (required, no default)
    command: [task, show, "{id}", --json]   # argv array ONLY, never a shell string
    args:
      id: { type: string, pattern: "^[A-Za-z0-9_-]{1,64}$", required: true }   # a value starting with "-" is refused unless the arg sets allowLeadingDash: true
      status: { type: enum, values: [open, done] }   # enum | string+pattern | integer(min,max) | boolean
    cwd: workspace               # optional; workspace | none ; no arbitrary paths in slice 1
    env: [TASK_PROFILE]          # optional; names only; values come from the worker env, never from the model
    timeoutSeconds: 30           # optional; max 300
    maxOutputBytes: 65536        # optional; max 1 MiB; truncation is reported to the model
```

Defaults are NOT in the schema: `cwd`, `timeoutSeconds`, `maxOutputBytes`, concurrency and call-count limits are optional fields stored as written (no `.default()` in the entity schema: it makes a PATCH/round-trip rewrite the field, `.claude/kb/lessons-learned.md:28`). They are resolved at the use site, one function `HostToolLimits.resolve(tool)` in flow-cli, called by `HostToolRunner` and by `flow show` (so what is displayed is what is applied): `cwd` = workspace, `timeoutSeconds` = 30, `maxOutputBytes` = 64 KiB, concurrency 2, max 100 calls per step. The schema only validates the maxima (300 s, 1 MiB).

| Field | Decision |
|---|---|
| `command` | argv array; `{name}` placeholders must be a whole argv element or an `--flag={name}` value; each placeholder must be declared in `args` |
| `args` | closed schema; each arg has a type and a pattern/enum/range; no free-form string without a `pattern` (validation error); values starting with `-` are refused unless the pattern allows them explicitly; optional `log: true` lets the audit log keep the value (F-17) |
| `sideEffect` | label shown in `flow show` and in the tool description sent to the model; `write` tools need `readOnly` workspace compatibility check (`ReadOnlyWorkspaceRules` is advisory today) |
| `env` | allowlist of NAMES read from the worker process environment; baseline env = PATH-like minimum as in `HostScriptEnvironment`; no literal values in the step (credentials live with the worker) |
| `cwd` | workspace of the run or none |
| limits | timeout, output cap, concurrency, call count: defaults resolved at the use site (see above) |

### D3. Execution location and trust

Decision: execute on the worker's HOST, in the worker process (`WorkerAdapter` side), never in the VM, never by the model process.

- Path: model -> MCP `tools/call` -> `mcp-server.cjs` (VM or host) -> callback TCP -> `McpCallbackConnection` (host worker) -> `HostToolRunner` -> `spawn(argv, {shell:false})` -> reply on the same connection.
- Protocol (callback v2). Today the connection is one-way and strict: a line without `steps` fails `isInjectedStepList` and the socket is destroyed (`McpCallbackConnection.ts:99-107,122-127`), the idle timer is `socket.setTimeout(idleTimeoutMs)`, default 30 s (`:56-57`, `DEFAULT_CALLBACK_IDLE_TIMEOUT_MS`), and `onInjectSteps` errors are only logged, never answered (`:117-119`). Design:
    - Wire shapes: v1 (legacy, unchanged) `{token, executionId, steps}` = inject; v2 `{v:2, kind:'call_tool', token, executionId, callId, toolId, args}`. A line with `v` or `kind` is routed by `kind`; a line without them is v1. Unknown `kind`/`v` keeps today's behaviour: reject and destroy. The host accepts both because the VM image carries its own copy of the helper (`/opt/flow/...`, `McpConfigRewriter.ts:5`): helper and host can differ in version. A new helper against an old host gets a destroyed connection, which the helper reports as "host too old for host tools" (actionable).
    - Reply: one line `{v:2, callId, ok, text, truncated, exitCode}` on the same socket, then the host ends it. One call per connection (as inject today); `maxConnections` 8 > concurrency 2.
    - Timeouts: while a call is in flight the idle timer is replaced by a per-call timer `timeoutSeconds + 5 s` (kill the child at `timeoutSeconds`, reply `ok:false, timedOut:true`, then close); the idle timer returns after the reply. Any extra line while a call is in flight is a protocol violation (destroy). No keepalive: the TCP connection stays open and silent. The helper's own socket timeout (`mcp-server.cjs:230`, 5 s, written for inject) must become `timeoutSeconds + 10 s` for `call_tool`. `mcp-callback-forwarder.cjs` has no timeout (grep: none), so it adds none.
    - Reply size: capped by `maxOutputBytes` (max 1 MiB) + envelope, under `MAX_CALLBACK_LINE_BYTES` (2 MiB, `McpCallbackConnection.ts:7`); the helper reads the reply with the same cap.
- Model controls only: tool id (must be declared) and arg values (validated against the declared schema). It never controls: argv[0], flags, cwd, env, timeout, limits.
- No shell: `spawn` with an argv array; on Windows `.cmd`/`.bat` targets are refused in slice 1 (cmd.exe re-parses arguments); executable resolved at run start to an absolute path + file identity (size, mtime) and recorded; re-resolved at each spawn, refused with a named error if the path or identity changed (TOCTOU, see D9).
- No credential passing: env allowlist by name only; the per-step token and the `flow` credentials (`FLOW_WORKER_TOKEN`) are never in the child env (explicit deny list tested with a canary).
- Per-step bearers, one per scope: the existing token (`McpServer.ts:61`) stays valid for `inject` only; a second random token, issued only when the step declares tools, is valid for `call_tool` only and for this step's declared ids. A token presented for the wrong `kind` is a protocol violation (destroy). Both die with `McpServer.stop()`. Honest limit: the helper and the model process share the VM env, so the split narrows what a leaked token buys (a step without tools has no tool token), not who holds it.
- Audit: one execution-log entry per call (`stepId, toolId, callId, argument names + sha256 of each value, exitCode, durationMs, bytes, truncated, timedOut`), written by the host, not by the model-visible server; denied calls logged too. Redaction: argument VALUES are logged only for args declared `log: true` (never for env, never the tokens: `McpCallbackConnection.ts:18` already forbids logging them); output content is never logged, only its length; everything passes the existing masker.
- Reply to the model: stdout (capped), stderr tail (capped), exit code; errors are actionable text (`isError: true`).

### D4. One generic server for all models

Decision: extend `mcp-server.cjs` into the single generic server. `tools/list` = `provideSteps` + the step's host tools. The tool list is passed by ONE mechanism: env `FLOW_MCP_TOOLS` (JSON: id, description, input schema, no command) set in `buildMcpServerConfig` (`McpServer.ts:106-116`); the command never leaves the host worker, so the VM sees descriptions and schemas only. Cap: 16 KiB serialized and 16 tools per step (well under the per-variable limits of the OSes; the Windows 32,767-char limit is an OS fact, not checked in the repo). Above the cap there is no fallback: the step fails at run start (static check in `flow validate` too) with `Step 'X': host tools description is N bytes, the limit is 16384. Fix: shorten descriptions or declare fewer tools.`

| Provider | Consumption | Change |
|---|---|---|
| claude | `--mcp-config` file, unchanged | none; engine entry already there |
| opencode | inline `OPENCODE_CONFIG_CONTENT` unchanged | none on host |
| codex | `-c mcp_servers.flow.*` unchanged | none on host |
| sandbox exec + claude | `McpConfigRewriter` rewrites to forwarder | none: tools travel the same callback; the new callback port rule already covers it |
| sandbox exec + codex/opencode | today the engine server is dropped (`ExecMain.ts:196`) and `mcpServers` refused | extend: when the step has host tools, allow the engine `flow` server for these providers via the same forwarder (rewrite per provider format); the refusal for user-defined `mcpServers` stays |
| sandbox relay | not read; to verify (see "Unverified") | |

The server name stays `flow`; tool names are `flow` server tools `provideSteps`, `queue-task-show`... Name collision with `provideSteps` is a validation error.

### D5. Interaction with requirements / guarantees

| Question | Decision |
|---|---|
| Allowed in a confined profile (`fs=confined`, `env=clean`)? | Yes: the whole point. The tool runs on the host with a closed argv, so it is a controlled hole, not full host access |
| Required guarantee? | No new guarantee in slice 1. The worker declares a protocol feature `WORKER_FEATURE_HOST_TOOLS = 'host-tools'` in `WorkerReady.features` (`ipc/Protocol.ts:372-376`, constants `:84-105`, list built at `WorkerLaunch.ts:172-176`); a step with `hostTools` is routed only to workers declaring it (the dispatcher already reads `WORKER_FEATURE_*`, `StepDispatcher.ts`), and when none can serve it the step fails at run start with a named error (never silently dropped). A worker that ignores the feature is never given the step, so the `assign` field below is defence in depth only |
| `host: true` analog? | Not needed; `hostTools` IS the narrow analog. Warning `HOST_TOOL_WITH_WRITE` for `sideEffect: write` in a flow with `profile: untrusted-code`/`hermetic-test`; suggest `read` tools only |
| `profile:` expansion | Unchanged; profiles do not grant host tools. A `hostTools` step under a confined profile is a validation warning by default and an error when the setting says so (decided O3). A future `host-tools=none` guarantee remains an option |
| Source policy | Source/plugin config holds the executable allowlist (D1 C); a tool whose `command[0]` is not allowed is refused at run start, naming the source setting to change |

### D6. Injected steps (provideSteps)

Decision: injected steps do NOT inherit host tools, and may NOT declare `hostTools`. No new guard: `InjectedStepGuard` whitelists injected keys (`ALLOWED_KEYS`, `InjectedStepGuard.ts:21-45`), `hostTools` is not on the list, so any injected step at any depth carrying it already gets the whole batch refused (`:81-89`, wired at `StepInjection.ts:45-47`). The new field stays refused BY DEFAULT; the rule to keep is "never add `hostTools` to `ALLOWED_KEYS`", enforced by a test asserting its absence. Rationale: a model steered by hostile content must not widen its own reach. A flow that wants a later tool-using step writes it in the definition. This also settles the earlier doubt about injected `mcpServers`/`toolHooks`: both are refused by the same whitelist (message at `:60`). Gap to close separately (flow-owner): `mcp-server.cjs` advertises `additionalProperties: true` on step items (`:64`) while the daemon refuses unknown keys, so a model is told it may send keys that the daemon then rejects.

### D7. Validation

| When | Check | Error shape |
|---|---|---|
| `flow validate` (static) | schema, unique ids, id charset, no `provideSteps` clash, every `{placeholder}` declared in `args`, every arg typed with pattern/enum/range, `sideEffect` present, argv array, limits in range, step type is `model` (else error), serialized tool description within the 16 KiB / 16 tools cap | `HOST_TOOL_*` codes with `Fix:` line and `Did you mean` for unknown names |
| Run start (daemon) | executable resolvable (slice 2: and on the worker allowlist); a connected or launchable worker declares `host-tools`; named tool (slice 2) exists on the source | `VALIDATION_FAILED` naming step, tool id, setting to change |
| Per call | caller token, id declared, args match schema, caps not exceeded | `isError` text naming the violated rule and the allowed shape |

### D8. UX / DX

- `flow show <file|execution>`: per model step a `tools:` row: `id [read|write] <command[0]> args(id:string, status:enum)`; execution view adds call count.
- Errors always name step id, tool id, rule, fix. Example: `Step 'triage' tool 'queue-task-show': argument 'id' has no pattern. Fix: add 'pattern: ^[A-Za-z0-9_-]{1,64}$' or use 'type: enum'.`
- Docs: new `.claude/docs/flows/host-tools.md` (single source) linked from `mcp-and-tool-hooks.md` and `schema-reference.md`; `WORKERS.md` gets the capability + allowlist setting.
- The model-facing description is generated: `<description> (side effect: read|write; runs on the host; arguments: ...)`.
- A `flow tools lint <file>` dry run printing the argv for sample args is optional, not slice 1.

### D9. Security review

| # | Threat | Mitigation | Residual |
|---|---|---|---|
Naming: ids continue the `F-nn` series of the "Flow execution" section of `.claude/threat-model.md` (F-01, F-02 exist; these start at F-03) so the rows can be copied there unchanged when slice 1 lands.

| # | Threat | Mitigation | Residual |
|---|---|---|---|
| F-03 | Argument injection (`--exec`, `-o`, `../`) | Typed args with pattern/enum; leading `-` refused by default; argv array | A pattern that is too loose, flow-author error; `flow validate` rejects unpatterned strings |
| F-04 | Shell interpolation | `spawn` argv, `shell:false`; `.cmd/.bat` refused on Windows | None known; test with `; & | $()` canaries |
| F-05 | Credential exposure to model or tool | Env by NAME allowlist; tokens and `FLOW_WORKER_TOKEN` stripped; model never sees env | The allowed CLI may read its own config (`~/.config/task`): that is the intended host authority |
| F-06 | Tool output exfiltrates host secrets into the model | Output cap; `sideEffect` labelling; existing masker | A read tool returns whatever its CLI prints; choose tools accordingly |
| F-07 | Indirect prompt injection: the OUTPUT of a tool (task titles, issue text, file content) returns into the model context and can steer it | Output is returned as data inside a delimited block marked untrusted; slice 1 tools are `read` only; injected steps cannot gain `hostTools`, `mcpServers`, `toolHooks`, `host` (D6); args are schema-closed so a steered model cannot reach beyond the declared argv shapes | Real and not removable: a steered model can still call every declared tool with any valid args and relay the output to its own outputs. Keep tool sets minimal, do not combine with write tools or network-capable tools in one step |
| F-08 | Local process abuses the callback port | Token + executionId constant-time check; loopback; per-step network rule in sandbox | Same as T-08: the VM model process can read the tokens from its env and call the declared tools only (by design) |
| F-09 | One token authorises both `inject_steps` and `call_tool` | Two tokens, one per scope; tool token only issued when the step has tools; wrong-kind token destroys the connection (D3) | Same holder (helper + model share env): scope split limits what a leaked token buys, it does not hide it |
| F-10 | Model widens its own tools via `provideSteps` | `InjectedStepGuard` whitelist, `hostTools` absent from `ALLOWED_KEYS`, test asserts it (D6) | A future edit that adds the key; the test is the guard |
| F-11 | Flow file from an untrusted source declares tools | Slice 1: local worker only (a script step on a host worker already runs with the worker's whole environment, `.claude/plans/2026-11-13_host-script-environment.md` section 0 item 2); slice 2: executable allowlist mandatory on sandbox workers; run-start refusal; `flow show` lists tools; warning when `write` | An allowlisted binary with a dangerous subcommand: authors review argv templates |
| F-12 | DoS (call flood, huge output, hang) | Timeout, output cap, concurrency 2, 100 calls; kill process tree on timeout; per-call timer (D3) | Cost of an allowed slow CLI |
| F-13 | Path/cwd escape | `cwd` only `workspace`/`none`; no path args unless pattern-constrained | A path arg with a loose pattern |
| F-14 | Stale/forged tool list in VM | Host re-validates id and args per call from its own registry, never from the VM's list | None |
| F-15 | Write tool in read-only workspace run | Slice 1 has no write tools; later a compatibility check | Advisory today (`ReadOnlyWorkspaceRules`) |
| F-16 | TOCTOU on the resolved executable: path swapped between run-start resolution and spawn | Absolute path + (size, mtime) recorded at run start, re-checked right before each spawn, spawn by absolute path, never by name | A same-user process can still swap between the re-check and `exec`; same user already owns the worker, so no new authority. Slice 2 allowlist entries pin the directory, not the name |
| F-17 | Audit log leaks secrets or becomes an exfiltration channel | Argument VALUES logged only for args declared `log: true`, otherwise names + sha256; output content never logged (length only); env values never; tokens never; masker applied | An author marks a secret arg `log: true`; `flow validate` warns on `log: true` for args named like `token`/`secret`/`password` |

### D10. Phasing and work split

Slice 1 = smallest end-to-end: claude + LOCAL (non-sandbox) worker + inline `hostTools`, `sideEffect: read` only, no allowlist config. Safe without the allowlist because on a local worker the flow author already has equal authority (a `script:` step runs on the host with the worker's environment), and the model only gets typed, closed argv shapes. It is NOT safe on a sandbox worker (the flow was written for confinement): so in slice 1 a step with `hostTools` that lands on a sandbox worker is refused by `ExecAssignment` with a named error (extend `refuseWhatTheToolCannotDo`, `ExecAssignment.ts:106-121`), never run without a check.

| Part | Slice 1 work |
|---|---|
| core (flow-engine) | `HostTool` type + optional step field `hostTools` (no `.default()`); static validator `HOST_TOOL_*` (model steps only, size cap); `flow show` rendering; test that `InjectedStepGuard.ALLOWED_KEYS` lacks `hostTools`; schema docs |
| protocol (flow-cli `ipc/Protocol.ts`) | `WORKER_FEATURE_HOST_TOOLS = 'host-tools'`; `AssignableStep` carries `hostTools` inside `stepConfig` (no new top-level `assign` field: unlike `requires`/`host`, the worker must read `stepConfig` anyway to build the server, and a top-level copy would be a second source of truth) |
| worker (flow-cli) | add the feature to `WORKER_FEATURES` (`WorkerLaunch.ts:172-176`); callback v2 `call_tool` + reply + per-call timer + second token (D3); `HostToolLimits` + `HostToolRunner` (argv spawn, env allowlist, caps, audit); `mcp-server.cjs` `tools/list` + `tools/call` from `FLOW_MCP_TOOLS`; daemon routes `hostTools` steps only to workers declaring `host-tools` and fails at run start otherwise |
| plugin (flow-sandbox) | slice 1: only the refusal above. No rewriter or port-rule change |
| tests | canary env (incl. `FLOW_WORKER_TOKEN`), injection corpus (`; & | $()`, leading `-`, `../`), timeout and output cap, wrong-kind token, v1 inject still works, claude local e2e with one read tool, sandbox refusal |

Slice 2: claude on sandbox exec (rewriter passes `FLOW_MCP_TOOLS`, forwarder path, T-08 note), executable allowlist (mandatory on sandbox workers), named tools on the source (B), relay variant. Slice 3: codex and opencode (host and sandbox exec; needs per-provider VM rewriters), `write` tools, optional `host-tools=none` guarantee, quotas, dry-run lint.

## Decisions (user decisions of 2026-11-14 recorded)

| # | Owner | Decision | Recommended default | Consequence of each answer |
|---|---|---|---|---|
| O1 | USER, DECIDED 2026-11-14 | Declaration site: A inline only (what he asked), B named on the worker only, or A + executable allowlist | DECIDED: tools are defined by the step (A). Slice 1 keeps step-inline `hostTools`. The executable allowlist stays our host-side safety for slice 2 (mandatory before any sandbox worker accepts a tool); it supplements step-defined tools, it does not replace them | A-only everywhere: simplest and literal, but any flow file defines what runs on the host, also under a sandbox. B-only: host owner controls, but contradicts "définies dans la step" and needs worker config before a flow runs |
| O3 | USER, DECIDED 2026-11-14 | Should confined profiles (`hermetic-test`, `untrusted-code`) forbid host tools? Plain words: those profiles promise isolation, and a host tool pierces it | DECIDED (his words: "les profils et les hostTools en conflict => warning, et configurable pour devenir une erreur, mais par default warning"): a step with `hostTools` under a confined profile is a validation WARNING by default (`flow validate`, `flow run`, `flow show`), and a setting turns the same finding into an ERROR. Setting (flow-owner's decision, 2026-11-14): key `validation.hostToolsUnderConfinedProfile`, values `warn` (default) or `error`, in the USER config `~/.config/flow/config.yml` (global, like `plugins.instances`; never in a project config or the repo, so a flow cannot relax its own check). Any other value fails at config load naming the key, the value and the accepted values (no silent default). `flow validate`, `flow run` and `flow show` print the finding with the mode that applied ("warning (validation.hostToolsUnderConfinedProfile=warn, default)" / "error (... = error)"); in error mode `flow run` refuses at run start. The `host-tools=none` guarantee stays a later option (slice 3), not needed for this | A host tool is a hole in those profiles: without the guarantee a hermetic run can still reach host CLIs and nothing in the profile says so (`flow show` and a warning do). With it: profiles can refuse tools, at the cost of a new guarantee on every source |
| O6 | USER, CLOSED 2026-11-14 | Per-call human approval for `write` tools | CLOSED ("there is no choice" in slice 1: read-only tools only). Reopen when the first `write` tool is designed (slice 3), with the concrete choice: human approval per call, or declared-in-flow = approved | No approval: unattended runs work, but a steered model can trigger any declared write call. With approval: needs an interactive channel (`user_intervention`-style) and blocks headless runs |
| O2 | ours (decided) | `sideEffect: write` in slice 1 | No: read only; write in slice 3 behind a `flow validate` warning | |
| O4 | ours (decided) | Allowlist location (slice 2) | Source/worker config (host owner), never the flow file | |
| O5 | ours (decided) | codex/opencode in sandbox exec | Stay a plain prompt (no MCP, today's behaviour) until slice 3; user `mcpServers` stay refused (`ExecAssignment.ts:112-119`) | |

## Unverified in code

- Whether the exec wrapper worker (`ExecMain`) builds its `WorkerReady` with the same `WORKER_FEATURES` list (only `WorkerLaunch.ts:172-176,189-190,246` was read): needed for routing in slice 2.
- Line numbers in `mcp-server.cjs` and `StepInjection.ts` moved while this plan was revised (flow-owner's injection fix is in the tree); re-check them at implementation.
- Sandbox relay variant: whether it runs the model step engine on the host and passes MCP config the same way (only the exec variant was read).
- Codex/opencode forwarder rewrite in the VM: `McpConfigRewriter` only parses the claude `{mcpServers}` shape; the opencode (`mcp`) and codex (`-c`) shapes in the VM have no rewriter yet.
- Whether `ModelStepExecutor.ts:323` leaves room for the engine server to be re-added per provider without name clash.
- Windows `.cmd` handling of the host tools (design assumption from cmd.exe argument re-parsing, not tested).

## Not in scope

- Third-party/arbitrary MCP servers inside the sandbox (user `mcpServers` on codex/opencode stay refused there even after slice 3; only the engine `flow` server is relayed).
- Not out of scope, only deferred: codex/opencode support and sandbox workers (slices 2-3).
- Tools that run inside the VM (the VM already has its own shell).
- Interactive approval UI, quotas across runs, remote (non-local) workers.
- Changing `provideSteps` semantics or limits.
- Credential brokering (a tool needing a secret uses the host CLI's own login).
