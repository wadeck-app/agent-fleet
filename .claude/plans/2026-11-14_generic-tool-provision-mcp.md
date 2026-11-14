# Generic host-tool provisioning through one MCP server

Status: draft plan, 2026-11-14. Separate plan/spec from the sandbox worker plan (`2026-10-25_docker-sandbox-worker.md`), as the user asked.

## Goal / non-goals

Goal: a step declares host tools (id, description, command template, allowed arguments); the worker exposes them to ANY model (claude, codex, opencode) on ANY worker (local, sandbox exec, sandbox relay) through ONE generic MCP server. The model gets the capability, never the host credentials or a shell.

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
| Sandbox exec, codex/opencode: a step with non-empty `mcpServers` or `toolHooks` is refused ("plain prompt"); the engine's own server is dropped for them (`tool === 'claude'` gate) | `ExecAssignment.ts:102-121`; `ExecMain.ts:192-200` |
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

Recommendation: C, phased. Slice 1 ships A + a worker-side binary allowlist (executable must be on the allowlist, else tool refused at validation and at run start). B (named tools, referenced by id) is slice 2. Precedence: a step-inline id equal to a named id is a validation error (no shadowing).

### D2. Tool definition schema

```yaml
hostTools:
  - id: queue-task-show          # [a-z0-9-]+, unique in the step; the MCP tool name
    description: "Show a task of the queue by id (read only)."
    sideEffect: read             # read | write (required, no default)
    command: [task, show, "{id}", --json]   # argv array ONLY, never a shell string
    args:
      id: { type: string, pattern: "^[A-Za-z0-9_-]{1,64}$", required: true }
      status: { type: enum, values: [open, done] }   # enum | string+pattern | integer(min,max) | boolean
    cwd: workspace               # workspace (default) | none ; no arbitrary paths in slice 1
    env: [TASK_PROFILE]          # names only; values come from the worker env, never from the model
    timeoutSeconds: 30           # default 30, max 300
    maxOutputBytes: 65536        # default 64 KiB, hard max 1 MiB; truncation is reported to the model
```

| Field | Decision |
|---|---|
| `command` | argv array; `{name}` placeholders must be a whole argv element or an `--flag={name}` value; each placeholder must be declared in `args` |
| `args` | closed schema; each arg has a type and a pattern/enum/range; no free-form string without a `pattern` (validation error); values starting with `-` are refused unless the pattern allows them explicitly |
| `sideEffect` | label shown in `flow show` and in the tool description sent to the model; `write` tools need `readOnly` workspace compatibility check (`ReadOnlyWorkspaceRules` is advisory today) |
| `env` | allowlist of NAMES read from the worker process environment; baseline env = PATH-like minimum as in `HostScriptEnvironment`; no literal values in the step (credentials live with the worker) |
| `cwd` | workspace of the run or none |
| limits | timeout, output cap, max concurrent calls per step (default 2), max calls per step (default 100) |

### D3. Execution location and trust

Decision: execute on the worker's HOST, in the worker process (`WorkerAdapter` side), never in the VM, never by the model process.

- Path: model -> MCP `tools/call` -> `mcp-server.cjs` (VM or host) -> callback TCP -> `McpCallbackConnection` (host worker) -> `HostToolRunner` -> `spawn(argv, {shell:false})` -> reply on the same connection.
- Requires a protocol extension: callback messages get a `kind` (`inject_steps` | `call_tool`) and a reply line `{ok, text, truncated, exitCode}`. The current one-way protocol is kept for `inject_steps`.
- Model controls only: tool id (must be declared) and arg values (validated against the declared schema). It never controls: argv[0], flags, cwd, env, timeout, limits.
- No shell: `spawn` with an argv array; on Windows `.cmd`/`.bat` targets are refused in slice 1 (cmd.exe re-parses arguments); executable resolved once at run start to an absolute path and recorded.
- No credential passing: env allowlist by name only; the per-step token and the `flow` credentials (`FLOW_WORKER_TOKEN`) are never in the child env (explicit deny list tested with a canary).
- Per-step bearer: the existing callback token (random per model step, constant-time compare) authorises tool calls too; scoped to this step's declared ids; dies with `McpServer.stop()`.
- Audit: one execution-log entry per call (`stepId, toolId, args hash + redacted args, exitCode, durationMs, bytes, truncated`), written by the host, not by the model-visible server; denied calls logged too.
- Reply to the model: stdout (capped), stderr tail (capped), exit code; errors are actionable text (`isError: true`).

### D4. One generic server for all models

Decision: extend `mcp-server.cjs` into the single generic server. `tools/list` = `provideSteps` + the step's host tools. The tool list is passed by env `FLOW_MCP_TOOLS` (JSON: id, description, input schema, no command) set in `buildMcpServerConfig`; the command never leaves the host worker, so the VM sees descriptions and schemas only. (If env size matters, a temp file read by the server; cap 256 KiB.)

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
| Required guarantee? | No new guarantee in slice 1. The worker advertises `hostTools=supported` as a capability; a step with `hostTools` on a worker that does not support them fails at run start with a named error (never silently dropped) |
| `host: true` analog? | Not needed; `hostTools` IS the narrow analog. Warning `HOST_TOOL_WITH_WRITE` for `sideEffect: write` in a flow with `profile: untrusted-code`/`hermetic-test`; suggest `read` tools only |
| `profile:` expansion | Unchanged; profiles do not grant host tools. A future `host-tools=none` guarantee can be required by hermetic profiles (open decision O3) |
| Source policy | Source/plugin config holds the executable allowlist (D1 C); a tool whose `command[0]` is not allowed is refused at run start, naming the source setting to change |

### D6. Injected steps (provideSteps)

Decision: injected steps do NOT inherit host tools, and may NOT declare `hostTools`. Same mechanism as `InjectedHostMarkerGuard`: any injected step (any depth) carrying `hostTools` is refused, whole batch, nothing stripped. Rationale: a model steered by hostile content must not widen its own reach. A flow that wants a later tool-using step writes it in the definition. Same check also needed for injected `mcpServers` (see "Unverified").

### D7. Validation

| When | Check | Error shape |
|---|---|---|
| `flow validate` (static) | schema, unique ids, id charset, no `provideSteps` clash, every `{placeholder}` declared in `args`, every arg typed with pattern/enum/range, `sideEffect` present, argv array, limits in range, step type is `model` (else error), no `hostTools` inside `steps/subSteps` of an injected-looking path | `HOST_TOOL_*` codes with `Fix:` line and `Did you mean` for unknown names |
| Run start (daemon) | executable on the worker allowlist and resolvable; worker supports `hostTools`; named tool (slice 2) exists on the source | `VALIDATION_FAILED` naming step, tool id, setting to change |
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
| H-1 | Argument injection (`--exec`, `-o`, `../`) | Typed args with pattern/enum; leading `-` refused by default; argv array | A pattern that is too loose, flow-author error; `flow validate` rejects unpatterned strings |
| H-2 | Shell interpolation | `spawn` argv, `shell:false`; `.cmd/.bat` refused on Windows | None known; test with `; & | $()` canaries |
| H-3 | Credential exposure to model or tool | Env by NAME allowlist; token and `FLOW_WORKER_TOKEN` stripped; model never sees env | The allowed CLI may read its own config (`~/.config/task`): that is the intended host authority |
| H-4 | Tool output exfiltrates host secrets into the model | Output cap; `sideEffect` labelling; secret masking via the existing masker | A read tool returns whatever its CLI prints; choose tools accordingly |
| H-5 | Local process abuses the callback port | Existing token + executionId constant-time check; loopback; per-step rule in sandbox | Same as today (T-08); VM model process can read the token from its own env, now it can call declared tools only (by design) |
| H-6 | Model widens its own tools via `provideSteps` | D6 guard | Verify `mcpServers` guard (unverified) |
| H-7 | Flow file from untrusted source declares tools | Worker executable allowlist; run-start refusal; `flow show` lists them; warning when `write` | An allowlisted binary with a dangerous subcommand: flow authors review argv templates |
| H-8 | DoS (call flood, huge output, hang) | Timeout, output cap, concurrency 2, max 100 calls; kill process tree on timeout | Cost of an allowed slow CLI |
| H-9 | Path/cwd escape | `cwd` only `workspace`/`none`; no path args unless pattern-constrained | A path arg with a loose pattern |
| H-10 | Stale/forged tool list in VM | Host re-validates id and args per call from its own registry, never from the VM's list | None |
| H-11 | Write tool in read-only workspace run | Compatibility check at validation | Advisory today (`ReadOnlyWorkspaceRules`) |

Add the table rows to `.claude/threat-model.md` (Flow execution section) when slice 1 lands.

### D10. Phasing and work split

Slice 1 (minimal, claude local + claude sandbox exec, inline A, read-only tools):

| Part | Work |
|---|---|
| core (flow-engine) | `HostTool` type + step field `hostTools`; static validator (`HOST_TOOL_*`); `InjectedHostToolGuard` next to `InjectedHostMarkerGuard`; `flow show` rendering; schema docs |
| worker (flow-cli) | callback protocol `call_tool` + reply; `HostToolRunner` (argv spawn, env allowlist, caps, audit log); `mcp-server.cjs` `tools/list` + `tools/call` from `FLOW_MCP_TOOLS`; worker capability + executable allowlist setting |
| plugin (flow-sandbox) | no new rule needed (same callback port); `McpConfigRewriter` passes through the extra env (`FLOW_MCP_TOOLS`) and keeps refusing other servers; relay variant check; `T-08` note updated |
| tests | canary env, injection corpus, timeout/output cap, VM->host e2e world, injected-step refusal, codex/opencode config snapshots |

Slice 2: codex + opencode in sandbox exec (D4 table), named tools on the source (B), `write` tools. Slice 3 (optional): `host-tools=none` guarantee, per-tool call quotas, dry-run lint.

## Open decisions for the user

| # | Decision | Recommended default |
|---|---|---|
| O1 | Declaration site: A only, B only, or A+B with allowlist | A + worker executable allowlist now; B in slice 2 |
| O2 | Allow `sideEffect: write` tools in slice 1 | No: read only first; write behind a warning in slice 2 |
| O3 | Should hermetic/untrusted profiles forbid host tools (new guarantee `host-tools=none`) | Not in slice 1; revisit when a profile user asks |
| O4 | Executable allowlist location: worker env var, source config in `plugin.config.js`, or `~/.config/flow` | Source/worker config (host owner), never the flow file |
| O5 | Should codex/opencode in sandbox exec stay "plain prompt" unless the step has `hostTools` | Yes: only the engine `flow` server is relayed, user `mcpServers` stay refused |
| O6 | Per-call approval for `write` tools | No; declared + allowlisted is the approval |

## Unverified in code

- Whether `StepInjection` refuses `mcpServers` (or `toolHooks`) on an injected model step: lines 1-80 show only the `host` guard; `StepFieldCopier.ts:36` copies `mcpServers`. If not refused, an injected step could ask for an arbitrary host MCP server today: check and fix independently of this plan.
- Sandbox relay variant: whether it runs the model step engine on the host and passes MCP config the same way (only the exec variant was read).
- Codex/opencode forwarder rewrite in the VM: `McpConfigRewriter` only parses the claude `{mcpServers}` shape; the opencode (`mcp`) and codex (`-c`) shapes in the VM have no rewriter yet.
- Whether `ModelStepExecutor.ts:323` leaves room for the engine server to be re-added per provider without name clash.
- Windows `.cmd` handling of the host tools (design assumption from cmd.exe argument re-parsing, not tested).

## Not in scope

- Third-party/arbitrary MCP servers inside the sandbox.
- Tools that run inside the VM (the VM already has its own shell).
- Interactive approval UI, quotas across runs, remote (non-local) workers.
- Changing `provideSteps` semantics or limits.
- Credential brokering (a tool needing a secret uses the host CLI's own login).
