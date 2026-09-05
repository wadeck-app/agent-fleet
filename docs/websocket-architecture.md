# WebSocket Architecture

**Last Updated:** 2026-01-22
**Status:** Production-ready

## Table of Contents

- [Overview](#overview)
- [Architecture Layers](#architecture-layers)
- [Worker WebSocket System (W2O/O2W)](#worker-websocket-system-w2oo2w)
- [Frontend WebSocket System (B2F)](#frontend-websocket-system-b2f)
- [Event Flow Diagrams](#event-flow-diagrams)
- [Message Types](#message-types)
- [Usage Examples](#usage-examples)
- [Best Practices](#best-practices)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## Overview

Agent Fleet uses **two distinct WebSocket systems** for different purposes:

1. **Worker WebSocket (W2O/O2W)**: Communication between Orchestrator and Worker nodes
2. **Frontend WebSocket (B2F)**: Communication between Backend and Frontend clients

These systems are independent, use different message structures, and serve different architectural needs.

```
┌──────────┐                   ┌─────────────┐                   ┌──────────┐
│  Worker  │ ◄──W2O/O2W────► │ Orchestrator │                   │ Frontend │
│  Nodes   │   (Port 3738)    │              │                   │  Client  │
└──────────┘                   └──────┬───────┘                   └─────┬────┘
                                      │                                 │
                                      │          ┌────────────┐         │
                                      └────────► │  Backend   │ ◄───────┘
                                                 │ (Fastify)  │
                                                 └─────┬──────┘
                                                       │
                                                       B2F Events
                                                  (Multi-transport)
```

---

## Architecture Layers

### Layer 1: Worker ↔ Orchestrator (W2O/O2W)

**Purpose**: Task distribution and execution coordination
**Protocol**: Custom binary-safe protocol with typed messages
**Transport**: WebSocket only (single, reliable connection)
**Port**: 3738 (configurable)

**Key Components:**

- `WorkerWebSocketServer` - Server-side WebSocket handler
- `WebSocketConnectionManager` - Manages worker connections
- `WebSocketMessageRouter` - Routes messages to handlers
- `WorkerCoordinator` - Coordinates task assignment

### Layer 2: Backend ↔ Frontend (B2F)

**Purpose**: Real-time state updates to web UI
**Protocol**: JSON-based event system with type-safe events
**Transport**: Multi-transport (WebSocket, SSE, Long Polling, HTTP)
**Endpoint**: `/api/transports/ws` (WebSocket endpoint)

**Key Components:**

- `EventBroadcaster` - Multi-transport event broadcasting
- `WebSocketTransportServer` - WebSocket transport implementation
- `TransportSessionManager` - Authentication and session management
- `OrchestratorEventBridge` - Bridges orchestrator events to B2F

---

## Worker WebSocket System (W2O/O2W)

### Overview

Worker WebSocket enables bidirectional communication between worker nodes and the orchestrator for task distribution and execution.

### Message Prefixes

- **W2O (Worker-to-Orchestrator)**: Messages from workers to orchestrator
- **O2W (Orchestrator-to-Worker)**: Messages from orchestrator to workers

### Message Types

#### Worker-to-Orchestrator (W2O)

```typescript
w2o: worker_ready; // Worker announces availability
w2o: request_task; // Worker requests next task
w2o: task_started; // Task execution started
w2o: task_completed; // Task completed successfully
w2o: task_failed; // Task execution failed
w2o: flows_updated; // Worker's available flows changed
w2o: intervention_request; // Worker needs human intervention
```

#### Orchestrator-to-Worker (O2W)

```typescript
o2w: worker_welcome; // Welcome message with assigned ID
o2w: task_assigned; // Task assigned to worker
o2w: task_cancelled; // Cancel running task
o2w: intervention_response; // Response to intervention request
o2w: error; // Error notification
```

### Connection Flow

```
┌─────────┐                           ┌──────────────┐
│ Worker  │                           │ Orchestrator │
└────┬────┘                           └──────┬───────┘
     │                                       │
     │  1. Connect to ws://localhost:3738   │
     │  ─────────────────────────────────>  │
     │                                       │
     │  2. Send w2o:worker_ready            │
     │  {preferredId, projectId, flows}     │
     │  ─────────────────────────────────>  │
     │                                       │
     │  3. Receive o2w:worker_welcome       │
     │  {workerId}                           │
     │  <─────────────────────────────────  │
     │                                       │
     │  4. Request or receive tasks         │
     │  ◄───────────────────────────────►  │
     │                                       │
     │  5. Execute and report results       │
     │  ◄───────────────────────────────►  │
     │                                       │
```

### Message Structure

All messages follow this structure:

```typescript
interface ProtocolMessage<T extends string> {
	type: T;
	timestamp: string; // ISO 8601
	// Message-specific fields...
}
```

### Serialization

```typescript
import { parseMessage, serializeMessage } from 'shared-common/protocol';

// Sending
const message = createW2OMessage('w2o:task_completed', {
	taskId: 'task-123',
	result: { success: true },
});
socket.send(serializeMessage(message));

// Receiving
socket.on('message', data => {
	const message = parseMessage<O2WMessage>(data.toString());
	// Handle message based on type
});
```

### Worker Registration Example

```typescript
// Worker side
const message = createW2OMessage('w2o:worker_ready', {
	preferredId: 'worker-dev-1',
	projectId: 'my-project',
	workspacePath: '/path/to/workspace',
	availableFlows: [
		{ id: 'build-flow', version: '1.0.0' /* ...metadata */ },
		{ id: 'test-flow', version: '1.0.0' /* ...metadata */ },
	],
	gitBranch: 'main',
});
```

---

## Frontend WebSocket System (B2F)

### Overview

Frontend WebSocket provides real-time updates to web UI clients using a multi-transport event broadcasting system.

### Event Prefixes

All frontend events use the `b2f:` prefix (Backend-to-Frontend):

```typescript
b2f: task: created; // New task created
b2f: task: updated; // Task updated
b2f: worker: connected; // Worker connected
b2f: workspace: created; // Workspace created
// ... 40+ event types
```

### Multi-Transport Support

The B2F system supports multiple transports for maximum compatibility:

1. **WebSocket** - Bidirectional, low-latency (primary)
2. **Server-Sent Events (SSE)** - Server-to-client streaming
3. **Long Polling** - Legacy fallback
4. **HTTP Polling** - Maximum compatibility fallback

```typescript
// All transports share the same event API
eventBroadcaster.broadcast('b2f:task:created', taskData);
// → Automatically sent via all active transports
```

### Connection Flow

```
┌──────────┐                      ┌─────────┐
│ Frontend │                      │ Backend │
└────┬─────┘                      └────┬────┘
     │                                 │
     │  1. HTTP: Login & get cookies  │
     │  POST /api/auth/login           │
     │  ─────────────────────────────► │
     │  ◄───────── access_token ────── │
     │                                 │
     │  2. WebSocket: Connect          │
     │  GET /api/transports/ws         │
     │  (with cookies)                 │
     │  ─────────────────────────────► │
     │                                 │
     │  3. Receive 'connected'         │
     │  {userId, tokenExpiresAt}       │
     │  ◄───────────────────────────── │
     │                                 │
     │  4. Subscribe to events         │
     │  {type: 'subscription',         │
     │   action: 'subscribe',          │
     │   events: ['b2f:task:created']} │
     │  ─────────────────────────────► │
     │                                 │
     │  5. Receive real-time events    │
     │  ◄═══════════════════════════► │
     │                                 │
```

### Subscription Management

Frontend clients subscribe to specific events:

```typescript
// Frontend: Subscribe to events
const transport = useTransport();

transport.subscribe('b2f:task:created', task => {
	console.log('New task:', task);
});

transport.subscribe(
	'b2f:task:updated',
	task => {
		console.log('Task updated:', task);
	},
	{
		// Optional filters
		filters: { taskId: 'specific-task-123' },
	}
);
```

### Server-Side Event Broadcasting

```typescript
// Backend: Broadcast events
import { B2F_TASK_CREATED } from '@app/shared/transport';

class TasksService {
	async createTask(data: CreateTaskDto): Promise<Task> {
		const task = await this.repository.createTask(data);

		// Broadcast to all subscribed clients
		this.eventBroadcaster.broadcast(B2F_TASK_CREATED, task);

		return task;
	}
}
```

### Event Structure

```typescript
interface TransportEvent<E extends EventType> {
	id: string; // Unique event ID
	type: E; // Event type (e.g., 'b2f:task:created')
	data: EventData<E>; // Type-safe event data
	timestamp: number; // Unix timestamp (ms)
}
```

### Orchestrator Event Bridge

The `OrchestratorEventBridge` translates orchestrator events to B2F events:

```
┌─────────────┐       ┌───────────────────────┐       ┌─────────────────┐
│ Orchestrator│       │ OrchestratorEvent     │       │ EventBroadcaster│
│ (O2B events)│ ───► │ Bridge                │ ───► │ (B2F events)    │
└─────────────┘       │ - worker.connected    │       └────────┬────────┘
                      │ - worker.disconnected │                │
                      │ - task.updated        │                ▼
                      └───────────────────────┘       ┌─────────────────┐
                                                       │ All Transports  │
                                                       │ (WS/SSE/Poll)   │
                                                       └─────────────────┘
```

---

## Event Flow Diagrams

### Task Creation Flow

```
┌─────────┐    ┌─────────┐    ┌──────────────┐    ┌────────────────┐    ┌──────────┐
│Frontend │    │ Backend │    │ Orchestrator │    │ Worker         │    │ Frontend │
│ (User)  │    │ Service │    │              │    │                │    │ (Others) │
└────┬────┘    └────┬────┘    └──────┬───────┘    └───────┬────────┘    └────┬─────┘
     │              │                │                     │                   │
     │  POST /api/tasks            │                     │                   │
     │  ─────────────────►          │                     │                   │
     │              │                │                     │                   │
     │              │  createTask()  │                     │                   │
     │              │  ─────────────────────►              │                   │
     │              │                │                     │                   │
     │              │                │  o2w:task_assigned  │                   │
     │              │                │  ──────────────────────►                │
     │              │                │                     │                   │
     │              │  broadcast     │                     │                   │
     │              │  b2f:task:created                    │                   │
     │              │  ═══════════════════════════════════════════════════════►│
     │              │                │                     │                   │
     │  201 Created │                │                     │                   │
     │  ◄─────────────────          │                     │                   │
     │              │                │                     │                   │
```

### Worker Connection Flow

```
┌────────┐    ┌──────────────┐    ┌─────────┐    ┌──────────┐
│ Worker │    │ Orchestrator │    │ Backend │    │ Frontend │
└───┬────┘    └──────┬───────┘    └────┬────┘    └────┬─────┘
    │                │                  │              │
    │  w2o:worker_ready                │              │
    │  ───────────────►                │              │
    │                │                  │              │
    │                │  O2B: worker.connected         │
    │                │  ────────────────►              │
    │                │                  │              │
    │                │                  │  b2f:worker:connected
    │                │                  │  ═══════════════════►│
    │                │                  │              │
    │  o2w:worker_welcome              │              │
    │  ◄───────────────                │              │
    │                │                  │              │
```

---

## Message Types

### W2O/O2W Message Types Reference

See `packages/shared-orch-worker/worker-messages.ts` and `orchestrator-messages.ts` for complete type definitions.

### B2F Event Types Reference

See `packages/shared-frontend-backend/src/transport/B2FEventConstants.ts` for all 40+ event types.

**Categories:**

- Task events: `b2f:task:*` (created, updated, deleted, status_changed, etc.)
- Worker events: `b2f:worker:*` (connected, disconnected, status_changed, etc.)
- Workspace events: `b2f:workspace:*` (created, updated, deleted, etc.)
- Project events: `b2f:project:*` (created, updated, board_updated, etc.)
- Intervention events: `b2f:intervention:*` (created, answered, timeout, etc.)

---

## Usage Examples

### Example 1: Worker Sending Task Completion

```typescript
// packages/worker/src/flow/FlowWorker.ts
import { serializeMessage } from 'shared-common/protocol';
import { createW2OMessage } from 'shared-orch-worker/worker-messages';

class FlowWorker {
	private async executeTask(task: Task) {
		try {
			const result = await this.runFlow(task);

			// Send completion message
			const message = createW2OMessage('w2o:task_completed', {
				workerId: this.workerId,
				taskId: task.id,
				result: result.outputs,
				trace: result.trace,
			});

			this.socket.send(serializeMessage(message));
		} catch (error) {
			// Send failure message
			const message = createW2OMessage('w2o:task_failed', {
				workerId: this.workerId,
				taskId: task.id,
				error: error.message,
			});

			this.socket.send(serializeMessage(message));
		}
	}
}
```

### Example 2: Frontend Real-time Updates

```typescript
// packages/web-frontend/src/hooks/useRealtimeRefresh.ts
import { useEffect } from 'react';
import { useTransport } from '../transport/useTransport';
import { B2F_TASK_UPDATED } from '@app/shared/transport';

export function useRealtimeTaskUpdates(taskId: string, onUpdate: (task: Task) => void) {
  const transport = useTransport();

  useEffect(() => {
    // Subscribe with taskId filter
    const unsubscribe = transport.subscribe(
      B2F_TASK_UPDATED,
      onUpdate,
      { filters: { taskId } }
    );

    return () => {
      unsubscribe();
    };
  }, [taskId, onUpdate, transport]);
}

// Usage in component
function TaskDetailPage({ taskId }: { taskId: string }) {
  const [task, setTask] = useState<Task>();

  // Auto-refresh when task updates
  useRealtimeTaskUpdates(taskId, (updatedTask) => {
    setTask(updatedTask);
  });

  return <div>Task: {task?.name}</div>;
}
```

### Example 3: Backend Broadcasting Events

```typescript
// packages/web-backend/src/services/TasksService.ts
import { B2F_TASK_CREATED, B2F_TASK_UPDATED } from '@app/shared/transport';

export class TasksService {
	constructor(
		private eventBroadcaster: EventBroadcaster,
		private orchestratorClient: OrchestratorClient
	) {}

	async createTask(data: CreateTaskDto): Promise<Task> {
		// Create task via orchestrator
		const task = await this.orchestratorClient.createTask(data);

		// Broadcast to frontend
		this.eventBroadcaster.broadcast(B2F_TASK_CREATED, task);

		return task;
	}

	async updateTask(id: string, data: UpdateTaskDto): Promise<Task> {
		const task = await this.orchestratorClient.updateTask(id, data);

		// Broadcast update to all subscribed clients
		this.eventBroadcaster.broadcast(B2F_TASK_UPDATED, task);

		return task;
	}
}
```

---

## Best Practices

### Worker WebSocket (W2O/O2W)

1. **Always use factory functions** for message creation:

    ```typescript
    //  Good
    const msg = createW2OMessage('w2o:task_completed', { ... });

    //  Bad - no type safety
    const msg = { type: 'w2o:task_completed', ... };
    ```

2. **Handle connection loss gracefully**:

    ```typescript
    socket.on('close', () => {
    	log.warn('Connection lost, attempting reconnect...');
    	setTimeout(() => this.connect(), 5000);
    });
    ```

3. **Validate messages before processing**:
    ```typescript
    try {
    	const message = parseMessage<W2OMessage>(data.toString());
    	// Process message
    } catch (error) {
    	log.error('Invalid message format:', error);
    }
    ```

### Frontend WebSocket (B2F)

1. **Subscribe early, unsubscribe on cleanup**:

    ```typescript
    useEffect(() => {
    	const unsub = transport.subscribe(EVENT, handler);
    	return () => unsub(); // Cleanup on unmount
    }, []);
    ```

2. **Use filters to reduce unnecessary updates**:

    ```typescript
    // Only receive updates for specific task
    transport.subscribe('b2f:task:updated', handler, {
    	filters: { taskId: 'task-123' },
    });
    ```

3. **Handle disconnections with reconnect logic**:

    ```typescript
    transport.on('disconnected', () => {
    	// TransportManager handles auto-reconnect
    	// Show UI indicator to user
    	showNotification('Connection lost, reconnecting...');
    });
    ```

4. **Batch subscriptions when possible**:

    ```typescript
    //  Good - single call
    transport.batchSubscribe([
      'b2f:task:created',
      'b2f:task:updated',
      'b2f:task:deleted'
    ]);

    //  Less efficient - multiple calls
    transport.subscribe('b2f:task:created', ...);
    transport.subscribe('b2f:task:updated', ...);
    transport.subscribe('b2f:task:deleted', ...);
    ```

---

## Security

### Worker WebSocket

- **No authentication** - Workers are trusted internal nodes
- **Private network** - Should not be exposed to public internet
- **Port security** - Use firewall rules to restrict access to port 3738

### Frontend WebSocket

- **Cookie-based authentication** - HTTP_ONLY cookies prevent XSS attacks
- **Token validation** - Every connection authenticated via AuthService
- **Session expiration** - Automatic cleanup of expired sessions
- **CORS protection** - Fastify CORS plugin with whitelist
- **Rate limiting** - Applied at HTTP layer (future: WebSocket-specific)

### Security Checklist

- [ ] Worker WebSocket port (3738) not exposed to internet
- [ ] Frontend WebSocket requires valid authentication
- [ ] Tokens expire and are refreshed properly
- [ ] Sessions cleaned up on disconnection
- [ ] CORS configured with allowed origins only
- [ ] Error messages don't leak sensitive information

---

## Troubleshooting

### Worker Won't Connect

1. **Check WebSocket server is running**:

    ```bash
    netstat -an | grep 3738
    ```

2. **Verify worker configuration**:

    ```typescript
    // Worker should connect to correct host:port
    const ws = new WebSocket('ws://localhost:3738');
    ```

3. **Check logs for connection errors**:

    ```bash
    # Orchestrator logs
    grep "WorkerWebSocketServer" logs/orchestrator.log

    # Worker logs
    grep "WebSocket" logs/worker.log
    ```

### Frontend Not Receiving Events

1. **Verify authentication**:
    - Check cookies are being sent
    - Verify token hasn't expired
    - Check session exists: `GET /api/transports/status`

2. **Check subscription**:

    ```typescript
    // Ensure you're subscribed to the event
    transport.getSubscriptions(); // Should include the event
    ```

3. **Verify event is being broadcast**:

    ```typescript
    // Backend logs should show:
    log.info(`Broadcasting event "${event}" to ${count} clients`);
    ```

4. **Check filters**:
    ```typescript
    // If using filters, ensure they match the event data
    transport.subscribe('b2f:task:updated', handler, {
    	filters: { taskId: 'task-123' }, // Must match task.id
    });
    ```

### Message Parsing Errors

```typescript
// W2O/O2W: Use parseMessage for better errors
try {
	const message = parseMessage<W2OMessage>(data.toString());
} catch (error) {
	log.error('Parse error:', error.message);
	// Error will indicate which field is missing
}

// B2F: Check event structure
try {
	const event = JSON.parse(data.toString());
	if (!event.type || !event.timestamp) {
		throw new Error('Invalid event structure');
	}
} catch (error) {
	log.error('Invalid B2F event:', error);
}
```

---

## Performance Considerations

### Worker WebSocket

- **Keep messages small** - Serialize only necessary data
- **Batch updates** - Combine multiple small updates when possible
- **Use binary for large payloads** - Consider msgpack for large data

### Frontend WebSocket

- **Server-side filtering** - Use filters to reduce client bandwidth
- **Subscription management** - Unsubscribe from unused events
- **Debounce rapid updates** - Use frontend debouncing for high-frequency events
- **Transport fallback** - HTTP polling is least efficient, WebSocket is best

### Monitoring

Key metrics to track:

- **Worker connections**: Number of active workers
- **Frontend sessions**: Active sessions per transport type
- **Message throughput**: Messages/second per connection
- **Event broadcast time**: Time to deliver to all clients
- **Subscription count**: Average subscriptions per client

---

## Future Improvements

### Potential Enhancements

1. **Message compression** - gzip or brotli for large messages
2. **Binary protocol** - Use msgpack or protobuf instead of JSON
3. **Message prioritization** - Priority queue for critical messages
4. **Load balancing** - Multiple orchestrator instances with shared state
5. **Metrics dashboard** - Real-time monitoring of WebSocket health
6. **Replay capability** - Event sourcing for missed messages

### Known Limitations

1. **Single orchestrator** - No horizontal scaling yet
2. **In-memory sessions** - Sessions lost on server restart
3. **No message persistence** - Messages not stored for offline clients
4. **Limited backpressure** - No flow control for slow clients

---

## References

### Key Files

**Worker WebSocket:**

- `packages/orchestrator/src/websocket/WorkerWebSocketServer.ts`
- `packages/orchestrator/src/websocket/WebSocketConnectionManager.ts`
- `packages/orchestrator/src/websocket/WebSocketMessageRouter.ts`
- `packages/shared-orch-worker/worker-messages.ts`
- `packages/shared-orch-worker/orchestrator-messages.ts`

**Frontend WebSocket:**

- `packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts`
- `packages/web-backend/src/transport/EventBroadcaster.ts`
- `packages/web-backend/src/transport/OrchestratorEventBridge.ts`
- `packages/web-backend/src/transport/TransportSessionManager.ts`
- `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts`
- `packages/shared-frontend-backend/src/transport/B2FEventConstants.ts`

### Related Documentation

- [Transport Layer Documentation](../packages/web-backend/docs/TRANSPORT_LAYER.md)
- [Backend Architecture](../packages/web-backend/docs/ARCHITECTURE.md)
- [Flow Engine](../packages/flow-engine/README.md)

---

**Document Version:** 1.0
**Maintained By:** Agent Fleet Team
**Last Review:** 2026-01-22
