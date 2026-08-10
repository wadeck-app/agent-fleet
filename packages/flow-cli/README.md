# flow-cli

CLI tool for executing YAML-described flows via a daemon+worker architecture.

## Commands

```
flow validate <file>               # Validate a flow YAML file
flow run <file> [options]          # Queue a flow for execution

task new <description>             # Create a new task
task list                          # List all tasks
task show <id>                     # Show full task details
task approve <id>                  # Set task status to approved
task set-status <id> <status>      # Set task to any status
```

### flow run options

```
--flow-id <id>        Select a specific flow from a multi-flow file
--input=key=value     Pass an input variable (repeatable)
--quiet               Suppress executionId output
```

### task set-status values

`created` | `elaborating` | `flow-review` | `approved` | `in-progress` | `failed` | `done`

## Architecture

```
CLI process                Daemon process               Worker processes
───────────                ──────────────               ────────────────
flow run ──HTTP──► run()   StepQueue
                           CommandHandler ──WS assign──► Worker
                           WorkerPool                    StepExecutor
                           ExecutionStore ◄──WS result── McpServer
                           LogWriter      ◄──WS log ────
                           HookDispatcher
```

See `docs/architecture.md` for the full diagram and component descriptions.

## Configuration

### Daemon config: `~/.flow-config.yaml`

```yaml
queue:
  concurrency: 1        # max parallel workers
logs:
  retainDays: 30        # log and execution file retention
worker:
  wsPort: null          # WebSocket port (default: HTTP_PORT + 1)
```

### Project config: `.flows/config.yml`

```yaml
version: 1

defaults:
  model: claude-opus-5

hooks:
  onFlowStart:
    - type: cli
      command: node
      args: [".flows/hooks/on-flow-start.js"]
  onFlowEnd:
    - type: http
      url: http://localhost:3000/webhooks/flow-end
  onTaskCreated:
    - type: cli
      command: node
      args: [".flows/hooks/on-task-created.js"]
  onStatusChange:
    - type: cli
      command: node
      args: [".flows/hooks/on-status-change.js"]
```

## Flow YAML format

```yaml
id: my-flow
version: "1.0.0"
name: My Flow
description: What this flow does
workspace:
  mode: shared        # shared | manual (isolated not supported in v1)
  gitStrategy: any
  reusePolicy: if-available
inputs:
  repo_url:
    type: string
    required: true
steps:
  - id: clone
    type: script
    script: git clone ${{ inputs.repo_url }}
  - id: analyze
    type: model
    model: sonnet
    prompt: "Analyze the code in ${{ inputs.repo_url }}: ${{ steps.clone.outputs.stdout }}"
    depends: [clone]
```

## Secrets

In flow YAML, declare secrets using URI schemes:

```yaml
steps:
  - id: deploy
    type: script
    script: deploy.sh
    env:
      API_TOKEN: env://MY_API_TOKEN        # from process.env
      DEPLOY_KEY: file://./secrets/key.pem # relative file path
      ACCESS_CODE: input://access_code     # from --input=access_code=xxx
```

`value://` is forbidden in secrets. Absolute file paths are forbidden.

## Step injection (model steps)

Model steps can inject new steps into the running graph by calling the `provideSteps` MCP tool:

```
Tool: provideSteps
Input: { steps: [{ id, type, depends?, parent?, ...stepFields }] }
Output: { injected: ["step-id-1"] }
```

The MCP server is started per-execution before Claude is launched, and torn down after the step completes.

## Storage

```
~/.flow-daemon/
  executions/<id>.json     # execution state (queued→running→completed|failed)
  logs/YYYY-MM-DD.ndjson   # daily log files, all executions multiplexed

.flows/tasks/
  index.json               # task summaries
  <taskId>.json            # full task record with history
```

## Setup

### First-time installation

```bash
cd packages/flow-cli
npm run build   # produces dist/
npm link        # registers flow and task in npm's global bin
```

After this, `flow` and `task` are available from any directory.

### Updating after code changes

```bash
cd packages/flow-cli
npm run build   # dist/ is updated; the npm link symlink already points there
```

No re-link needed. The global commands immediately reflect the new build.

### Verify

```bash
flow --help
task --help
```

## Build

```bash
node build.mjs             # esbuild bundle to dist/
npx vitest run             # run tests (builds first via pretest)
```

The package uses esbuild (not tsc) because flow-engine uses `module: bundler` resolution which is incompatible with NodeNext. esbuild handles the bundling correctly.
