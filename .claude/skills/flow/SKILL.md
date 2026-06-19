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

### flow validate

Validate a flow file against the schema and engine rules. Exits 0 on valid (warnings printed but non-fatal). Exits 1 on errors, with a list of issues.

```bash
flow validate my-flow.yml
```

### flow run

Run a flow by file path or registered flow ID. **Non-interactive only** — any step of type `user_intervention` (shown as `(!)` in `flow show`) will cause the command to throw immediately.

On success: prints `✓ Flow '<id>' completed` and step outputs (key: value per output). Exits 0.
On failure: prints the error message. Exits 1.

```bash
# Run by file path (works from any directory)
flow run my-flow.yml --inputs description="fix the login bug"

# Run by registered flow ID (loaded from .agent-fleet/flows.yml in the current directory)
flow run my-flow-id --inputs key=value --cwd /path/to/agent-fleet-project

# Multiple inputs
flow run my-flow.yml --inputs foo=bar --inputs baz=qux
```

Options:

- `--inputs key=value` (repeatable) — input pairs passed to the flow
- `--cwd <dir>` — working directory for execution and flow ID resolution (defaults to current directory)

**Registered flow IDs** are resolved from `.agent-fleet/flows.yml` and `.agent-fleet/flows-custom.yml` relative to `--cwd`. Running by file path has no such requirement.
