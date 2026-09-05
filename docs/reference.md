# Reference

_Moved from README -- see [README](../README.md) for the overview._


### Test infrastructure

| Package               | Role                                                                             |
| --------------------- | -------------------------------------------------------------------------------- |
| `packages/test-utils` | Shared test factories, mock builders, REST API helpers. Dev-only dependency.     |
| `packages/e2e-web`    | Playwright end-to-end test suite against the full running web app and Storybook. |

## Dependency graph

```
shared-common           (no local deps)
shared-orch-worker      (no local deps)
flow-engine          ←  shared-common, shared-orch-worker
orchestrator         ←  flow-engine, shared-common, shared-orch-worker
worker               ←  flow-engine, shared-common, shared-orch-worker
shared-frontend-backend ← shared-common
web-backend          ←  orchestrator, shared-common, shared-frontend-backend, shared-orch-worker
web-frontend         ←  shared-frontend-backend
legacy-cli           ←  orchestrator, shared-common, shared-orch-worker
```

## Quick start

```bash
npm install

# Start the full stack (orchestrator + web-backend)
npm run dev

# Start a worker (separate terminal)
npm run worker:flow

# Submit a task via CLI
npm run add-task create "Add user authentication" high
```

Web UI: `http://localhost:5320`
Web backend API: `http://localhost:3320`

## Flow CLI

Standalone alternative to the web stack. One binary, no server required.

```bash
npm install -g @wadeck-app/flow-cli

flow start                              # start background daemon
flow run ./my-flow.yml                  # run a flow
flow show <execution-id>                # inspect an execution
flow logs                               # tail today's daemon log
flow cli update                         # manual update
```

| Command            | Description                              |
|--------------------|------------------------------------------|
| `flow start/stop`  | Manage the background daemon             |
| `flow status`      | Show daemon state (running/stopped/pid)  |
| `flow run`         | Execute a flow YAML                      |
| `flow validate`    | Validate a flow YAML without running     |
| `flow show`        | Inspect a past execution                 |
| `flow history`     | List recent executions                   |
| `flow docs`        | Show flow YAML documentation             |
| `flow cli update`  | Update to latest release                 |

Config dir: `~/.config/flow/` (override: `FLOW_CONFIG_DIR` env). Auto-updates in background on every invocation.

## Task CLI

Lightweight local task tracker, no server required.

```bash
npm install -g @wadeck-app/task-cli

task init                     # initialize a project (creates .task/)
task new "description"        # create a task
task list                     # list all tasks
task show <id>                # show a task
task set-status <id> <status> # move a task to a status
task cli update               # manual update
```

Configure statuses and hooks in `.task/config.yml`. Global config: `~/.config/task/`. Auto-updates in background on every invocation.

## Development

```bash
npm run build       # build all packages
npm test            # run all tests
npm run check       # TypeScript + ESLint across monorepo
```

Test files live next to implementation (`FlowExecutor.ts` / `FlowExecutor.test.ts`).
