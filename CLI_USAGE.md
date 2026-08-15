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

The worker reads flows from `.agent-fleet/flows.yml` in the project root.

## Starting the stack

```bash
# Full stack (web-backend embedding orchestrator)
npm run dev

# Worker (separate terminal)
npm run worker:flow
```
