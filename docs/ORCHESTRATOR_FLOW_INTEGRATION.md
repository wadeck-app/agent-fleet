 Orchestrator + Flow Engine Integration Guide

Status: Phase  Complete 

This document explains how to use the integrated Orchestrator + Flow Engine system.

 Overview

The Flow Engine is now fully integrated with the Orchestrator, allowing you to:

- Define workflows as YAML flows
- Submit tasks that execute flows automatically
- Manage workspaces with full git integration
- Track execution with detailed traces

 Architecture

```

                      Orchestrator                           
        
    TaskManager      FlowRegistry     REST API       
        

                              
                              
                    
                       FlowWorker     
                        
                      FlowExecutor  
                        
                        
                      WorkspaceM.   
                        
                    
```

 Quick Start

 . Start the Orchestrator

```bash
npm run dev
```

This starts:

- TaskManager: Manages tasks and their lifecycle
- WebSocket Server: Port  for worker connections
- REST API: Port  for task creation and queries
- FlowRegistry: Loads flows from `.agent-fleet/flows.yaml`

 . Launch a FlowWorker

In a separate terminal:

```bash
npx tsx src/workers/flow-worker.ts
```

The FlowWorker:

- Connects to the orchestrator via WebSocket
- Loads available flows from FlowRegistry
- Waits for flow-based tasks to execute

 . Create a Flow-Based Task

Using the REST API:

```bash
curl -X POST http://localhost:/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Answer: What is the project structure?",
    "flowId": "simple-qa",
    "flowInputs": {
      "question": "What is the project structure and main components?"
    },
    "priority": "medium"
  }'
```

Response:

```json
{
  "id": "abc...",
  "description": "Answer: What is the project structure?",
  "status": "backlog",
  "priority": "medium",
  "flowId": "simple-qa",
  "flowInputs": {
    "question": "What is the project structure and main components?"
  },
  "createdAt": "--T...",
  ...
}
```

 . Monitor Task Execution

Get task status:

```bash
curl http://localhost:/tasks/abc
```

The task will go through these states:

. `backlog` - Created, waiting for worker
. `in_progress` - Worker executing the flow
. `review` - Flow completed successfully
. (or) `failed` - Flow execution failed

 . View Results

When completed, the task will have `flowResult`:

```json
{
  "id": "abc...",
  "status": "review",
  "flowResult": {
    "status": "completed",
    "outputs": {
      "answer": "The project has the following structure..."
    },
    "trace": {
      "id": "trace-xyz",
      "flowId": "simple-qa",
      "status": "completed",
      "steps": [
        {
          "stepId": "answer",
          "status": "completed",
          "outputs": { ... }
        }
      ]
    }
  }
}
```

 Available Flows

 List All Flows

```bash
curl http://localhost:/flows
```

 Get Flow Details

```bash
curl http://localhost:/flows/simple-qa
```

 Default Flows

. simple-qa - Simple question & answer
    - Input: `question` (string)
    - Output: Answer from codebase
    - Workspace: shared, main-only, always reuse

. dev-full - Full development cycle
    - Input: `taskDescription` (string)
    - Output: Implementation with tests
    - Workspace: isolated, feature-branch, never reuse

 Creating Custom Flows

Create `.agent-fleet/flows.yaml` in your project:

```yaml
my-custom-flow:
    name: My Custom Flow
    description: Does something amazing
    workspace:
        mode: isolated
        gitStrategy: feature-branch
        reusePolicy: never
    inputs:
        taskDescription: string
    steps:
        - type: script
          id: setup
          name: Setup environment
          script: npm install
          output:
              exitCode: { type: number }

        - type: model
          id: implement
          name: Implement feature
          model: sonnet
          prompt: |
              Implement: ${{ inputs.taskDescription }}
          next:
              default: test

        - type: script
          id: test
          name: Run tests
          script: npm test
          output:
              exitCode: { type: number }
```

 Task Type Fields

 flowId (optional)

The ID of the flow to execute. If not provided, the task is treated as a regular (non-flow) task.

 flowInputs (optional)

Input variables for the flow. Must match the flow's `inputs` definition.

 flowResult (populated after execution)

Contains:

- `status`: 'completed' or 'failed'
- `outputs`: Key-value pairs from flow execution
- `error`: Error message if failed
- `trace`: Detailed execution trace

 Workspace Management

FlowWorker automatically:

- Allocates workspace based on flow configuration
- Executes flow in the workspace
- Releases workspace after completion
- Cleans up isolated workspaces

Workspace modes:

- isolated: New workspace for each task (cleaned up after)
- shared: Reused workspace (never cleaned up)
- manual: User-provided directory path

Git strategies:

- main-only: Only use main branch
- feature-branch: Create feature branches (`fleet/task-{id}-{slug}`)
- any: Allow any branch
- worktree: Use git worktrees for isolation

 REST API Endpoints

 Tasks

- `POST /tasks` - Create task (with optional flowId, flowInputs)
- `GET /tasks` - List all tasks
- `GET /tasks/:id` - Get specific task
- `PATCH /tasks/:id/status` - Update task status
- `DELETE /tasks/:id` - Delete task
- `POST /tasks/:id/comments` - Add comment

 Flows

- `GET /flows` - List all flows
- `GET /flows/:id` - Get flow definition

 System

- `GET /health` - Health check
- `GET /stats` - System statistics
- `GET /workers` - List connected workers

 Testing the Integration

Run existing tests:

```bash
npm test
```

All  tests should pass, including:

- Flow Engine tests (output extraction, conditions, templates, etc.)
- Workspace Manager tests
- Flow Executor tests

 Example Usage Scenarios

 Scenario : Answer a Question

```bash
 Create task
TASK_ID=$(curl -s -X POST http://localhost:/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "description": "What are the main files?",
    "flowId": "simple-qa",
    "flowInputs": { "question": "What are the main source files?" }
  }' | jq -r '.id')

 Wait a few seconds for execution
sleep 

 Check result
curl http://localhost:/tasks/$TASK_ID | jq '.flowResult'
```

 Scenario : Full Development Task

```bash
curl -X POST http://localhost:/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Add validation to user input",
    "flowId": "dev-full",
    "flowInputs": {
      "taskDescription": "Add email validation to the user registration form"
    },
    "priority": "high"
  }'
```

 Troubleshooting

 FlowWorker not picking up tasks

- Check that FlowWorker is connected: `GET /workers`
- Verify task has `flowId` set
- Check orchestrator logs for errors

 Flow not found

- List available flows: `GET /flows`
- Check `.agent-fleet/flows.yaml` exists and is valid
- Restart orchestrator to reload flows

 Workspace allocation fails

- Check disk space
- Verify git is installed and accessible
- Check project root has `.git` directory

 Next Steps

Phase  will add:

- Enhanced UI showing flow execution progress
- Real-time step updates via WebSocket
- Workspace status visualization
- Detailed execution trace viewer

Phase  will add:

- CLI interface for easier task submission
- Interactive flow execution
- Flow templating and management

---

Questions? Check the main [PROJECT_STATUS.md](PROJECT_STATUS.md) for full system documentation.
