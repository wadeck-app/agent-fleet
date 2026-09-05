 WebSocket Architecture

Last Updated: --
Status: Production-ready

 Table of Contents

- [Overview](overview)
- [Architecture Layers](architecture-layers)
- [Worker WebSocket System (WO/OW)](worker-websocket-system-woow)
- [Frontend WebSocket System (BF)](frontend-websocket-system-bf)
- [Event Flow Diagrams](event-flow-diagrams)
- [Message Types](message-types)
- [Usage Examples](usage-examples)
- [Best Practices](best-practices)
- [Security](security)
- [Troubleshooting](troubleshooting)

---

 Overview

Agent Fleet uses two distinct WebSocket systems for different purposes:

. Worker WebSocket (WO/OW): Communication between Orchestrator and Worker nodes
. Frontend WebSocket (BF): Communication between Backend and Frontend clients

These systems are independent, use different message structures, and serve different architectural needs.

```
                                      
  Worker   WO/OW  Orchestrator                     Frontend 
  Nodes      (Port )                                       Client  
                                      
                                                                       
                                                         
                                         Backend    
                                                  (Fastify)  
                                                 
                                                       
                                                       BF Events
                                                  (Multi-transport)
```

---

 Architecture Layers

 Layer : Worker  Orchestrator (WO/OW)

Purpose: Task distribution and execution coordination
Protocol: Custom binary-safe protocol with typed messages
Transport: WebSocket only (single, reliable connection)
Port:  (configurable)

Key Components:

- `WorkerWebSocketServer` - Server-side WebSocket handler
- `WebSocketConnectionManager` - Manages worker connections
- `WebSocketMessageRouter` - Routes messages to handlers
- `WorkerCoordinator` - Coordinates task assignment

 Layer : Backend  Frontend (BF)

Purpose: Real-time state updates to web UI
Protocol: JSON-based event system with type-safe events
Transport: Multi-transport (WebSocket, SSE, Long Polling, HTTP)
Endpoint: `/api/transports/ws` (WebSocket endpoint)

Key Components:

- `EventBroadcaster` - Multi-transport event broadcasting
- `WebSocketTransportServer` - WebSocket transport implementation
- `TransportSessionManager` - Authentication and session management
- `OrchestratorEventBridge` - Bridges orchestrator events to BF

---

 Worker WebSocket System (WO/OW)

 Overview

Worker WebSocket enables bidirectional communication between worker nodes and the orchestrator for task distribution and execution.

 Message Prefixes

- WO (Worker-to-Orchestrator): Messages from workers to orchestrator
- OW (Orchestrator-to-Worker): Messages from orchestrator to workers

 Message Types

 Worker-to-Orchestrator (WO)

```typescript
wo: worker_ready; // Worker announces availability
wo: request_task; // Worker requests next task
wo: task_started; // Task execution started
wo: task_completed; // Task completed successfully
wo: task_failed; // Task execution failed
wo: flows_updated; // Worker's available flows changed
wo: intervention_request; // Worker needs human intervention
```

 Orchestrator-to-Worker (OW)

```typescript
ow: worker_welcome; // Welcome message with assigned ID
ow: task_assigned; // Task assigned to worker
ow: task_cancelled; // Cancel running task
ow: intervention_response; // Response to intervention request
ow: error; // Error notification
```

 Connection Flow

```
                           
 Worker                              Orchestrator 
                           
                                            
       . Connect to ws://localhost:   
       >  
                                            
       . Send wo:worker_ready            
       {preferredId, projectId, flows}     
       >  
                                            
       . Receive ow:worker_welcome       
       {workerId}                           
       <  
                                            
       . Request or receive tasks         
         
                                            
       . Execute and report results       
         
                                            
```

 Message Structure

All messages follow this structure:

```typescript
interface ProtocolMessage<T extends string> {
	type: T;
	timestamp: string; // ISO 
	// Message-specific fields...
}
```

 Serialization

```typescript
import { parseMessage, serializeMessage } from 'shared-common/protocol';

// Sending
const message = createWOMessage('wo:task_completed', {
	taskId: 'task-',
	result: { success: true },
});
socket.send(serializeMessage(message));

// Receiving
socket.on('message', data => {
	const message = parseMessage<OWMessage>(data.toString());
	// Handle message based on type
});
```

 Worker Registration Example

```typescript
// Worker side
const message = createWOMessage('wo:worker_ready', {
	preferredId: 'worker-dev-',
	projectId: 'my-project',
	workspacePath: '/path/to/workspace',
	availableFlows: [
		{ id: 'build-flow', version: '..' / ...metadata / },
		{ id: 'test-flow', version: '..' / ...metadata / },
	],
	gitBranch: 'main',
});
```

---

 Frontend WebSocket System (BF)

 Overview

Frontend WebSocket provides real-time updates to web UI clients using a multi-transport event broadcasting system.

 Event Prefixes

All frontend events use the `bf:` prefix (Backend-to-Frontend):

```typescript
bf: task: created; // New task created
bf: task: updated; // Task updated
bf: worker: connected; // Worker connected
bf: workspace: created; // Workspace created
// ... + event types
```

 Multi-Transport Support

The BF system supports multiple transports for maximum compatibility:

. WebSocket - Bidirectional, low-latency (primary)
. Server-Sent Events (SSE) - Server-to-client streaming
. Long Polling - Legacy fallback
. HTTP Polling - Maximum compatibility fallback

```typescript
// All transports share the same event API
eventBroadcaster.broadcast('bf:task:created', taskData);
// → Automatically sent via all active transports
```

 Connection Flow

```
                      
 Frontend                        Backend 
                      
                                      
       . HTTP: Login & get cookies  
       POST /api/auth/login           
        
        access_token  
                                      
       . WebSocket: Connect          
       GET /api/transports/ws         
       (with cookies)                 
        
                                      
       . Receive 'connected'         
       {userId, tokenExpiresAt}       
        
                                      
       . Subscribe to events         
       {type: 'subscription',         
        action: 'subscribe',          
        events: ['bf:task:created']} 
        
                                      
       . Receive real-time events    
        
                                      
```

 Subscription Management

Frontend clients subscribe to specific events:

```typescript
// Frontend: Subscribe to events
const transport = useTransport();

transport.subscribe('bf:task:created', task => {
	console.log('New task:', task);
});

transport.subscribe(
	'bf:task:updated',
	task => {
		console.log('Task updated:', task);
	},
	{
		// Optional filters
		filters: { taskId: 'specific-task-' },
	}
);
```

 Server-Side Event Broadcasting

```typescript
// Backend: Broadcast events
import { BF_TASK_CREATED } from '@app/shared/transport';

class TasksService {
	async createTask(data: CreateTaskDto): Promise<Task> {
		const task = await this.repository.createTask(data);

		// Broadcast to all subscribed clients
		this.eventBroadcaster.broadcast(BF_TASK_CREATED, task);

		return task;
	}
}
```

 Event Structure

```typescript
interface TransportEvent<E extends EventType> {
	id: string; // Unique event ID
	type: E; // Event type (e.g., 'bf:task:created')
	data: EventData<E>; // Type-safe event data
	timestamp: number; // Unix timestamp (ms)
}
```

 Orchestrator Event Bridge

The `OrchestratorEventBridge` translates orchestrator events to BF events:

```
              
 Orchestrator        OrchestratorEvent             EventBroadcaster
 (OB events)   Bridge                   (BF events)    
        - worker.connected           
                       - worker.disconnected                 
                       - task.updated                        
                             
                                                        All Transports  
                                                        (WS/SSE/Poll)   
                                                       
```

---

 Event Flow Diagrams

 Task Creation Flow

```
                
Frontend      Backend      Orchestrator      Worker              Frontend 
 (User)       Service                                            (Others) 
                
                                                                           
       POST /api/tasks                                                    
                                                         
                                                                           
                     createTask()                                          
                                                      
                                                                           
                                     ow:task_assigned                     
                                                     
                                                                           
                     broadcast                                             
                     bf:task:created                                       
                     
                                                                           
        Created                                                         
                                                         
                                                                           
```

 Worker Connection Flow

```
            
 Worker      Orchestrator      Backend      Frontend 
            
                                                    
      wo:worker_ready                              
                                    
                                                    
                      OB: worker.connected         
                                    
                                                    
                                        bf:worker:connected
                                        
                                                    
      ow:worker_welcome                            
                                    
                                                    
```

---

 Message Types

 WO/OW Message Types Reference

See `packages/shared-orch-worker/worker-messages.ts` and `orchestrator-messages.ts` for complete type definitions.

 BF Event Types Reference

See `packages/shared-frontend-backend/src/transport/BFEventConstants.ts` for all + event types.

Categories:

- Task events: `bf:task:` (created, updated, deleted, status_changed, etc.)
- Worker events: `bf:worker:` (connected, disconnected, status_changed, etc.)
- Workspace events: `bf:workspace:` (created, updated, deleted, etc.)
- Project events: `bf:project:` (created, updated, board_updated, etc.)
- Intervention events: `bf:intervention:` (created, answered, timeout, etc.)

---

 Usage Examples

 Example : Worker Sending Task Completion

```typescript
// packages/worker/src/flow/FlowWorker.ts
import { serializeMessage } from 'shared-common/protocol';
import { createWOMessage } from 'shared-orch-worker/worker-messages';

class FlowWorker {
	private async executeTask(task: Task) {
		try {
			const result = await this.runFlow(task);

			// Send completion message
			const message = createWOMessage('wo:task_completed', {
				workerId: this.workerId,
				taskId: task.id,
				result: result.outputs,
				trace: result.trace,
			});

			this.socket.send(serializeMessage(message));
		} catch (error) {
			// Send failure message
			const message = createWOMessage('wo:task_failed', {
				workerId: this.workerId,
				taskId: task.id,
				error: error.message,
			});

			this.socket.send(serializeMessage(message));
		}
	}
}
```

 Example : Frontend Real-time Updates

```typescript
// packages/web-frontend/src/hooks/useRealtimeRefresh.ts
import { useEffect } from 'react';
import { useTransport } from '../transport/useTransport';
import { BF_TASK_UPDATED } from '@app/shared/transport';

export function useRealtimeTaskUpdates(taskId: string, onUpdate: (task: Task) => void) {
  const transport = useTransport();

  useEffect(() => {
    // Subscribe with taskId filter
    const unsubscribe = transport.subscribe(
      BF_TASK_UPDATED,
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

 Example : Backend Broadcasting Events

```typescript
// packages/web-backend/src/services/TasksService.ts
import { BF_TASK_CREATED, BF_TASK_UPDATED } from '@app/shared/transport';

export class TasksService {
	constructor(
		private eventBroadcaster: EventBroadcaster,
		private orchestratorClient: OrchestratorClient
	) {}

	async createTask(data: CreateTaskDto): Promise<Task> {
		// Create task via orchestrator
		const task = await this.orchestratorClient.createTask(data);

		// Broadcast to frontend
		this.eventBroadcaster.broadcast(BF_TASK_CREATED, task);

		return task;
	}

	async updateTask(id: string, data: UpdateTaskDto): Promise<Task> {
		const task = await this.orchestratorClient.updateTask(id, data);

		// Broadcast update to all subscribed clients
		this.eventBroadcaster.broadcast(BF_TASK_UPDATED, task);

		return task;
	}
}
```

---

 Best Practices

 Worker WebSocket (WO/OW)

. Always use factory functions for message creation:

    ```typescript
    //  Good
    const msg = createWOMessage('wo:task_completed', { ... });

    //  Bad - no type safety
    const msg = { type: 'wo:task_completed', ... };
    ```

. Handle connection loss gracefully:

    ```typescript
    socket.on('close', () => {
    	log.warn('Connection lost, attempting reconnect...');
    	setTimeout(() => this.connect(), );
    });
    ```

. Validate messages before processing:
    ```typescript
    try {
    	const message = parseMessage<WOMessage>(data.toString());
    	// Process message
    } catch (error) {
    	log.error('Invalid message format:', error);
    }
    ```

 Frontend WebSocket (BF)

. Subscribe early, unsubscribe on cleanup:

    ```typescript
    useEffect(() => {
    	const unsub = transport.subscribe(EVENT, handler);
    	return () => unsub(); // Cleanup on unmount
    }, []);
    ```

. Use filters to reduce unnecessary updates:

    ```typescript
    // Only receive updates for specific task
    transport.subscribe('bf:task:updated', handler, {
    	filters: { taskId: 'task-' },
    });
    ```

. Handle disconnections with reconnect logic:

    ```typescript
    transport.on('disconnected', () => {
    	// TransportManager handles auto-reconnect
    	// Show UI indicator to user
    	showNotification('Connection lost, reconnecting...');
    });
    ```

. Batch subscriptions when possible:

    ```typescript
    //  Good - single call
    transport.batchSubscribe([
      'bf:task:created',
      'bf:task:updated',
      'bf:task:deleted'
    ]);

    //  Less efficient - multiple calls
    transport.subscribe('bf:task:created', ...);
    transport.subscribe('bf:task:updated', ...);
    transport.subscribe('bf:task:deleted', ...);
    ```

---

 Security

 Worker WebSocket

- No authentication - Workers are trusted internal nodes
- Private network - Should not be exposed to public internet
- Port security - Use firewall rules to restrict access to port 

 Frontend WebSocket

- Cookie-based authentication - HTTP_ONLY cookies prevent XSS attacks
- Token validation - Every connection authenticated via AuthService
- Session expiration - Automatic cleanup of expired sessions
- CORS protection - Fastify CORS plugin with whitelist
- Rate limiting - Applied at HTTP layer (future: WebSocket-specific)

 Security Checklist

- [ ] Worker WebSocket port () not exposed to internet
- [ ] Frontend WebSocket requires valid authentication
- [ ] Tokens expire and are refreshed properly
- [ ] Sessions cleaned up on disconnection
- [ ] CORS configured with allowed origins only
- [ ] Error messages don't leak sensitive information

---

 Troubleshooting

 Worker Won't Connect

. Check WebSocket server is running:

    ```bash
    netstat -an | grep 
    ```

. Verify worker configuration:

    ```typescript
    // Worker should connect to correct host:port
    const ws = new WebSocket('ws://localhost:');
    ```

. Check logs for connection errors:

    ```bash
     Orchestrator logs
    grep "WorkerWebSocketServer" logs/orchestrator.log

     Worker logs
    grep "WebSocket" logs/worker.log
    ```

 Frontend Not Receiving Events

. Verify authentication:
    - Check cookies are being sent
    - Verify token hasn't expired
    - Check session exists: `GET /api/transports/status`

. Check subscription:

    ```typescript
    // Ensure you're subscribed to the event
    transport.getSubscriptions(); // Should include the event
    ```

. Verify event is being broadcast:

    ```typescript
    // Backend logs should show:
    log.info(`Broadcasting event "${event}" to ${count} clients`);
    ```

. Check filters:
    ```typescript
    // If using filters, ensure they match the event data
    transport.subscribe('bf:task:updated', handler, {
    	filters: { taskId: 'task-' }, // Must match task.id
    });
    ```

 Message Parsing Errors

```typescript
// WO/OW: Use parseMessage for better errors
try {
	const message = parseMessage<WOMessage>(data.toString());
} catch (error) {
	log.error('Parse error:', error.message);
	// Error will indicate which field is missing
}

// BF: Check event structure
try {
	const event = JSON.parse(data.toString());
	if (!event.type || !event.timestamp) {
		throw new Error('Invalid event structure');
	}
} catch (error) {
	log.error('Invalid BF event:', error);
}
```

---

 Performance Considerations

 Worker WebSocket

- Keep messages small - Serialize only necessary data
- Batch updates - Combine multiple small updates when possible
- Use binary for large payloads - Consider msgpack for large data

 Frontend WebSocket

- Server-side filtering - Use filters to reduce client bandwidth
- Subscription management - Unsubscribe from unused events
- Debounce rapid updates - Use frontend debouncing for high-frequency events
- Transport fallback - HTTP polling is least efficient, WebSocket is best

 Monitoring

Key metrics to track:

- Worker connections: Number of active workers
- Frontend sessions: Active sessions per transport type
- Message throughput: Messages/second per connection
- Event broadcast time: Time to deliver to all clients
- Subscription count: Average subscriptions per client

---

 Future Improvements

 Potential Enhancements

. Message compression - gzip or brotli for large messages
. Binary protocol - Use msgpack or protobuf instead of JSON
. Message prioritization - Priority queue for critical messages
. Load balancing - Multiple orchestrator instances with shared state
. Metrics dashboard - Real-time monitoring of WebSocket health
. Replay capability - Event sourcing for missed messages

 Known Limitations

. Single orchestrator - No horizontal scaling yet
. In-memory sessions - Sessions lost on server restart
. No message persistence - Messages not stored for offline clients
. Limited backpressure - No flow control for slow clients

---

 References

 Key Files

Worker WebSocket:

- `packages/orchestrator/src/websocket/WorkerWebSocketServer.ts`
- `packages/orchestrator/src/websocket/WebSocketConnectionManager.ts`
- `packages/orchestrator/src/websocket/WebSocketMessageRouter.ts`
- `packages/shared-orch-worker/worker-messages.ts`
- `packages/shared-orch-worker/orchestrator-messages.ts`

Frontend WebSocket:

- `packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts`
- `packages/web-backend/src/transport/EventBroadcaster.ts`
- `packages/web-backend/src/transport/OrchestratorEventBridge.ts`
- `packages/web-backend/src/transport/TransportSessionManager.ts`
- `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts`
- `packages/shared-frontend-backend/src/transport/BFEventConstants.ts`

 Related Documentation

- [Transport Layer Documentation](../packages/web-backend/docs/TRANSPORT_LAYER.md)
- [Backend Architecture](../packages/web-backend/docs/ARCHITECTURE.md)
- [Flow Engine](../packages/flow-engine/README.md)

---

Document Version: .
Maintained By: Agent Fleet Team
Last Review: --
