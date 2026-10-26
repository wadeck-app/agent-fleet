# CLI Usage Guide

## fleet-task

Submits a task to the running web-backend/orchestrator from the command line.

```bash
# Build and link globally (once)
cd packages/legacy-cli
npm run build
npm link

# Submit a task
fleet-task "Implement a new feature"

# Submit a task targeting a specific flow
fleet-task "Fix bug in authentication" --flow debug-local

# Help
fleet-task --help
```

## flow projects

flow works inside a **registered project** only. Register each folder that holds a `.flow/` once: `project add "<folder>"` (`project list` shows them). `.git`, `.flow/config.yml`, `.flows/` and `.agent-fleet/` no longer make a folder a project. For this repo: `project add "C:\Workspace_Tooling\agent-fleet"`.

The project is resolved, in order, from `-p/--project <name|alias|id>`, then `FLOW_PROJECT`, then the registered folder containing the current directory (deepest wins). There is no fallback: an unknown reference or an unregistered directory is an error that lists the registered projects and the `project add` command to run, and a run outside any registered project is refused (also `flow run <file>` from an unregistered folder).

- `-p/--project` exists on `flow run`, `flow versions` and `flow history` (a filter, applied only when `-p`/`FLOW_PROJECT` is given). `flow show`, `flow validate`, `flow logs` take none.
- Flows are read from `<project folder>/.flow/flows.yml` (+ `flows-custom.yml`); hooks and plugins from the project config in the registry (`<registry>/projects/<project id>/flow/config/config.yml`; registry = `$XDG_CONFIG_HOME/project`, else `~/.config/project`). Only `plugins` and `hooks` are allowed there (an unknown or daemon-only key is an error naming the file); `.flow/config.yml` left in the repository is an error giving the `mv` command that moves it.
- The daemon serves every project and re-reads the registry on each request. If the CLI and the daemon use different registries (different `XDG_CONFIG_HOME`), the run is refused with `PROJECT_REGISTRY_MISMATCH`.
- Workers: `flow worker --project <name|alias|id>` (repeatable) or `FLOW_WORKER_PROJECTS` attach to registered projects; a folder path is refused. See `packages/flow-cli/WORKERS.md`.
- Executions record `projectId`; `flow show <execution-id>` prints `Project: name (id)`.

## Starting the stack

```bash
# Full stack (web-backend embedding orchestrator)
npm run dev

# Worker (separate terminal)
npm run worker:flow
```
