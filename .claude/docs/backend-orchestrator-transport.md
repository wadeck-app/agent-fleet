# Backend-Orchestrator Transport Layer - Architecture Overview

## Table of Contents

- [Introduction](#introduction)
- [Architecture Patterns](#architecture-patterns)
- [Package Structure](#package-structure)
- [Communication Protocols](#communication-protocols)
- [Adapter Pattern](#adapter-pattern)
- [Mode Comparison](#mode-comparison)
- [Request-Response Flow](#request-response-flow)
- [Event Streaming Flow](#event-streaming-flow)
- [Design Decisions](#design-decisions)

---

## Introduction

The Backend-Orchestrator transport layer enables flexible communication between the web backend and the orchestrator, supporting both **embedded** (library mode) and **remote** (client-server) deployment architectures.

### Goals

1. **Flexible Deployment**: Support both embedded and distributed architectures
2. **Zero-Overhead Library Mode**: Direct method calls when co-located
3. **Reliable Remote Mode**: Multiple transport protocols with auto-fallback
4. **Type Safety**: End-to-end type safety with shared contracts
5. **Testability**: Mock implementations for fast parallel testing

---

## Architecture Patterns

### Library Mode (Embedded)

```
┌─────────────────────────────────────────────────────────────┐
│                    Backend Process                          │
│                                                             │
│  ┌──────────────┐     ┌───────────────────────────────┐   │
│  │   Backend    │────>│  LibraryAdapter               │   │
│  │  Controllers │     │  (Direct method calls)        │   │
│  └──────────────┘     └───────────────────────────────┘   │
│                                    │                        │
│                                    ↓                        │
│                       ┌────────────────────────┐           │
│                       │   Orchestrator         │           │
│                       │   • TaskManager        │           │
│                       │   • WorkerWS Server    │           │
│                       │   • StateManager       │           │
│                       └────────────────────────┘           │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Characteristics**:

- **Zero serialization overhead**: Direct JavaScript method calls
- **No network latency**: In-process communication
- **Simpler deployment**: Single process, single container
- **Lower operational complexity**: Fewer moving parts

---

### Remote Mode (Distributed)

```
┌──────────────────────────┐           ┌────────────────────────────┐
│   Backend Process        │           │  Orchestrator-Server       │
│                          │           │                            │
│  ┌────────────────────┐  │           │  ┌──────────────────────┐ │
│  │  Backend           │  │           │  │  OrchestratorRequest │ │
│  │  Controllers       │  │           │  │  Handler             │ │
│  └────────────────────┘  │           │  └──────────────────────┘ │
│            │             │           │            │              │
│            ↓             │           │            ↓              │
│  ┌────────────────────┐  │           │  ┌──────────────────────┐ │
│  │  RemoteAdapter     │  │           │  │  Orchestrator        │ │
│  │                    │  │           │  │  • TaskManager       │ │
│  └────────────────────┘  │           │  │  • WorkerWS Server   │ │
│            │             │           │  │  • StateManager      │ │
│            ↓             │           │  └──────────────────────┘ │
│  ┌────────────────────┐  │           │            │              │
│  │  Transport Layer   │  │  HTTP/WS  │  ┌──────────────────────┐ │
│  │  • WebSocket       │◄─┼───────────┼─>│  Transport Endpoints │ │
│  │  • REST+SSE        │  │           │  │  • WebSocket         │ │
│  │  • REST+LongPoll   │  │           │  │  • REST              │ │
│  └────────────────────┘  │           │  │  • SSE               │ │
│                          │           │  │  • Long-polling      │ │
└──────────────────────────┘           │  └──────────────────────┘ │
                                       │                            │
                                       │  ┌──────────────────────┐ │
                                       │  │  OrchestratorEvent   │ │
                                       │  │  Broadcaster         │ │
                                       │  └──────────────────────┘ │
                                       │                            │
                                       └────────────────────────────┘
```

**Characteristics**:

- **Horizontal scalability**: Multiple backend instances
- **Independent deployment**: Backend and orchestrator can be scaled/updated separately
- **Higher operational complexity**: Network configuration, health checks, monitoring
- **Fault tolerance**: Orchestrator failure doesn't crash backend

---

## Package Structure

### orchestrator-adapters

**Purpose**: Adapter package providing OrchestratorClient interface with library and remote implementations.

**Location**: `packages/orchestrator-adapters/`

**Dependencies**:

```json
{
	"dependencies": {
		"shared-common": "*",
		"shared-orch-backend": "*",
		"ws": "^8.16.0"
	},
	"peerDependencies": {
		"orchestrator": "*"
	},
	"peerDependenciesMeta": {
		"orchestrator": { "optional": true }
	}
}
```

**Structure**:

```
orchestrator-adapters/
├── OrchestratorClient.ts          # Interface
├── OrchestratorClientConfig.ts    # Configuration types
├── OrchestratorClientFactory.ts   # Factory with dynamic imports
├── adapters/
│   ├── LibraryAdapter.ts          # Direct method delegation
│   └── RemoteAdapter.ts           # Network-based client
├── transport/
│   ├── OrchestratorTransport.ts   # Transport interface
│   ├── WebSocketTransport.ts      # Bidirectional WebSocket
│   ├── RestSseTransport.ts        # REST + SSE
│   ├── RestLongPollingTransport.ts # REST + Long-polling
│   └── TransportFactory.ts        # Auto-fallback factory
├── __mocks__/
│   └── MockOrchestratorClient.ts  # Test double
├── build.library.mjs              # Library mode build
└── build.remote.mjs               # Remote mode build
```

---

### orchestrator-server

**Purpose**: Standalone HTTP/WebSocket server exposing orchestrator functionality.

**Location**: `packages/orchestrator-server/`

**Dependencies**:

```json
{
	"dependencies": {
		"orchestrator": "*",
		"shared-orch-backend": "*",
		"@fastify/cors": "^11.1.0",
		"@fastify/websocket": "^11.0.0",
		"fastify": "^5.6.2",
		"dotenv": "^16.4.5"
	}
}
```

**Structure**:

```
orchestrator-server/
├── server.ts                            # Main Fastify app
├── OrchestratorRequestHandler.ts        # Routes B→O requests to TaskManager
├── OrchestratorEventBroadcaster.ts      # Maps StateManager events to O2B events
└── endpoints/
    ├── WebSocketRoute.ts                # GET /orchestrator/ws
    ├── RestRoute.ts                     # POST /orchestrator/request
    ├── SseRoute.ts                      # GET /orchestrator/events
    └── LongPollingRoute.ts              # GET /orchestrator/poll
```

---

## Communication Protocols

### Backend → Orchestrator (B2O) Requests

**7 Request Methods** (defined in `B2OContract`):

1. `createTask(description, metadata)` → Task
2. `getTask(taskId)` → Task | null
3. `getTasks(filters)` → Task[]
4. `getWorkers(filters)` → WorkerInfo[]
5. `getStats()` → OrchestratorStats
6. `updateConfig(config)` → void
7. `renameWorker(workerId, name)` → void

**Request Format**:

```typescript
interface B2ORequest {
	id: string; // Correlation ID
	method: B2OMethod; // One of 7 methods
	params: Record<string, unknown>; // Method parameters
}
```

**Response Format**:

```typescript
interface B2OResponse {
	id: string; // Matches request ID
	result?: unknown; // Success result
	error?: {
		// Error details
		code: string;
		message: string;
	};
}
```

---

### Orchestrator → Backend (O2B) Events

**11 Event Types** (defined in `O2BEventTypes`):

1. `task.created` - New task created
2. `task.updated` - Task state changed
3. `task.assigned` - Task assigned to worker
4. `task.completed` - Task finished
5. `task.failed` - Task execution failed
6. `worker.registered` - Worker connected
7. `worker.disconnected` - Worker lost connection
8. `worker.status` - Worker status changed (busy/idle)
9. `orchestrator.stats` - Stats update
10. `system.error` - System-level error
11. `system.warning` - System warning

**Event Format**:

```typescript
interface O2BEvent {
	type: O2BEventType;
	data: O2BEventData<typeof type>;
	timestamp: string; // ISO 8601
}
```

---

## Adapter Pattern

### OrchestratorClient Interface

All adapters implement this interface:

```typescript
interface OrchestratorClient {
	// Lifecycle
	connect(): Promise<void>;
	disconnect(): Promise<void>;

	// B→O Request Methods (7 methods)
	createTask(description: string, metadata?: Record<string, unknown>): Promise<Task>;
	getTask(taskId: string): Promise<Task | null>;
	getTasks(filters?: TaskFilters): Promise<Task[]>;
	getWorkers(filters?: WorkerFilters): Promise<WorkerInfo[]>;
	getStats(): Promise<OrchestratorStats>;
	updateConfig(config: OrchestratorConfig): Promise<void>;
	renameWorker(workerId: string, name: string): Promise<void>;

	// O→B Event Subscription
	on<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void;

	off<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void;
}
```

---

### LibraryAdapter Implementation

**Direct delegation** to TaskManager and WorkerWebSocketServer:

```typescript
class LibraryOrchestratorAdapter implements OrchestratorClient {
	constructor(private orchestrator: Orchestrator) {}

	async createTask(description: string, metadata?: Record<string, unknown>): Promise<Task> {
		// Direct method call - zero overhead
		return this.orchestrator.getTaskManager().createTask(description, metadata);
	}

	on<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void {
		// Listen to StateManager events directly
		const stateManager = this.orchestrator.getTaskManager().stateManager;
		stateManager.on(mapO2BToStateEvent(event), handler);
	}
}
```

**Benefits**:

- No serialization overhead
- Synchronous method calls (wrapped in Promises for consistency)
- Type-safe at compile time

---

### RemoteAdapter Implementation

**Network-based** communication via transport layer:

```typescript
class RemoteOrchestratorAdapter implements OrchestratorClient {
	private transport: OrchestratorTransport;
	private eventEmitter = new EventEmitter();

	async connect(): Promise<void> {
		this.transport = await TransportFactory.create(this.config);
		await this.transport.connect();

		// Route O→B events from transport to local EventEmitter
		this.transport.onEvent((event: O2BEvent) => {
			this.eventEmitter.emit(event.type, event.data);
		});
	}

	async createTask(description: string, metadata?: Record<string, unknown>): Promise<Task> {
		const response = await this.transport.request({
			id: generateRequestId(),
			method: 'createTask',
			params: { description, metadata },
		});

		if (response.error) {
			throw new Error(`createTask failed: ${response.error.message}`);
		}

		return response.result as Task;
	}

	on<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void {
		if (this.eventEmitter.listenerCount(event) === 0) {
			this.transport.subscribe(event); // Subscribe on first listener
		}
		this.eventEmitter.on(event, handler);
	}
}
```

**Features**:

- Request/response correlation with IDs
- Event subscription management (subscribe/unsubscribe)
- Network error handling
- Reconnection logic (in transport layer)

---

## Mode Comparison

| Feature                    | Library Mode                   | Remote Mode                       |
| -------------------------- | ------------------------------ | --------------------------------- |
| **Deployment**             | Single process                 | Multiple processes                |
| **Latency**                | ~0ms (direct calls)            | 1-10ms (network)                  |
| **Scalability**            | Vertical (single instance)     | Horizontal (multiple backends)    |
| **Fault Tolerance**        | Shared fate (same process)     | Independent processes             |
| **Operational Complexity** | Low                            | Medium-High                       |
| **Resource Usage**         | Lower (shared memory)          | Higher (separate processes)       |
| **Development Experience** | Simpler (single process)       | More complex (multi-process)      |
| **Hot Reload**             | Single restart                 | Backend can restart independently |
| **Best For**               | Development, small deployments | Production, high availability     |

---

## Request-Response Flow

### Library Mode Flow

```
Controller
    │
    ├─> createTask()
    │       │
    │       └─> LibraryAdapter.createTask()
    │               │
    │               └─> orchestrator.getTaskManager().createTask()
    │                       │
    │                       └─> [Direct method execution]
    │                               │
    │                               └─> Return Task
    │
    └─> [Response returned synchronously]
```

**Performance**: <1ms (no serialization, no network)

---

### Remote Mode Flow

```
Controller
    │
    ├─> createTask()
    │       │
    │       └─> RemoteAdapter.createTask()
    │               │
    │               ├─> Build B2ORequest { id, method, params }
    │               │
    │               └─> transport.request(request)
    │                       │
    │                       └─> WebSocketTransport.request()
    │                               │
    │                               ├─> Send JSON over WebSocket
    │                               │
    │                               └─> [Network]
    │                                       │
    │                                       ↓
    [Orchestrator Server]
    │
    ├─> WebSocketRoute receives message
    │       │
    │       └─> OrchestratorRequestHandler.handleRequest()
    │               │
    │               └─> orchestrator.getTaskManager().createTask()
    │                       │
    │                       └─> Return Task
    │
    └─> Build B2OResponse { id, result }
            │
            └─> Send JSON over WebSocket
                    │
                    └─> [Network]
                            │
                            ↓
    WebSocketTransport.receive()
            │
            └─> Resolve Promise with result
                    │
                    └─> Return Task to Controller
```

**Performance**: 1-10ms (serialization + network)

---

## Event Streaming Flow

### Library Mode Events

```
StateManager.emit('TASK_CREATED', task)
    │
    └─> LibraryAdapter internal listener
            │
            └─> eventEmitter.emit('task.created', data)
                    │
                    └─> Controller handler invoked directly
```

**Latency**: <1ms (in-process event)

---

### Remote Mode Events

```
StateManager.emit('TASK_CREATED', task)
    │
    └─> OrchestratorEventBroadcaster listener
            │
            ├─> Map StateEvent to O2BEvent
            │
            └─> broadcast({ type: 'task.created', data, timestamp })
                    │
                    └─> WebSocketRoute.send(JSON)
                            │
                            └─> [Network]
                                    │
                                    ↓
    WebSocketTransport.receive()
            │
            ├─> Parse JSON to O2BEvent
            │
            └─> RemoteAdapter.eventEmitter.emit('task.created', data)
                    │
                    └─> Controller handler invoked
```

**Latency**: 1-10ms (serialization + network)

---

## Design Decisions

### Why Adapter Pattern?

**Problem**: Need to support two fundamentally different communication mechanisms (direct calls vs network).

**Solution**: Adapter pattern with single interface (`OrchestratorClient`).

**Benefits**:

- Controllers remain unchanged
- Mode switching via configuration only
- Easy to add new modes (e.g., gRPC adapter)

---

### Why Optional Peer Dependency?

**Problem**: Library mode needs orchestrator package, remote mode doesn't.

**Solution**: orchestrator as optional peer dependency in orchestrator-adapters.

**Benefits**:

- Remote mode builds don't include orchestrator (~500KB savings)
- Library mode uses dynamic import to resolve at runtime
- Type checking works in development (orchestrator in devDependencies)

---

### Why Multiple Transport Protocols?

**Problem**: Different network environments have different constraints.

**Solution**: 4 transport implementations with auto-fallback.

**Fallback Chain**:

1. **WebSocket** (best: bidirectional, low latency)
   ↓ (if blocked by firewall)
2. **REST + SSE** (good: unidirectional events, HTTP-based)
   ↓ (if SSE not supported)
3. **REST + Long-polling** (ok: maximum compatibility, higher latency)

---

### Why No Business Logic Duplication?

**Problem**: 4 transport endpoints could duplicate request handling logic.

**Solution**: Single `OrchestratorRequestHandler` used by all endpoints.

**Architecture**:

```
WebSocketRoute  ─┐
RestRoute       ─┼─> OrchestratorRequestHandler ─> TaskManager
SseRoute        ─┤
LongPollingRoute ┘
```

**Benefits**:

- DRY principle (single source of truth)
- Consistent behavior across transports
- Easier testing and maintenance

---

## Next Steps

- See [OrchestratorClient Usage Guide](./orchestrator-client-usage.md) for implementation examples
- See [Configuration Reference](./orchestrator-client-configuration.md) for environment variables
- See [Migration Guide](./migration-guide-orchestrator-client.md) for transitioning to this architecture
