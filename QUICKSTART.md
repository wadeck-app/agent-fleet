# Quick Start Guide

Get Agent Fleet up and running in 5 minutes!

## Prerequisites

- Node.js 20+ installed
- Claude Code CLI installed (`claude` command available)
- Git (optional, for version control)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Start the Orchestrator

Open a terminal and run:

```bash
npm run dev
```

You should see:

```
🚀 Agent Fleet Orchestrator is running!
📡 REST API:     http://localhost:3737
🔌 WebSocket:    ws://localhost:3738
```

## Step 3: Start a Dev Worker

Open a **second terminal** and run:

```bash
npm run worker:dev
```

You should see the worker connect to the orchestrator.

## Step 4: Create Your First Task

Open a **third terminal** and create a simple task:

```bash
npm run add-task create "Create a simple hello world function that returns 'Hello, World!'" medium
```

## Step 5: Watch the Magic!

Go back to the **orchestrator terminal**. You should see:

1. The task being created
2. The task being assigned to the Dev worker
3. The Dev worker starting Claude Code
4. Claude working on the task
5. The task being completed

## What's Next?

### View All Tasks

```bash
npm run add-task list
```

### Check System Stats

```bash
npm run add-task stats
```

### Run the Test Script

```bash
npm test
```

### Create More Tasks

```bash
# High priority bug fix
npm run add-task create "Fix authentication timeout issue" high

# Low priority enhancement
npm run add-task create "Add dark mode toggle" low

# Urgent security fix
npm run add-task create "Patch XSS vulnerability in user input" urgent
```

## Common Issues

### Worker can't find Claude

Make sure `claude` is in your PATH:

```bash
claude --version
```

If not installed, follow the [Claude Code installation guide](https://github.com/anthropics/claude-code).

### Port already in use

If ports 3737 or 3738 are already in use, you can change them by editing:
- `src/orchestrator/index.ts` (REST_PORT and WS_PORT constants)

### Worker disconnects immediately

Check the worker logs for errors. Common causes:
- WebSocket connection refused (orchestrator not running)
- Claude process crashes

## Architecture Overview

```
Terminal 1: Orchestrator (manages everything)
Terminal 2: Dev Worker (executes tasks with Claude)
Terminal 3: CLI (create tasks, check status)
```

## Next Steps

1. Read the full [README.md](./README.md) for architecture details
2. Explore the codebase in `src/`
3. Try implementing PM, PO, or Reviewer workers
4. Integrate with GitHub for PR automation
5. Build a web UI!

## Troubleshooting

Enable debug logs:

```bash
# In the orchestrator terminal
DEBUG=* npm run dev
```

Check data files:

```bash
# View all tasks
ls data/tasks/

# View a specific task
cat data/tasks/<task-id>.json
```

Happy coding! 🚀
