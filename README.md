# Agent Fleet 🚀

Multi-agent orchestration system for autonomous software development using Claude Code.

## Architecture

```
┌─────────────────┐
│  Entry Point    │  CLI/API for creating tasks
│  (User Input)   │
└────────┬────────┘
         │
         v
┌─────────────────┐
│ Orchestrator    │  ← REST API (port 3737)
│ - Task Queue    │  ← WebSocket Server (port 3738)
│ - Worker Pool   │  ← Task Management (JSON files)
└────────┬────────┘
         │
         ├─────────────────┬──────────────┬──────────────┐
         v                 v              v              v
    ┌────────┐      ┌──────────┐   ┌──────────┐   ┌──────────┐
    │   PM   │      │    PO    │   │   Dev    │   │ Reviewer │
    │Worker  │      │ Worker   │   │ Worker   │   │  Worker  │
    └───┬────┘      └────┬─────┘   └────┬─────┘   └────┬─────┘
        │                │              │              │
        v                v              v              v
    ┌────────────────────────────────────────────────────────┐
    │              Claude Code (non-interactive)             │
    │              with socket-enabled hooks                 │
    └────────────────────────────────────────────────────────┘
```

## Features

- **REST API** for task management and system monitoring
- **WebSocket** for real-time worker communication
- **Task Queue** with priority and status management
- **Worker Types**: PM (refinement), PO (prioritization), Dev (implementation), Reviewer
- **File-based Storage** (easily upgradeable to database)
- **TypeScript** for type safety

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Start the Orchestrator

```bash
npm run dev
```

This will start:

- REST API on `http://localhost:3737`
- WebSocket server on `ws://localhost:3738`

### 3. Start a Flow Worker (in another terminal)

```bash
npm run worker:flow
```

### 4. Create a Task

```bash
# Create a task
npm run add-task create "Add user authentication" high

# List all tasks
npm run add-task list

# View stats
npm run add-task stats
```

### 5. Run Test

```bash
npm test
```

## Project Structure

```
agent-fleet/
├── src/
│   ├── orchestrator/
│   │   ├── index.ts              # Main entry point
│   │   ├── task-manager.ts       # Task management logic
│   │   ├── websocket-server.ts   # WebSocket server for workers
│   │   └── rest-api.ts           # REST API with Express
│   ├── workers/
│   │   ├── base/
│   │   │   └── BaseWorker.ts     # Base worker class
│   │   └── flow/
│   │       └── FlowWorker.ts     # Flow-based worker
│   ├── shared/
│   │   ├── types.ts              # Shared TypeScript types
│   │   ├── protocol.ts           # Message protocol
│   │   └── storage.ts            # Storage abstraction layer
│   └── cli/
│       └── entry-point.ts        # CLI for task creation
├── data/
│   ├── tasks/                    # Task JSON files
│   ├── contexts/                 # Task context directories
│   └── knowledge/                # Knowledge base (JSONL)
├── test/
│   └── simple-task.ts            # Simple test script
├── package.json
├── tsconfig.json
└── README.md
```

## API Reference

### REST API Endpoints

#### `GET /health`

Health check endpoint.

#### `GET /stats`

Get system statistics including worker count, task counts, etc.

#### `POST /tasks`

Create a new task.

**Body:**

```json
{
	"description": "Task description",
	"priority": "low|medium|high|urgent",
	"metadata": {}
}
```

#### `GET /tasks`

List all tasks. Optional query param: `?status=backlog`

#### `GET /tasks/:id`

Get a specific task by ID.

#### `PATCH /tasks/:id/status`

Update task status.

**Body:**

```json
{
	"status": "backlog|refining|todo|in_progress|review|..."
}
```

#### `POST /tasks/:id/comments`

Add a comment to a task.

**Body:**

```json
{
	"author": "user",
	"content": "Comment text"
}
```

#### `GET /workers`

List all connected workers.

### WebSocket Protocol

Workers connect to `ws://localhost:3738` and exchange JSON messages.

**Message Types:**

- `WORKER_READY` - Worker announces it's ready
- `ASSIGN_TASK` - Orchestrator assigns a task
- `TASK_STARTED` - Worker started working on task
- `TASK_PROGRESS` - Worker reports progress
- `TASK_COMPLETED` - Worker completed task
- `TASK_FAILED` - Worker failed task
- `TASK_QUESTION` - Worker has a question (blocks task)
- `STOP_REQUESTED` - Claude requests stop (via hook)
- `KILL_CLAUDE` - Orchestrator tells worker to kill Claude
- `HOOK_EVENT` - Worker reports hook event

## Task Statuses

Tasks flow through these statuses:

1. **backlog** - Initial state
2. **refining** - PM is refining the task
3. **refined** - Ready for prioritization
4. **prioritizing** - PO is prioritizing
5. **todo** - Ready for development
6. **in_progress** - Dev is working on it
7. **testing** - Running tests
8. **review** - Ready for review
9. **reviewing** - Reviewer is reviewing
10. **changes_requested** - Needs changes
11. **approved** - Approved for merge
12. **merged** - Completed
13. **blocked** - Blocked (question, dependency, error)
14. **cancelled** - Cancelled

## Worker Types

### Flow Worker

Executes flows defined in `.agent-fleet/flows.yaml`. Each flow consists of multiple steps orchestrated through a DAG execution engine. Uses Claude Code to perform autonomous development tasks with workspace management.

## Development

### Build

```bash
npm run build
```

### Run in Dev Mode

```bash
npm run dev
```

### Add a Task via CLI

```bash
npm run add-task create "Description" [priority]
```

### Run a Worker

```bash
# Flow worker
npm run worker:flow

# Flow worker with interactive mode
npm run worker:flow:i
```

## Environment Variables

Workers receive these environment variables:

- `CLAUDE_WORKER_ID` - Unique worker ID
- `CLAUDE_WORKER_SOCKET` - WebSocket URL to orchestrator
- `CLAUDE_TASK_ID` - Current task ID
- `CLAUDE_CONTEXT_DIR` - Directory for task context files

## Hooks Integration

Claude Code hooks (`.claude/scripts/`) can communicate with the orchestrator via the worker process using environment variables.

Example: `Stop.js` can send a `STOP_REQUESTED` message to the orchestrator when Claude is done.

## Roadmap

### Phase 1: MVP ✅

- [x] Orchestrator with REST API
- [x] WebSocket server for workers
- [x] Task management (JSON files)
- [x] Dev worker (basic)
- [x] CLI for task creation
- [ ] Stop hook integration

### Phase 2: Multi-Agent System

- [ ] PM worker (task refinement)
- [ ] PO worker (prioritization)
- [ ] Reviewer worker (code review)
- [ ] Git worktree automation
- [ ] GitHub PR creation

### Phase 3: Intelligence

- [ ] Knowledge base integration
- [ ] Context management
- [ ] Dependency detection
- [ ] Retry logic & error handling

### Phase 4: UI

- [ ] Web dashboard
- [ ] Real-time task visualization
- [ ] Branch preview
- [ ] User inbox for questions

## Contributing

This is an experimental project. Feel free to explore and extend!

## License

MIT
