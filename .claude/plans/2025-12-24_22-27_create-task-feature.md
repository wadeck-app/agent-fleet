# Plan: Create Task Feature (Frontend → Backend → Orchestrator)

**Timestamp**: 2025-12-24_22-27
**Status**: Ready for implementation

## Overview

Implement a complete task creation feature allowing users to:

- Click "Create Task" button on TasksPage
- Fill a form with task details (description, priority, worker assignment, optional flow)
- Submit to backend → orchestrator → assign to specified worker
- See real-time updates after creation

## User Requirements (Confirmed)

- **Form Fields**: Description (required), Priority (required), AssignedTo worker (required), FlowId (optional)
- **Initial Status**: Always BACKLOG
- **Assignment Strategy**: Assign to a specific worker selected by user

## Architecture Flow

```
Frontend (CreateTaskDialog)
    ↓ POST /api/tasks/
Backend (TasksController → TasksService)
    ↓ POST {orchestrator}/tasks
Orchestrator (RestAPI → TaskManager)
    ↓ createTask() + routing to worker queue
Worker receives task assignment
```

## Critical Discovery

**TaskManager.createTask() already supports pre-assignment!**

- Lines 105-108 in TaskManager.ts check if `task.assignedTo?.workerId` exists
- If present, routes task to worker-specific queue
- If absent, routes to global backlog

**But**: RestAPI.ts POST /tasks endpoint (lines 80-122) doesn't accept `assignedTo` in request body.

## Implementation Plan

### Phase 1: Orchestrator Enhancement

**File**: `packages/orchestrator/src/core/RestAPI.ts`

**Modify POST /tasks endpoint** (lines 80-122):

```typescript
this.app.post('/tasks', async (req: Request, res: Response) => {
	try {
		const { description, priority, metadata, flowId, flowInputs, workspacePath, assignedTo } = req.body;

		if (!description) {
			res.status(400).json({ error: 'Description is required' });
			return;
		}

		const task = await this.taskManager.createTask(description, {
			priority,
			...metadata,
		});

		// Add flow-specific fields if flowId is provided
		if (flowId) {
			task.flowId = flowId;
			task.flowInputs = flowInputs || {};
		}

		// Add workspace path if provided
		if (workspacePath) {
			task.workspacePath = workspacePath;
		}

		// ⭐ NEW: Add worker assignment if provided
		if (assignedTo?.workerId) {
			task.assignedTo = assignedTo;
		}

		// Update task in TaskManager's memory + storage
		if (flowId || workspacePath || assignedTo) {
			await this.taskManager.updateTask(task);
		}

		// Try to assign the task to an available worker
		// (This will route to specific worker queue if assignedTo is set)
		this.wsServer.tryAssignTasksToIdleWorkers();

		res.status(201).json(task);
	} catch (error) {
		logger.error('[API] Error creating task:', error);
		res.status(500).json({ error: (error as Error).message });
	}
});
```

### Phase 2: Shared Contracts

#### 2.1 Update Tasks Contract

**File**: `packages/shared-frontend-backend/src/api/tasks.contract.ts`

**Update CreateTaskSchema** (lines 88-94):

```typescript
export const CreateTaskSchema = z.object({
	description: z.string().min(1, 'Description is required'),
	priority: TaskPrioritySchema,
	assignedTo: z.object({
		workerId: z.string(),
	}),
	flowId: z.string().optional(),
	flowInputs: z.record(z.any()).optional(),
});
```

#### 2.2 Create Workers Contract

**New File**: `packages/shared-frontend-backend/src/api/workers.contract.ts`

```typescript
import { z } from 'zod';

import { defineRoutes } from '../shared/api-routes-config';

export const WorkerSchema = z.object({
	id: z.string(),
	taskId: z.string().nullable(),
	connectedAt: z.string(),
});

export type Worker = z.infer<typeof WorkerSchema>;

export const WORKERS_API_ROUTES = defineRoutes({
	'/api/workers/': {
		GET: {
			response: z.array(WorkerSchema),
		},
	},
});
```

#### 2.3 Create Flows Contract

**New File**: `packages/shared-frontend-backend/src/api/flows.contract.ts`

```typescript
import { z } from 'zod';

import { defineRoutes } from '../shared/api-routes-config';

export const FlowMetadataSchema = z.object({
	id: z.string(),
	version: z.string(),
	hash: z.string(),
	name: z.string(),
	description: z.string(),
});

export type FlowMetadata = z.infer<typeof FlowMetadataSchema>;

export const FlowsByProjectSchema = z.record(
	z.string(), // projectId
	z.record(z.string(), FlowMetadataSchema) // flowId -> metadata
);

export type FlowsByProject = z.infer<typeof FlowsByProjectSchema>;

export const FLOWS_API_ROUTES = defineRoutes({
	'/api/flows/': {
		GET: {
			response: FlowsByProjectSchema,
		},
	},
});
```

### Phase 3: Backend API

#### 3.1 Update TasksService

**File**: `packages/web-backend/src/services/TasksService.ts`

**Implement createTask()** (replace placeholder at lines 205-229):

```typescript
async createTask(data: CreateTask): Promise<Task> {
    try {
        // Validate input
        const errors: string[] = [];

        if (!data.description?.trim()) {
            errors.push('Description is required');
        }
        if (!data.priority) {
            errors.push('Priority is required');
        }
        if (!data.assignedTo?.workerId) {
            errors.push('Worker assignment is required');
        }

        if (errors.length > 0) {
            throw new Error(errors.join(', '));
        }

        // Send to orchestrator
        const orchestratorUrl = getOrchestratorRestUrl(
            this.orchestratorRepository.getHost() || 'localhost'
        );

        const response = await fetch(`${orchestratorUrl}/tasks`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                description: data.description,
                priority: data.priority,
                assignedTo: data.assignedTo,
                flowId: data.flowId,
                flowInputs: data.flowInputs,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`Orchestrator returned ${response.status}: ${errorText}`);
        }

        const createdTask = await response.json();
        const task = this.transformTasks([createdTask])[0];

        // Emit event for real-time updates
        this.eventBroadcaster.broadcast('b2f:task:created', task);

        return task;
    } catch (error) {
        console.error('[TasksService] Failed to create task:', error);
        throw error;
    }
}
```

**Update TasksController** (lines 31-38):

```typescript
add('POST', '/api/tasks/', async ({ body }) => {
	return this.service.createTask(body);
});
```

#### 3.2 Create WorkersService

**New File**: `packages/web-backend/src/services/WorkersService.ts`

```typescript
import type { Worker } from '@shared/api/workers.contract';

import { getOrchestratorRestUrl } from '../utils/orchestrator-url';
import type { OrchestratorRepository } from './OrchestratorRepository';

export class WorkersService {
	constructor(private readonly orchestratorRepository: OrchestratorRepository) {}

	async getWorkers(): Promise<Worker[]> {
		const orchestratorUrl = getOrchestratorRestUrl(this.orchestratorRepository.getHost() || 'localhost');

		const response = await fetch(`${orchestratorUrl}/workers`);

		if (!response.ok) {
			throw new Error(`Orchestrator returned ${response.status}`);
		}

		return response.json();
	}
}
```

#### 3.3 Create FlowsService

**New File**: `packages/web-backend/src/services/FlowsService.ts`

```typescript
import type { FlowsByProject } from '@shared/api/flows.contract';

import { getOrchestratorRestUrl } from '../utils/orchestrator-url';
import type { OrchestratorRepository } from './OrchestratorRepository';

export class FlowsService {
	constructor(private readonly orchestratorRepository: OrchestratorRepository) {}

	async getFlows(): Promise<FlowsByProject> {
		const orchestratorUrl = getOrchestratorRestUrl(this.orchestratorRepository.getHost() || 'localhost');

		const response = await fetch(`${orchestratorUrl}/flows`);

		if (!response.ok) {
			throw new Error(`Orchestrator returned ${response.status}`);
		}

		return response.json();
	}
}
```

#### 3.4 Create Controllers

**New File**: `packages/web-backend/src/controllers/WorkersController.ts`

```typescript
import { WORKERS_API_ROUTES, type Worker } from '@shared/api/workers.contract';

import type { WorkersService } from '../services/WorkersService';
import type { LazyController, RouteWrapperFunc } from '../types/controller';

export default class WorkersController implements LazyController<typeof WORKERS_API_ROUTES> {
	static routes = WORKERS_API_ROUTES;

	constructor(private readonly service: WorkersService) {}

	configureRoutes(add: RouteWrapperFunc<typeof WORKERS_API_ROUTES>) {
		add('GET', '/api/workers/', async (): Promise<Worker[]> => {
			return this.service.getWorkers();
		});
	}
}
```

**New File**: `packages/web-backend/src/controllers/FlowsController.ts`

```typescript
import { FLOWS_API_ROUTES, type FlowsByProject } from '@shared/api/flows.contract';

import type { FlowsService } from '../services/FlowsService';
import type { LazyController, RouteWrapperFunc } from '../types/controller';

export default class FlowsController implements LazyController<typeof FLOWS_API_ROUTES> {
	static routes = FLOWS_API_ROUTES;

	constructor(private readonly service: FlowsService) {}

	configureRoutes(add: RouteWrapperFunc<typeof FLOWS_API_ROUTES>) {
		add('GET', '/api/flows/', async (): Promise<FlowsByProject> => {
			return this.service.getFlows();
		});
	}
}
```

#### 3.5 Register Services and Controllers

**File**: `packages/web-backend/src/server.ts`

Add to dependency injection:

```typescript
// Controllers
import FlowsController from './controllers/FlowsController';
import WorkersController from './controllers/WorkersController';

// Services
const workersService = new WorkersService(orchestratorRepository);
const flowsService = new FlowsService(orchestratorRepository);

const workersController = new WorkersController(workersService);
const flowsController = new FlowsController(flowsService);

// Register routes
registerRoutes(fastify, workersController);
registerRoutes(fastify, flowsController);
```

### Phase 4: Frontend Implementation

#### 4.1 API Clients

**File**: `packages/web-frontend/src/app/pages/tasks/tasks.api.ts`

**Add method**:

```typescript
import type { CreateTask, Task } from '@shared/api/tasks.contract';

export const tasksApi = {
	getTasks: (query?: TasksQuery): Promise<TasksData> => {
		return typedFetch('GET', '/api/tasks/', { query: query || {} });
	},

	createTask: (body: CreateTask): Promise<Task> => {
		return typedFetch('POST', '/api/tasks/', { body });
	},
} as const;
```

**New File**: `packages/web-frontend/src/app/pages/workers/workers.api.ts`

```typescript
import { createTypedFetch } from '@framework/api/api-base';
import { WORKERS_API_ROUTES, type Worker } from '@shared/api/workers.contract';

const typedFetch = createTypedFetch(WORKERS_API_ROUTES);

export const workersApi = {
	getWorkers: (): Promise<Worker[]> => {
		return typedFetch('GET', '/api/workers/', {});
	},
} as const;
```

**New File**: `packages/web-frontend/src/app/pages/flows/flows.api.ts`

```typescript
import { createTypedFetch } from '@framework/api/api-base';
import { FLOWS_API_ROUTES, type FlowsByProject } from '@shared/api/flows.contract';

const typedFetch = createTypedFetch(FLOWS_API_ROUTES);

export const flowsApi = {
	getFlows: (): Promise<FlowsByProject> => {
		return typedFetch('GET', '/api/flows/', {});
	},
} as const;
```

#### 4.2 Services

**File**: `packages/web-frontend/src/app/pages/tasks/TasksService.ts`

**Add method**:

```typescript
async createTask(data: CreateTask): Promise<Task> {
    return tasksApi.createTask(data);
}
```

**New File**: `packages/web-frontend/src/app/pages/workers/WorkersService.ts`

```typescript
import type { Worker } from '@shared/api/workers.contract';

import { workersApi } from './workers.api';

export class WorkersService {
	async getWorkers(): Promise<Worker[]> {
		return workersApi.getWorkers();
	}
}

export const workersService = new WorkersService();
```

**New File**: `packages/web-frontend/src/app/pages/flows/FlowsService.ts`

```typescript
import type { FlowsByProject } from '@shared/api/flows.contract';

import { flowsApi } from './flows.api';

export class FlowsService {
	async getFlows(): Promise<FlowsByProject> {
		return flowsApi.getFlows();
	}
}

export const flowsService = new FlowsService();
```

#### 4.3 Hooks

**New File**: `packages/web-frontend/src/app/pages/workers/useWorkers.ts`

```typescript
import { useEffect, useState } from 'react';

import type { Worker } from '@shared/api/workers.contract';

import { workersService } from './WorkersService';

export function useWorkers() {
	const [workers, setWorkers] = useState<Worker[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchWorkers = async () => {
			try {
				setLoading(true);
				const data = await workersService.getWorkers();
				setWorkers(data);
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to fetch workers');
			} finally {
				setLoading(false);
			}
		};

		fetchWorkers();
	}, []);

	return { workers, loading, error };
}
```

**New File**: `packages/web-frontend/src/app/pages/flows/useFlows.ts`

```typescript
import { useEffect, useState } from 'react';

import type { FlowsByProject } from '@shared/api/flows.contract';

import { flowsService } from './FlowsService';

export function useFlows() {
	const [flows, setFlows] = useState<FlowsByProject>({});
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const fetchFlows = async () => {
			try {
				setLoading(true);
				const data = await flowsService.getFlows();
				setFlows(data);
				setError(null);
			} catch (err) {
				setError(err instanceof Error ? err.message : 'Failed to fetch flows');
			} finally {
				setLoading(false);
			}
		};

		fetchFlows();
	}, []);

	return { flows, loading, error };
}
```

#### 4.4 CreateTaskDialog Component

**New File**: `packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.tsx`

```typescript
import { CrudDialog } from '@framework/components/overlays/CrudDialog';
import { FormContainer } from '@framework/features/forms/FormContainer';
import { SelectField, type SelectOption } from '@framework/features/forms/fields/SelectField';
import { TextAreaField } from '@framework/features/forms/fields/TextAreaField';
import { useFormState } from '@framework/features/forms/useFormState';
import type { CreateTask } from '@shared/api/tasks.contract';
import { useFlows } from '../flows/useFlows';
import { useWorkers } from '../workers/useWorkers';
import { tasksService } from './TasksService';

interface CreateTaskDialogProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    onSuccess: () => void;
}

const defaultFormData: CreateTask = {
    description: '',
    priority: 'medium',
    assignedTo: { workerId: '' },
    flowId: undefined,
};

export function CreateTaskDialog({ open, onOpenChange, onSuccess }: CreateTaskDialogProps) {
    const { workers, loading: workersLoading } = useWorkers();
    const { flows, loading: flowsLoading } = useFlows();

    // Transform workers to SelectOption format
    const workerOptions: SelectOption[] = workers.map(w => ({
        value: w.id,
        label: `${w.id}${w.taskId ? ' (busy)' : ' (idle)'}`,
    }));

    // Transform flows to SelectOption format
    const flowOptions: SelectOption[] = Object.entries(flows).flatMap(([projectId, projectFlows]) =>
        Object.entries(projectFlows).map(([flowId, flowMeta]) => ({
            value: flowId,
            label: `${flowMeta.name} (${projectId})`,
        }))
    );

    const formState = useFormState<CreateTask>({
        defaultData: defaultFormData,
        validator: (data) => {
            const errors: Record<string, string> = {};

            if (!data.description?.trim()) {
                errors.description = 'Description is required';
            }

            if (!data.priority) {
                errors.priority = 'Priority is required';
            }

            if (!data.assignedTo?.workerId) {
                errors.assignedTo = 'Worker assignment is required';
            }

            return {
                valid: Object.keys(errors).length === 0,
                errors: Object.values(errors)
            };
        },
        errorFieldMapping: {
            'Description is required': 'description',
            'Priority is required': 'priority',
            'Worker assignment is required': 'assignedTo',
        },
        onSubmit: async (data) => {
            await tasksService.createTask(data);
            onSuccess();
            onOpenChange(false);
        },
    });

    return (
        <CrudDialog
            open={open}
            onOpenChange={onOpenChange}
            title="Create New Task"
            description="Fill in the details to create a new task"
            maxWidth="lg"
        >
            <FormContainer
                isSubmitting={formState.isSubmitting}
                onSubmit={formState.handleSubmit}
                onCancel={() => onOpenChange(false)}
                submitLabel="Create Task"
            >
                <div className="col-span-2">
                    <TextAreaField
                        label="Description"
                        value={formState.formData.description}
                        onChange={(value) => formState.updateField('description', value)}
                        placeholder="Enter task description..."
                        required
                        rows={4}
                        error={formState.validationErrors.description}
                    />
                </div>

                <SelectField
                    label="Priority"
                    value={formState.formData.priority}
                    onChange={(value) => formState.updateField('priority', value)}
                    options={[
                        { value: 'low', label: 'Low' },
                        { value: 'medium', label: 'Medium' },
                        { value: 'high', label: 'High' },
                        { value: 'urgent', label: 'Urgent' },
                    ]}
                    required
                    error={formState.validationErrors.priority}
                />

                <SelectField
                    label="Assign to Worker"
                    value={formState.formData.assignedTo.workerId}
                    onChange={(value) =>
                        formState.updateField('assignedTo', { workerId: value })
                    }
                    options={workerOptions}
                    placeholder="Select worker..."
                    required
                    disabled={workersLoading || workers.length === 0}
                    error={formState.validationErrors.assignedTo}
                />

                <div className="col-span-2">
                    <SelectField
                        label="Flow (Optional)"
                        value={formState.formData.flowId || ''}
                        onChange={(value) => formState.updateField('flowId', value || undefined)}
                        options={[
                            { value: '', label: 'None' },
                            ...flowOptions,
                        ]}
                        placeholder="Select flow..."
                        disabled={flowsLoading}
                    />
                </div>
            </FormContainer>
        </CrudDialog>
    );
}
```

#### 4.5 Update TasksPage

**File**: `packages/web-frontend/src/app/pages/tasks/TasksPage.tsx`

**Add imports** (after line 9):

```typescript
import { Plus } from 'lucide-react';

import { CreateTaskDialog } from './CreateTaskDialog';
```

**Add state** (after line 39):

```typescript
const [createDialogOpen, setCreateDialogOpen] = useState(false);
```

**Add handler** (after line 59):

```typescript
const handleTaskCreated = async () => {
	await refresh();
};
```

**Update PageHeader action** (replace lines 76-86):

```typescript
action={
    <div className="flex gap-2">
        <Button
            onClick={() => setCreateDialogOpen(true)}
            variant="default"
            size="sm"
        >
            <Plus className="mr-2 size-4" />
            Create Task
        </Button>
        <Button onClick={handleRefresh} disabled={isRefreshing} variant="outline" size="sm">
            <RefreshCw
                className={`
                    mr-2 size-4
                    ${isRefreshing ? 'animate-spin' : ''}
                `}
            />
            Refresh
        </Button>
    </div>
}
```

**Add dialog** (before closing </Page> tag):

```typescript
<CreateTaskDialog
    open={createDialogOpen}
    onOpenChange={setCreateDialogOpen}
    onSuccess={handleTaskCreated}
/>
```

### Phase 5: Testing Strategy

#### 5.1 Backend Tests

**New File**: `packages/web-backend/src/services/TasksService.test.ts`

Test scenarios:

- ✓ Creates task with valid data
- ✓ Validates required fields (description, priority, assignedTo)
- ✓ Calls orchestrator API correctly
- ✓ Emits `b2f:task:created` event after successful creation
- ✓ Handles orchestrator errors gracefully
- ✓ Transforms response correctly

**New File**: `packages/web-backend/src/controllers/TasksController.test.ts`

Test scenarios:

- ✓ POST /api/tasks/ returns 201 with created task
- ✓ POST /api/tasks/ returns 400 for invalid data
- ✓ POST /api/tasks/ returns 500 for orchestrator errors

#### 5.2 Frontend Tests

**New File**: `packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.test.tsx`

Test scenarios:

- ✓ Renders form fields correctly
- ✓ Validates required fields
- ✓ Fetches workers and flows on mount
- ✓ Submits form data correctly
- ✓ Shows error messages for validation failures
- ✓ Closes dialog on successful submission
- ✓ Disables submit during submission

#### 5.3 Orchestrator Tests

**New File**: `packages/orchestrator/src/core/RestAPI.test.ts` (or update existing)

Test scenarios:

- ✓ POST /tasks with assignedTo creates task assigned to specific worker
- ✓ POST /tasks without assignedTo creates task in global backlog
- ✓ POST /tasks with invalid assignedTo returns error

## Implementation Order

1. **Phase 1**: Orchestrator (RestAPI.ts - accept assignedTo)
2. **Phase 2**: Shared contracts (tasks, workers, flows)
3. **Phase 3.1-3.3**: Backend services (Workers, Flows, Tasks.createTask)
4. **Phase 3.4-3.5**: Backend controllers and registration
5. **Phase 4.1-4.2**: Frontend API clients and services
6. **Phase 4.3**: Frontend hooks (useWorkers, useFlows)
7. **Phase 4.4**: CreateTaskDialog component
8. **Phase 4.5**: Update TasksPage with button
9. **Phase 5**: Testing (unit → integration)

## Critical Files Summary

### To Modify:

- `packages/orchestrator/src/core/RestAPI.ts:80-122` - Accept assignedTo
- `packages/shared-frontend-backend/src/api/tasks.contract.ts:88-94` - Update CreateTaskSchema
- `packages/web-backend/src/services/TasksService.ts:205-229` - Implement createTask()
- `packages/web-backend/src/controllers/TasksController.ts:31-38` - Enable POST route
- `packages/web-backend/src/server.ts` - Register new services/controllers
- `packages/web-frontend/src/app/pages/tasks/tasks.api.ts` - Add createTask()
- `packages/web-frontend/src/app/pages/tasks/TasksService.ts` - Add createTask()
- `packages/web-frontend/src/app/pages/tasks/TasksPage.tsx:76-86` - Add button + dialog

### To Create:

- `packages/shared-frontend-backend/src/api/workers.contract.ts`
- `packages/shared-frontend-backend/src/api/flows.contract.ts`
- `packages/web-backend/src/services/WorkersService.ts`
- `packages/web-backend/src/services/FlowsService.ts`
- `packages/web-backend/src/controllers/WorkersController.ts`
- `packages/web-backend/src/controllers/FlowsController.ts`
- `packages/web-frontend/src/app/pages/workers/workers.api.ts`
- `packages/web-frontend/src/app/pages/workers/WorkersService.ts`
- `packages/web-frontend/src/app/pages/workers/useWorkers.ts`
- `packages/web-frontend/src/app/pages/flows/flows.api.ts`
- `packages/web-frontend/src/app/pages/flows/FlowsService.ts`
- `packages/web-frontend/src/app/pages/flows/useFlows.ts`
- `packages/web-frontend/src/app/pages/tasks/CreateTaskDialog.tsx`

## Notes

- Event system already configured for `b2f:task:created`
- Orchestrator GET /workers and GET /flows endpoints already exist
- TaskManager.createTask() already handles assignedTo routing (lines 105-108)
- All status validations happen in TaskManager
- Priority defaults to 'medium' if not provided

## Post-Implementation

After implementation, run:

```bash
npm run check      # Type checking across monorepo
npm run test       # Run all tests
```
