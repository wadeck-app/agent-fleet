---
name: flow
description: Design, validate, preview, and run agent flows from the CLI. Use when an agent needs to create a new flow from a description, check an existing flow YAML, display a flow summary for human review, or execute a flow. Covers the full flow lifecycle: docs → show → validate → run.
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
  - Glob
---

# Flow CLI

The `flow` CLI drives the full lifecycle of agent flow YAML files. It is a standalone tool — no Agent Fleet project required to use it.

## Invocation

```bash
flow show my-flow.yml
```

If `flow` is not found, it has not been installed yet — see Installation below.

## Installation (one-time, machine-wide)

The CLI is built from the Agent Fleet monorepo and linked globally via npm. Run once:

```bash
cd <agent-fleet-repo-root>
npm run build --workspace=flow-cli
cd packages/flow-cli && npm link
```

After that, `flow <command>` works from any directory on this machine.

**After code changes** to `flow-cli` or `flow-engine` in the repo, rebuild to pick them up (no re-link needed):

```bash
cd <agent-fleet-repo-root>
npm run build --workspace=flow-cli
```

## Workflow

### New flow

1. `flow docs --output /tmp/caps.md` — write capabilities to file, then read it
2. Write the YAML based on the caps doc (ask Claude to help)
3. `flow show my-flow.yml` — review the table summary before editing
4. `flow validate my-flow.yml` — catch schema and rule errors
5. `flow run my-flow.yml --inputs key=value` — execute

### Existing flow

Skip steps 1–2, start at `flow show <file>`.

## Commands

### flow docs

Prints the full flow engine reference: all step types, variable types, workspace config, template syntax, output extraction. The output is large — always write to a file and read sections as needed.

```bash
flow docs --output /tmp/caps.md   # recommended
flow docs                          # prints to stdout (large)
```

### flow show

Display a concise table summary of a flow file. Use this to review a generated or existing flow before editing or running it. One line per step.

```bash
flow show my-flow.yml
```

Example output:

```
my-flow  v1.0.0
My Flow Name
workspace: isolated  git:feature-branch  reuse:never
inputs:    description (text, required)   priority (enum, default: medium)
status:    ok -> approved   fail -> todo
---------------------------------------------------------------
 #  ID               TYPE     DEPENDS                  OUTPUTS
---------------------------------------------------------------
 1  analyze          sonnet   -                        summary, risk
 2  run-tests        script   1                        passed, count
 3  approve (!)      approval 2                        approved
 4  deploy           script   3: if(approved)          url    err -> 2  max:3x
---------------------------------------------------------------
  4 steps:  1 sonnet   2 script   1 approval
```

**Reading the table:**

- TYPE shows the model name (`sonnet`, `haiku`, `opus`) for model steps, `script`, `subflow:flowId`, or the intervention subtype (`approval`, `choice`, `question`)
- `(!)` — blocking `user_intervention` step: flow pauses until the user responds. **`flow run` will throw on any step with `(!)`.** Interactive flows must be executed via the Agent Fleet web backend (`POST /api/flows/:id/run`), not via the CLI.
- `N: if(expr)` in DEPENDS — conditional dependency (step runs only when expr is true)
- `err -> N  max:Mx` — `onFailure.goto` feedback loop back to step N, at most M iterations

**Inspecting an execution:** `flow show <execution-id>` (id from `flow history`, unique prefix accepted) prints the run's steps with status, duration, model, cost and error. Failed steps also show the tail of stdout/stderr.

```bash
flow show a6wug7bh               # last 2000 chars of failed-step stdout/stderr
flow show a6wug7bh --tail 500    # keep the last 500 chars
flow show a6wug7bh --full        # no truncation
flow show a6wug7bh --json        # raw execution record
```

Add `--io` to also print what each step received and produced: flow inputs it reads, rendered script `env`, rendered model `prompt`, outputs, and stdout/stderr tails. Caps: 4096 characters per value, 32768 per step, 1048576 per execution; a cut value is marked `truncated` with its original length. Declared secrets are masked; anything else (plain inputs, inherited env vars, printed output) is stored as is. Older records say "not recorded for this run".

```bash
flow show a6wug7bh --io
```

An existing file path wins over an id. A truncated stream ends with `(N more chars, see <path>)` pointing at the raw `~/.config/flow/executions/<id>.json`.

### flow validate

Validate a flow file against the schema and engine rules. Exits 0 on valid (warnings printed but non-fatal). Exits 1 on errors, with a list of issues.

```bash
flow validate my-flow.yml
```

A registry file (`flows.yml`, with `includes:` or listing flows) is refused with exit 4: "<file> is a flow registry (...), not a single flow definition. Validate a flow with: flow validate <path-to-flow-file>". It also reports the version status (see Versions).

### Versions

- Every flow file declares `version: '1.2.0'`: a quoted semver (optional prerelease like `'1.3.0-rc.1'`, no `+build`). Unquoted `1.0` is refused. Without `version` the flow is `0.0.0`, runs, warns, and cannot be pinned.
- The first run stores an immutable snapshot of the definition; each execution records `flowVersion`, `definitionHash` and how it was chosen (`latest`, `pinned`, `file`). `flow resume` keeps the run's definition.
- The same version never holds two different contents: running a changed file under an already-run version is refused ("same version X but different content: bump the version"). Comments, formatting and key order do not count. After ANY change you want to run, raise the version (patch fix, minor compatible addition, major for inputs or behaviour); use a prerelease (`1.2.1-dev.1`) while iterating.
- `flow run my-flow.yml` runs that file as is. `flow run my-flow` runs the highest semver among the registry entry and snapshots, fixed at run start. `flow run my-flow@1.2.0` pins that version from its snapshot.
- `flow versions <flowId>` lists known versions with hash and first-seen date (`*` = latest). `flow validate` and `flow show <file>` say beforehand whether the version is new, already run, in conflict, or lower than the latest.

### Sub-steps

A step with `parent: <id>` children is re-run when a child fails. `subStepStrategy` on the parent picks the reaction:

| Strategy | Behaviour |
| --- | --- |
| `restart-on-first-failure` (default) | The parent restarts at the first failed child. |
| `wait-all` | All children run to the end, then the parent gets all failures. `flow validate` warns (exit 0) when a child `depends` on a sibling: if the sibling fails, the dependent is settled as not run. |
| `waves` | Each direct child declares an integer `wave` (ordering only; gaps like 10, 20, 30 are fine). |

Waves: children of the same wave run in parallel and are all awaited; the next wave starts only if the previous one fully passed. A failed wave restarts the parent with only that wave's feedback, then every wave runs again from wave 1. Each failed wave consumes one of `maxSubStepIterations` (default 3). A nested sub-step runs in its ancestor's wave and must not declare `wave`. `flow validate` errors on a direct child without `wave`, `wave` outside a waves parent, a non-integer wave, an unknown strategy, or `depends` on a later wave; it warns on fewer than 2 waves. Full example: `flow docs`, section Sub-step waves.

A `script` step takes an optional `timeout:` (seconds, no default): on expiry the script and its whole process tree are killed and the step fails normally (`retry`/`onFailure` apply). On Windows, opencode model steps run their bash tool under Git Bash (`SHELL` set from `FLOW_BASH_PATH` or the standard locations; a `SHELL` in flow/step `env` wins); if Git Bash is missing the step stays on PowerShell and `flow validate` warns `OPENCODE_SHELL_NOT_FOUND` (exit 0).

Engine-origin failures (watchdog silence past `queue.stepSilenceLimitSeconds`, lost worker) are terminal: no `retry`, `onFailure` or parent re-run, because the step may already have had an effect. The execution and its parent fail with the real error.

### Events

The flow daemon publishes `flow.execution.{started,completed,failed}` and `flow.step.{started,completed,failed}` to the queue. Payload carries ids, status, timing and a short masked `error`, never inputs or outputs. `queue wait` matches exact names, so waiting for completed OR failed takes two waits, filtered with `--when "payload.executionId=<id>"`. `flow.step.failed` is not final when the step is retried. In `subscribers.yml`, `flow.>` matches all flow events and `flow.step.*` all step events. `FLOW_QUEUE_EVENTS=0` in the daemon environment disables them. Reference: `flow docs`, section Events.

### Secrets

A secret is an input declared `type: password`. The flow file never holds the value: at run time you pass a reference, and the daemon resolves it before any step starts.

```yaml
inputs:
  API_TOKEN:
    type: password
    required: true
steps:
  - id: call-api
    type: script
    secrets: [API_TOKEN] # the step gets env var API_TOKEN; other steps never see it
    script: curl -s -H "Authorization: Bearer $API_TOKEN" https://example.invalid/api/status
```

```bash
flow run my-flow.yml --inputs API_TOKEN=env://MY_API_TOKEN   # read from the DAEMON environment
flow run my-flow.yml --inputs API_TOKEN=file://./secrets/api-token   # relative path, no traversal
```

- Only `env://` and `file://` references are accepted (no literal, no `input://`, no `value://`). A secret needs at least 8 characters.
- Use it in a `script` step through `secrets: [NAME]` or `${{ inputs.NAME }}`. `flow validate` refuses a secret in a model, `user_intervention` or `subflow` step and in flow-level `env`.
- The exact value (also JSON-escaped, URL-encoded, base64, hex) is replaced by `[secret:NAME]` in records, logs, CLI output and HTTP pages. No pattern or name guessing: an env var that is not a declared secret is NOT masked, so declare every secret you use.
- `flow show <file>` lists each secret (name, source kind, steps), never a value. Full reference: `flow docs`, section Secrets.

### flow run

Run a flow by file path or registered flow ID. **Non-interactive only** — any step of type `user_intervention` (shown as `(!)` in `flow show`) will cause the command to throw immediately.

By default `flow run` is fire-and-forget: it submits the execution to the daemon and returns; follow it with `flow history` / `flow show <execution-id>`, or pass `--wait` to block until it ends. Exit code 0 on success, non-zero on failure (124 when `--wait` hits its `--timeout`).

```bash
# Run by file path (works from any directory)
flow run my-flow.yml --inputs description="fix the login bug"

# Run by registered flow ID (loaded from .flow/flows.yml of the resolved project, see Project layout)
flow run my-flow-id --inputs key=value

# Multiple inputs
flow run my-flow.yml --inputs foo=bar --inputs baz=qux
```

Options:

- `--inputs key=value` (repeatable) — input pairs passed to the flow
- `--flow-id <id>` — select a flow inside a multi-flow YAML
- `--wait` / `--timeout <duration>` — block until the execution ends (default is fire-and-forget; timeout default 10m)

**Project layout:** a project is a folder registered once with the `project` CLI: `project add "<folder>"` (`project list` shows them). `.git`, `.flow/config.yml` and `.flows` no longer make a folder a project. The project is resolved from `-p/--project <name|alias|id>`, then `FLOW_PROJECT`, then the registered folder containing the current directory (deepest wins); there is no fallback. Outside a registered project the run is refused, including `flow run <file>`, with the registry's "no project" message followed by `flow no longer detects a project from .git, .flow/config.yml or .flows: register the folder once with: project add "<cwd>"`. `-p` exists on `flow run`, `flow versions`, `flow history` (filter, applied only when `-p`/`FLOW_PROJECT` is set) and `flow worker --project` (repeatable; takes names, aliases or ids, never paths). `flow show`, `flow validate` and `flow logs` take no project. Registered flow IDs come from `.flow/flows.yml` and `.flow/flows-custom.yml`, which stay in the project folder. Each execution records `projectId`; `flow history` and `flow show <execution-id>` display `name (id)`. Reference: `flow docs`, section Projects.

**Processes:** `flow cli processes [--json]` lists the flow daemons, workers and clients on the machine (age, ports, whether the parent is alive) to spot leaked ones. It is read-only and never kills anything.

**Daemon port:** `FLOW_DAEMON_PORT` sets the daemon command port (`0` lets the OS pick one; default range 47823-47833).
