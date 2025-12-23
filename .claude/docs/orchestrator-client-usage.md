# OrchestratorClient Usage Guide

## Table of Contents

- [Quick Start](#quick-start)
- [Initialization](#initialization)
- [Request Methods](#request-methods)
- [Event Subscription](#event-subscription)
- [Error Handling](#error-handling)
- [Testing with Mocks](#testing-with-mocks)
- [Best Practices](#best-practices)

---

## Quick Start

### Installation

```bash
# orchestrator-adapters is already installed in web-backend dependencies
cd packages/web-backend
npm install  # installs orchestrator-adapters
```

### Basic Usage

```typescript
import { OrchestratorClientFactory } from 'orchestrator-adapters';

// Library mode (embedded orchestrator)
const orchestratorClient = await OrchestratorClientFactory.create(
  { mode: 'library' },
  orchestratorInstance
);

// Remote mode (connect to orchestrator-server)
const orchestratorClient = await OrchestratorClientFactory.create({
  mode: 'remote',
  url: 'http://localhost:3737',
  transportMode: 'auto',
});

await orchestratorClient.connect();

// Use the client
const task = await orchestratorClient.createTask('MyTask', { priority: 'high' });
console.log(`Created task: ${task.id}`);
```

---

## Initialization

### Library Mode

**When to use**: Development, small deployments, single-process architecture.

```typescript
import { OrchestratorClientFactory } from 'orchestrator-adapters';
import { Orchestrator } from 'orchestrator/core/index.js';

// Create and start orchestrator instance
const orchestrator = new Orchestrator({
	wsPort: 3738,
	restPort: 3737,
});

await orchestrator.start();

// Create library adapter
const orchestratorClient = await OrchestratorClientFactory.create({ mode: 'library' }, orchestrator);

await orchestratorClient.connect();
```

**Location in codebase**: `packages/web-backend/src/server.ts:41-72`

---

### Remote Mode

**When to use**: Production, distributed architecture, multiple backend instances.

```typescript
import { OrchestratorClientFactory } from 'orchestrator-adapters';

// Create remote adapter (connects to orchestrator-server)
const orchestratorClient = await OrchestratorClientFactory.create({
	mode: 'remote',
	url: 'http://localhost:3737', // orchestrator-server URL
	transportMode: 'auto', // auto-fallback: WebSocket → REST+SSE → Long-polling
});

await orchestratorClient.connect();
```

**Location in codebase**: `packages/web-backend/src/server.ts:73-93`

---

### Transport Modes (Remote Only)

```typescript
// Auto-fallback (recommended)
const client = await OrchestratorClientFactory.create({
  mode: 'remote',
  url: 'http://localhost:3737',
  transportMode: 'auto',  // Try WebSocket → REST+SSE → Long-polling
});

// Force WebSocket
const client = await OrchestratorClientFactory.create({
  mode: 'remote',
  url: 'http://localhost:3737',
  transportMode: 'websocket',  // Bidirectional, low latency
});

// Force REST + SSE
const client = await OrchestratorClientFactory.create({
  mode: 'remote',
  url: 'http://localhost:3737',
  transportMode: 'rest-sse',  // HTTP-based, unidirectional events
});

// Force REST + Long-polling
const client = await OrchestratorClientFactory.create({
  mode: 'remote',
  url: 'http://localhost:3737',
  transportMode: 'rest-longpolling',  // Maximum compatibility, higher latency
});
```

---

## Request Methods

### createTask

Create a new task in the orchestrator.

```typescript
const task = await orchestratorClient.createTask('ProcessInvoice', {
	invoiceId: '12345',
	priority: 'high',
	metadata: {
		customerId: '67890',
		amount: 1500.0,
	},
});

console.log(`Task created: ${task.id}, Status: ${task.status}`);
// Output: Task created: task-abc123, Status: pending
```

**Return Type**: `Promise<Task>`

**Location in codebase**: `packages/shared-common/src/types.ts:45-60`

---

### getTask

Retrieve a specific task by ID.

```typescript
const task = await orchestratorClient.getTask('task-abc123');

if (task) {
	console.log(`Task ${task.id}: ${task.status}`);
	console.log(`Assigned to: ${task.assignedTo?.workerId || 'unassigned'}`);
} else {
	console.log('Task not found');
}
```

**Return Type**: `Promise<Task | null>`

---

### getTasks

Retrieve tasks with optional filtering.

```typescript
// Get all tasks
const allTasks = await orchestratorClient.getTasks();
console.log(`Total tasks: ${allTasks.length}`);

// Get tasks by status
const pendingTasks = await orchestratorClient.getTasks({ status: 'pending' });
console.log(`Pending tasks: ${pendingTasks.length}`);

// Get tasks assigned to specific worker
const workerTasks = await orchestratorClient.getTasks({ workerId: 'worker-1' });
console.log(`Worker tasks: ${workerTasks.length}`);

// Get tasks by priority
const highPriorityTasks = await orchestratorClient.getTasks({ priority: 'high' });
console.log(`High priority tasks: ${highPriorityTasks.length}`);
```

**Return Type**: `Promise<Task[]>`

**Filters**:

- `status?: TaskStatus` - Filter by status ('pending', 'in_progress', 'completed', 'failed')
- `workerId?: string` - Filter by assigned worker
- `priority?: TaskPriority` - Filter by priority ('low', 'medium', 'high')

---

### getWorkers

Retrieve connected workers with optional filtering.

```typescript
// Get all workers
const allWorkers = await orchestratorClient.getWorkers();
console.log(`Total workers: ${allWorkers.length}`);

// Get workers by type
const pythonWorkers = await orchestratorClient.getWorkers({ type: 'python' });
console.log(`Python workers: ${pythonWorkers.length}`);

// Get busy workers
const busyWorkers = await orchestratorClient.getWorkers({ status: 'busy' });
console.log(`Busy workers: ${busyWorkers.length}`);

// Get idle workers
const idleWorkers = await orchestratorClient.getWorkers({ status: 'idle' });
console.log(`Available workers: ${idleWorkers.length}`);
```

**Return Type**: `Promise<WorkerInfo[]>`

**Filters**:

- `type?: string` - Filter by worker type
- `status?: 'busy' | 'idle'` - Filter by availability

---

### getStats

Retrieve orchestrator statistics.

```typescript
const stats = await orchestratorClient.getStats();

console.log(`Orchestrator uptime: ${stats.uptime}s`);
console.log(`Connected workers: ${stats.workers}`);
console.log(`Total tasks: ${stats.tasks.total}`);
console.log(`Pending tasks: ${stats.tasks.byStatus.pending || 0}`);
console.log(`Completed tasks: ${stats.tasks.byStatus.completed || 0}`);
```

**Return Type**: `Promise<OrchestratorStats>`

**Stats Structure**:

```typescript
interface OrchestratorStats {
	restPort: number;
	wsPort: number;
	uptime: number; // seconds
	workers: number;
	workersList: WorkerInfo[];
	tasks: {
		total: number;
		byStatus: Record<string, number>;
	};
}
```

---

### updateConfig

Update orchestrator configuration.

```typescript
await orchestratorClient.updateConfig({
	maxConcurrentTasks: 50,
	taskTimeout: 300000, // 5 minutes
});

console.log('Configuration updated');
```

**Return Type**: `Promise<void>`

---

### renameWorker

Rename a connected worker.

```typescript
await orchestratorClient.renameWorker('worker-1', 'Production Worker #1');

console.log('Worker renamed');
```

**Return Type**: `Promise<void>`

---

## Event Subscription

### Subscribing to Events

```typescript
// Subscribe to task created events
orchestratorClient.on('task.created', data => {
	console.log(`New task created: ${data.taskId}`);
	console.log(`Description: ${data.task.description}`);
});

// Subscribe to task updates
orchestratorClient.on('task.updated', data => {
	console.log(`Task ${data.taskId} updated: ${data.task.status}`);
});

// Subscribe to task completion
orchestratorClient.on('task.completed', data => {
	console.log(`Task ${data.taskId} completed`);
	console.log(`Result: ${JSON.stringify(data.result)}`);
});

// Subscribe to task failures
orchestratorClient.on('task.failed', data => {
	console.error(`Task ${data.taskId} failed: ${data.error}`);
});

// Subscribe to worker registration
orchestratorClient.on('worker.registered', data => {
	console.log(`Worker ${data.workerId} registered (${data.worker.type})`);
});

// Subscribe to worker disconnection
orchestratorClient.on('worker.disconnected', data => {
	console.warn(`Worker ${data.workerId} disconnected`);
});

// Subscribe to stats updates
orchestratorClient.on('orchestrator.stats', data => {
	console.log(`Orchestrator stats: ${data.stats.tasks.total} tasks, ${data.stats.workers} workers`);
});
```

### Unsubscribing from Events

```typescript
const handler = data => {
	console.log(`Task created: ${data.taskId}`);
};

// Subscribe
orchestratorClient.on('task.created', handler);

// Unsubscribe
orchestratorClient.off('task.created', handler);
```

### Event Types Reference

**Task Events**:

- `task.created` - New task created
- `task.updated` - Task state changed
- `task.assigned` - Task assigned to worker
- `task.completed` - Task finished successfully
- `task.failed` - Task execution failed

**Worker Events**:

- `worker.registered` - Worker connected
- `worker.disconnected` - Worker lost connection
- `worker.status` - Worker status changed (busy/idle)

**System Events**:

- `orchestrator.stats` - Statistics update
- `system.error` - System-level error
- `system.warning` - System warning

**Location in codebase**: `packages/shared-orch-backend/src/transport/O2BEventTypes.ts`

---

## Error Handling

### Request Errors

```typescript
try {
	const task = await orchestratorClient.createTask('MyTask', { priority: 'high' });
	console.log(`Task created: ${task.id}`);
} catch (error) {
	console.error('Failed to create task:', error.message);

	// Handle specific error codes
	if (error.code === 'NETWORK_ERROR') {
		console.error('Network connection failed. Check orchestrator-server is running.');
	} else if (error.code === 'VALIDATION_ERROR') {
		console.error('Invalid request parameters.');
	} else {
		console.error('Unexpected error:', error);
	}
}
```

### Connection Errors

```typescript
try {
	await orchestratorClient.connect();
	console.log('Connected to orchestrator');
} catch (error) {
	console.error('Connection failed:', error.message);

	// Retry logic
	console.log('Retrying in 5 seconds...');
	await new Promise(resolve => setTimeout(resolve, 5000));
	await orchestratorClient.connect();
}
```

### Transport Failures (Remote Mode)

Remote mode automatically handles transport failures with auto-fallback:

1. **WebSocket fails** → Automatically tries REST+SSE
2. **REST+SSE fails** → Automatically tries REST+Long-polling
3. **All transports fail** → Throws error

```typescript
// Auto-fallback is automatic when using transportMode: 'auto'
const client = await OrchestratorClientFactory.create({
	mode: 'remote',
	url: 'http://localhost:3737',
	transportMode: 'auto', // Handles failures automatically
});
```

**Location in codebase**: `packages/orchestrator-adapters/src/transport/TransportFactory.ts:25-69`

---

## Testing with Mocks

### Using MockOrchestratorClient

```typescript
import { MockOrchestratorClient } from 'orchestrator-adapters/__mocks__/MockOrchestratorClient';

describe('DashboardService', () => {
	let mockClient: MockOrchestratorClient;
	let dashboardService: DashboardService;

	beforeEach(() => {
		mockClient = new MockOrchestratorClient();
		dashboardService = new DashboardService(mockClient);
	});

	test('should fetch orchestrator stats', async () => {
		// Configure mock response
		mockClient.setMockResponse('getStats', {
			restPort: 3737,
			wsPort: 3738,
			uptime: 3600,
			workers: 5,
			workersList: [],
			tasks: {
				total: 10,
				byStatus: { pending: 3, in_progress: 2, completed: 5 },
			},
		});

		// Test
		const stats = await dashboardService.getOrchestratorStats();

		// Verify
		expect(stats.workers).toBe(5);
		expect(stats.tasks.total).toBe(10);
		expect(mockClient.callHistory).toHaveLength(1);
		expect(mockClient.callHistory[0].method).toBe('getStats');
	});

	test('should handle task creation', async () => {
		// Configure mock response
		mockClient.setMockResponse('createTask', {
			id: 'task-123',
			description: 'TestTask',
			status: 'pending',
			priority: 'medium',
			createdAt: new Date().toISOString(),
		});

		// Test
		const task = await dashboardService.createTask('TestTask', { priority: 'medium' });

		// Verify
		expect(task.id).toBe('task-123');
		expect(mockClient.callHistory).toHaveLength(1);
		expect(mockClient.callHistory[0].method).toBe('createTask');
		expect(mockClient.callHistory[0].args).toEqual(['TestTask', { priority: 'medium' }]);
	});
});
```

### Emitting Mock Events

```typescript
test('should handle task.created events', async () => {
	const mockClient = new MockOrchestratorClient();
	const dashboardService = new DashboardService(mockClient);

	const handler = vi.fn();
	dashboardService.onTaskCreated(handler);

	// Emit mock event
	mockClient.emitEvent('task.created', {
		taskId: 'task-123',
		task: {
			id: 'task-123',
			description: 'TestTask',
			status: 'pending',
			priority: 'medium',
			createdAt: new Date().toISOString(),
		},
		timestamp: new Date().toISOString(),
	});

	// Verify handler was called
	expect(handler).toHaveBeenCalledTimes(1);
	expect(handler).toHaveBeenCalledWith(
		expect.objectContaining({
			taskId: 'task-123',
		})
	);
});
```

**Location in codebase**: `packages/orchestrator-adapters/src/__mocks__/MockOrchestratorClient.ts`

---

## Best Practices

### 1. Use Auto-Fallback for Remote Mode

```typescript
// ✅ Good: Auto-fallback provides maximum reliability
const client = await OrchestratorClientFactory.create({
  mode: 'remote',
  url: 'http://localhost:3737',
  transportMode: 'auto',
});

// ❌ Avoid: Forcing specific transport reduces reliability
const client = await OrchestratorClientFactory.create({
  mode: 'remote',
  url: 'http://localhost:3737',
  transportMode: 'websocket',  // No fallback if WebSocket blocked
});
```

### 2. Handle Errors Gracefully

```typescript
// ✅ Good: Handle errors and provide fallbacks
try {
	const stats = await orchestratorClient.getStats();
	displayStats(stats);
} catch (error) {
	console.error('Failed to fetch stats:', error.message);
	displayCachedStats(); // Fallback to cached data
}

// ❌ Avoid: Unhandled errors crash the application
const stats = await orchestratorClient.getStats(); // No try-catch
displayStats(stats);
```

### 3. Unsubscribe from Events

```typescript
// ✅ Good: Unsubscribe when component unmounts
class DashboardController {
	private taskCreatedHandler = data => {
		/* ... */
	};

	constructor(private orchestratorClient: OrchestratorClient) {
		this.orchestratorClient.on('task.created', this.taskCreatedHandler);
	}

	cleanup() {
		this.orchestratorClient.off('task.created', this.taskCreatedHandler);
	}
}

// ❌ Avoid: Memory leaks from unremoved listeners
this.orchestratorClient.on('task.created', data => {
	/* ... */
});
// Never unsubscribed
```

### 4. Use Type-Safe Event Handlers

```typescript
// ✅ Good: TypeScript enforces correct event data structure
orchestratorClient.on('task.created', data => {
	console.log(data.taskId); // Type-safe: TypeScript knows structure
});

// ✅ Good: Generic ensures type safety
const handleTaskCreated = (data: O2BEventData<'task.created'>) => {
	console.log(data.taskId);
};
orchestratorClient.on('task.created', handleTaskCreated);
```

### 5. Initialize Once, Use Everywhere

```typescript
// ✅ Good: Initialize in server.ts, inject into factory
const orchestratorClient = await initializeOrchestratorClient();
const factory = new DataStoreFactory('memory', orchestratorClient);

// Services get client via factory
const dashboardService = factory.getDashboardService(); // Uses injected client

// ❌ Avoid: Creating multiple client instances
const client1 = await OrchestratorClientFactory.create({ mode: 'library' }, orch);
const client2 = await OrchestratorClientFactory.create({ mode: 'library' }, orch);
// Wastes resources, inconsistent state
```

**Location in codebase**: `packages/web-backend/src/server.ts:391-423`

---

## Next Steps

- See [Configuration Reference](./orchestrator-client-configuration.md) for environment variable details
- See [Architecture Overview](./backend-orchestrator-transport.md) for design details
- See [Migration Guide](./migration-guide-orchestrator-client.md) for transition steps
