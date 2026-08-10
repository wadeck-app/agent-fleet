---
name: flow-design
description: Design, validate, and queue a YAML flow for execution via the flow CLI. Follows the two-phase pattern: design+validate before execute. Never runs a flow without user approval.
allowed-tools:
    - Bash
    - Read
    - Write
    - Edit
    - Glob
    - Grep
---

# Flow Design Skill

Use this skill to design a flow, validate it, get user approval, then execute it.

**Never execute a flow without explicit user approval.** The two phases are mandatory.

## Phase 1 — Design + Validate

### Step 1 — Write the YAML

Write the flow file. Use this minimal template:

```yaml
id: <kebab-case-id>
version: "1.0.0"
name: <Human readable name>
description: <What this flow does>
workspace:
  mode: shared        # shared or manual (isolated not supported)
  gitStrategy: any
  reusePolicy: if-available
inputs:
  <name>:
    type: string
    required: true
steps:
  - id: <step-id>
    type: script        # or: model
    script: <shell command>
```

**Step types:**

| type | required fields | notes |
|------|----------------|-------|
| `script` | `script` | Shell command. `env:` for explicit vars (nothing inherited by default). |
| `model` | `model`, `prompt` | Model values: `sonnet`, `haiku`, `opus`. Prompt supports `${{ inputs.x }}` and `${{ steps.y.outputs.z }}`. |
| `subflow` | `flowId`, `inputs` | Not supported in v1 — throws at runtime. Do not use. |
| `user_intervention` | — | Not supported in v1 — throws at runtime. Do not use. |

**Base fields (all steps):**

```yaml
- id: step-id          # required, unique
  name: Human name     # optional
  type: script|model
  depends: [other-id]  # steps that must complete first
  when: "${{ inputs.env == 'prod' }}"  # conditional execution
  output:              # extract named variables from output
    my_var:
      pattern: "Result: (.+)"
      type: string
  env:                 # explicit env vars only — nothing inherited
    PATH: /usr/bin:/bin
    MY_VAR: ${{ inputs.x }}
```

**Secrets** (use URI schemes, never plain values):

```yaml
env:
  API_TOKEN: env://MY_ENV_VAR        # from process.env at execution time
  DEPLOY_KEY: file://./secrets/k.pem # relative to workspace, no path traversal
  CODE: input://access_code          # from --input=access_code=xxx
```

**Step injection** (model steps only): Claude can call `provideSteps` MCP tool during execution to inject new steps dynamically.

### Step 2 — Validate

```bash
flow validate <path/to/flow.yml>
```

- Exit 0: valid, no output
- Exit 1: validation errors printed as JSON — fix them
- Exit 2: file not found
- Exit 3: malformed YAML

**Fix all errors before proceeding.** Do not move to Phase 2 with a failing validation.

## Phase 2 — Approve + Execute

### Step 3 — Show the user the flow

Present the validated YAML to the user. Show:
- What each step does
- What inputs are required
- What the expected outcome is

**Wait for explicit approval.** Do not proceed until the user confirms.

### Step 4 — Execute

```bash
flow run <path/to/flow.yml> [--input=key=value] [--quiet]
```

Options:
- `--input=key=value` — pass an input variable (repeatable)
- `--quiet` — suppress the execution ID output
- `--flow-id <id>` — select a flow from a multi-flow file

On success: prints an 8-char execution ID and exits. The flow runs in the background daemon.

Check status:
```bash
cat ~/.flow-daemon/executions/<execution-id>.json
```

Check logs:
```bash
cat ~/.flow-daemon/logs/$(date +%Y-%m-%d).ndjson | grep "<execution-id>"
```

## What NOT to do

- Do not use `user_intervention` steps — they throw at runtime.
- Do not use `workspace.mode: isolated` — not supported in v1.
- Do not pass secrets as plain `value://` URIs — forbidden.
- Do not use absolute paths in `file://` secret URIs — path traversal is blocked.
- Do not execute without validation passing.
- Do not execute without user approval.

## Example — minimal working flow

```yaml
id: hello-world
version: "1.0.0"
name: Hello World
description: Greet and capture output
workspace:
  mode: shared
  gitStrategy: any
  reusePolicy: if-available
inputs:
  name:
    type: string
    required: true
steps:
  - id: greet
    type: script
    script: echo "Hello, $NAME!"
    env:
      NAME: ${{ inputs.name }}
```

Run it:
```bash
flow validate hello-world.yml   # must exit 0
# [show user, get approval]
flow run hello-world.yml --input=name=World
```

## Example — model step with output extraction

```yaml
steps:
  - id: analyze
    type: model
    model: sonnet
    prompt: |
      Analyze this code and return a JSON object with keys:
      - complexity: "low" | "medium" | "high"
      - issues: array of strings

      Code: ${{ steps.read.outputs.rawOutput }}
    output:
      complexity:
        pattern: '"complexity":\s*"(\w+)"'
        type: string
      issues:
        pattern: '"issues":\s*(\[.*?\])'
        transform: parseJSON
```
