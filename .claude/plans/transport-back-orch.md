# Backend-Orchestrator Communication Layer - Implementation Plan

## 📊 Implementation Progress: 30% Complete (3/10 Phases)

**Status**: ✅ Phases 1-3 completed | 🔄 Phase 4 next | All checks passing ✅

**Last Updated**: 2025-12-22

---

## Context

Building on the transport-front-back_prop4 approach, we need to design the communication layer between Backend (B) and Orchestrator (O).

### Requirements

1. **Two deployment modes:**
    - Library mode: O included in B as a library
    - Remote mode: O and B are separate processes

2. **Bi-directional communication:**
    - O→B: Events (worker logs, task completion, status changes)
    - B→O: Requests (get worker count, configuration, create task, rename worker)

3. **Transport flexibility in remote mode:**
    - Dynamic switching (auto-fallback or manual UI control)
    - Configuration-driven (environment variables)
    - Multiple options: WebSocket, REST, SSE, Long-polling

4. **Strong constraints:**
    - Strong typing for all communication (like frontend-backend)
    - Protocol based on types in `shared-orch-backend`
    - Same communication services regardless of transport
    - Strong authentication support (mTLS) in remote mode, disablable for tests

### Final Decisions

✅ **Architecture**: Unified Adapter Pattern with clean interface abstraction
✅ **Authentication**: mTLS (mutual TLS) for production
✅ **Transport**: Auto-fallback at runtime (WebSocket → REST+SSE → Long-polling)
✅ **Test Auth**: No-auth mode for general tests; dedicated tests for each auth method (modular/antifragile)
✅ **Naming**: O2B/B2O prefixes in types for clarity

---

## Architecture Overview

```
┌─────────────────────────────────────────────┐
│           Backend (Consumer)                │
│  ┌───────────────────────────────────────┐  │
│  │    OrchestratorClient Interface       │  │
│  │  - createTask(spec)          [B→O]    │  │
│  │  - getWorkers()              [B→O]    │  │
│  │  - on('task.completed', fn)  [O→B]    │  │
│  └───────────┬───────────────────────────┘  │
│              │                               │
│  ┌───────────▼───────────────────────────┐  │
│  │   OrchestratorClientFactory           │  │
│  │   - create(mode, config)              │  │
│  └───────────┬───────────────────────────┘  │
└──────────────┼───────────────────────────────┘
               │
      ┌────────┴────────┐
      │                 │
┌─────▼─────┐    ┌──────▼──────┐
│  Library  │    │   Remote    │
│  Adapter  │    │   Adapter   │
└─────┬─────┘    └──────┬──────┘
      │                 │
      │          ┌──────▼──────┐
      │          │  Transport  │
      │          │   Layer     │
      │          │ ┌─────────┐ │
      │          │ │WebSocket│ │
      │          │ │REST+SSE │ │
      │          │ │REST+Poll│ │
      │          │ └─────────┘ │
      │          └──────┬──────┘
      │                 │
┌─────▼─────────────────▼─────┐
│     Orchestrator Core       │
│  ┌───────────────────────┐  │
│  │ OrchestratorService   │  │
│  │ - EventEmitter        │  │
│  │ - Methods             │  │
│  └───────────────────────┘  │
└─────────────────────────────┘
```

---

## Implementation Status

### ✅ Phase 1: Shared Types & Contracts - COMPLETED

**Goal**: Define type-safe communication protocol in `shared-orch-backend`

#### Files to create:

**1. `packages/shared-orch-backend/src/transport/B2OContract.ts`**
Backend-to-Orchestrator requests (B→O)

```typescript
// B→O Request/Response types
export interface B2ORequest {
	id: string;
	method: string; // 'createTask', 'getWorkers', etc.
	params?: unknown;
}

export interface B2OResponse {
	id: string;
	result?: unknown;
	error?: { code: string; message: string };
}

// Method definitions with Zod schemas
export const B2O_CreateTaskRequestSchema = z.object({
	method: z.literal('createTask'),
	params: z.object({
		spec: TaskSpecSchema,
	}),
});

export const B2O_GetWorkersRequestSchema = z.object({
	method: z.literal('getWorkers'),
	params: z.object({
		filters: WorkerFiltersSchema.optional(),
	}),
});

export const B2O_UpdateConfigRequestSchema = z.object({
	method: z.literal('updateConfig'),
	params: z.object({
		config: OrchestratorConfigSchema.partial(),
	}),
});

export const B2O_RenameWorkerRequestSchema = z.object({
	method: z.literal('renameWorker'),
	params: z.object({
		workerId: z.string(),
		name: z.string(),
	}),
});

// Type-safe method registry
export interface B2OMethods {
	createTask: {
		request: z.infer<typeof B2O_CreateTaskRequestSchema>['params'];
		response: Task;
	};
	getWorkers: {
		request: z.infer<typeof B2O_GetWorkersRequestSchema>['params'];
		response: Worker[];
	};
	updateConfig: {
		request: z.infer<typeof B2O_UpdateConfigRequestSchema>['params'];
		response: void;
	};
	renameWorker: {
		request: z.infer<typeof B2O_RenameWorkerRequestSchema>['params'];
		response: void;
	};
}
```

**2. `packages/shared-orch-backend/src/transport/O2BEventTypes.ts`**
Orchestrator-to-Backend events (O→B)

```typescript
// O→B Event types with Zod schemas
export const O2B_WorkerStatusEventSchema = z.object({
	type: z.literal('worker.status'),
	data: z.object({
		workerId: z.string(),
		status: z.enum(['idle', 'busy', 'stopped', 'error']),
		timestamp: z.string(),
	}),
});

export const O2B_WorkerLogEventSchema = z.object({
	type: z.literal('worker.log'),
	data: z.object({
		workerId: z.string(),
		level: z.enum(['info', 'warn', 'error', 'debug']),
		message: z.string(),
		timestamp: z.string(),
	}),
});

export const O2B_TaskCompletedEventSchema = z.object({
	type: z.literal('task.completed'),
	data: z.object({
		taskId: z.string(),
		workerId: z.string(),
		result: z.unknown(),
		duration: z.number(),
		timestamp: z.string(),
	}),
});

export const O2B_TaskFailedEventSchema = z.object({
	type: z.literal('task.failed'),
	data: z.object({
		taskId: z.string(),
		workerId: z.string(),
		error: z.string(),
		timestamp: z.string(),
	}),
});

// Union type for all O→B events
export type O2BEvent =
	| z.infer<typeof O2B_WorkerStatusEventSchema>
	| z.infer<typeof O2B_WorkerLogEventSchema>
	| z.infer<typeof O2B_TaskCompletedEventSchema>
	| z.infer<typeof O2B_TaskFailedEventSchema>;

// Type-safe event registry using mapped types
export type O2BEventType = O2BEvent['type'];

export type O2BEventData<T extends O2BEventType> = Extract<O2BEvent, { type: T }>['data'];
```

**3. `packages/shared-orch-backend/src/transport/index.ts`**

```typescript
export * from './B2OContract';
export * from './O2BEventTypes';
```

#### ✅ Acceptance criteria met:

- ✅ All communication types prefixed with O2B or B2O
- ✅ All types defined with Zod schemas
- ✅ Type-safe event registry using TypeScript mapped types
- ✅ Compile-time type checking for all methods
- ✅ Runtime validation for all payloads
- ✅ Files created: B2OContract.ts, O2BEventTypes.ts, index.ts
- ✅ All TypeScript/ESLint checks pass

---

### ✅ Phase 2: OrchestratorClient Interface & Factory - COMPLETED

**Goal**: Create unified client interface that works in both modes

#### Files to create:

**1. `packages/web-backend/src/orchestrator-client/OrchestratorClient.ts`**

```typescript
import type { B2OMethods, O2BEventData, O2BEventType } from '@agent-fleet/shared-orch-backend';

export interface OrchestratorClient {
	// B→O request methods
	createTask(spec: TaskSpec): Promise<Task>;
	getWorkers(filters?: WorkerFilters): Promise<Worker[]>;
	updateConfig(config: Partial<OrchestratorConfig>): Promise<void>;
	renameWorker(workerId: string, name: string): Promise<void>;

	// O→B event subscription
	on<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void;

	off<T extends O2BEventType>(event: T, handler: (data: O2BEventData<T>) => void): void;

	// Lifecycle
	connect(): Promise<void>;
	disconnect(): Promise<void>;
}
```

**2. `packages/web-backend/src/orchestrator-client/OrchestratorClientFactory.ts`**

```typescript
export class OrchestratorClientFactory {
	static create(config: OrchestratorConfig): OrchestratorClient {
		if (config.mode === 'library') {
			return new LibraryOrchestratorAdapter(config);
		} else {
			return new RemoteOrchestratorAdapter(config);
		}
	}
}
```

#### ✅ Acceptance criteria met:

- ✅ Single interface that works for both library and remote modes
- ✅ Type-safe method signatures
- ✅ Event subscription using O2BEventType and O2BEventData
- ✅ Configuration types created (LibraryOrchestratorClientConfig, RemoteOrchestratorClientConfig)
- ✅ Factory with isLibraryMode/isRemoteMode type guards
- ✅ Files created: OrchestratorClient.ts, OrchestratorClientConfig.ts, OrchestratorClientFactory.ts, index.ts
- ✅ Stub adapters created for compilation
- ✅ All TypeScript/ESLint checks pass

---

### ✅ Phase 3: Library Mode Adapter - COMPLETED

**Goal**: Direct access adapter for when orchestrator runs in-process

#### ✅ Files created:

**1. `packages/web-backend/src/orchestrator-client/adapters/LibraryAdapter.ts`**

```typescript
export class LibraryOrchestratorAdapter implements OrchestratorClient {
	constructor(private orchestrator: OrchestratorCore) {}

	// B→O direct method calls - zero overhead
	async createTask(spec: TaskSpec): Promise<Task> {
		return this.orchestrator.createTask(spec);
	}

	async getWorkers(filters?: WorkerFilters): Promise<Worker[]> {
		return this.orchestrator.getWorkers(filters);
	}

	async updateConfig(config: Partial<OrchestratorConfig>): Promise<void> {
		return this.orchestrator.updateConfig(config);
	}

	async renameWorker(workerId: string, name: string): Promise<void> {
		return this.orchestrator.renameWorker(workerId, name);
	}

	// O→B direct EventEmitter subscription
	on<T extends O2BEventType>(event: T, handler: Function): void {
		this.orchestrator.events.on(event, handler);
	}

	off<T extends O2BEventType>(event: T, handler: Function): void {
		this.orchestrator.events.off(event, handler);
	}

	async connect(): Promise<void> {
		// No-op for library mode
	}

	async disconnect(): Promise<void> {
		// No-op for library mode
	}
}
```

**2. `packages/web-backend/src/orchestrator-client/adapters/LibraryAdapter.test.ts`**

- Unit tests for library adapter
- Mock OrchestratorCore
- Test B→O method calls
- Test O→B event propagation
- Test error handling

#### ✅ Acceptance criteria met:

- ✅ Direct method calls with no serialization overhead
- ✅ EventEmitter integration for O→B events (maps StateManager events to O2B events)
- ✅ Implemented all 7 B→O methods (createTask, getTask, getTasks, getWorkers, getStats, updateConfig, renameWorker)
- ✅ Implemented event mapping for all O→B event types
- ✅ Type-safe filtering for tasks and workers
- ✅ No connection/disconnection overhead (no-op methods)
- ✅ All TypeScript/ESLint checks pass
- ⏳ Tests pending (will be written after full implementation)

---

### 🔄 Phase 4: Remote Mode Transport Layer - NEXT

**Goal**: Implement pluggable transport layer with multiple implementations

#### Files to create:

**1. `packages/web-backend/src/orchestrator-client/transport/OrchestratorTransport.ts`**

```typescript
export interface OrchestratorTransport {
	// B→O request handling
	request(req: B2ORequest): Promise<B2OResponse>;

	// O→B event subscription
	subscribe(event: O2BEventType): void;
	unsubscribe(event: O2BEventType): void;
	onEvent(handler: (event: O2BEvent) => void): void;

	// Lifecycle
	connect(): Promise<void>;
	disconnect(): Promise<void>;
}
```

**2. `packages/web-backend/src/orchestrator-client/transport/WebSocketTransport.ts`**

- WebSocket implementation
- Bidirectional communication over single connection
- B→O requests: Send request, track pending, receive response
- O→B events: Subscribe, receive events
- Reconnection logic
- Request timeout handling

**3. `packages/web-backend/src/orchestrator-client/transport/RestSseTransport.ts`**

- REST for B→O requests (POST /orchestrator/request)
- SSE for O→B events (GET /orchestrator/events)
- Event stream parsing
- Request/response correlation

**4. `packages/web-backend/src/orchestrator-client/transport/RestLongPollingTransport.ts`**

- REST for B→O requests (POST /orchestrator/request)
- Long-polling for O→B events (GET /orchestrator/events?timeout=30s)
- Event batching
- Fallback strategy

**5. `packages/web-backend/src/orchestrator-client/transport/TransportFactory.ts`**

```typescript
export class TransportFactory {
	static async create(config: RemoteOrchestratorConfig): Promise<OrchestratorTransport> {
		const mode = config.transportMode || 'auto';

		if (mode === 'auto') {
			return this.createWithFallback(config);
		}

		switch (mode) {
			case 'websocket':
				return new WebSocketOrchestratorTransport(config);
			case 'rest-sse':
				return new RestSseOrchestratorTransport(config);
			case 'rest-longpolling':
				return new RestLongPollingOrchestratorTransport(config);
			default:
				throw new Error(`Unknown transport mode: ${mode}`);
		}
	}

	private static async createWithFallback(config: RemoteOrchestratorConfig) {
		// Try WebSocket first
		try {
			const ws = new WebSocketOrchestratorTransport(config);
			await ws.connect();
			return ws;
		} catch (e) {
			console.log('WebSocket unavailable, falling back to REST+SSE');
		}

		// Fallback to REST+SSE
		try {
			const restSse = new RestSseOrchestratorTransport(config);
			await restSse.connect();
			return restSse;
		} catch (e) {
			console.log('SSE unavailable, falling back to long-polling');
		}

		// Final fallback to REST+LongPolling
		return new RestLongPollingOrchestratorTransport(config);
	}
}
```

#### Acceptance criteria:

- All transports implement same interface
- Auto-fallback works seamlessly
- Reconnection logic tested
- > 85% test coverage
- Each transport tested independently

---

### Phase 5: Remote Mode Adapter

**Goal**: Adapter that uses transport layer for remote communication

#### Files to create:

**1. `packages/web-backend/src/orchestrator-client/adapters/RemoteAdapter.ts`**

```typescript
export class RemoteOrchestratorAdapter implements OrchestratorClient {
  private transport: OrchestratorTransport;
  private eventEmitter = new EventEmitter();

  constructor(config: RemoteOrchestratorConfig) {
    this.transport = await TransportFactory.create(config);
  }

  // B→O requests through transport
  async createTask(spec: TaskSpec): Promise<Task> {
    const response = await this.transport.request({
      id: generateId(),
      method: 'createTask',
      params: { spec },
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result as Task;
  }

  async getWorkers(filters?: WorkerFilters): Promise<Worker[]> {
    const response = await this.transport.request({
      id: generateId(),
      method: 'getWorkers',
      params: { filters },
    });

    if (response.error) {
      throw new Error(response.error.message);
    }

    return response.result as Worker[];
  }

  // O→B events through transport + local EventEmitter
  on<T extends O2BEventType>(event: T, handler: Function): void {
    this.eventEmitter.on(event, handler);
    this.transport.subscribe(event);
  }

  off<T extends O2BEventType>(event: T, handler: Function): void {
    this.eventEmitter.off(event, handler);
    // Only unsubscribe if no more handlers for this event
    if (this.eventEmitter.listenerCount(event) === 0) {
      this.transport.unsubscribe(event);
    }
  }

  async connect(): Promise<void> {
    await this.transport.connect();

    // Route O→B events from transport to local EventEmitter
    this.transport.onEvent((event: O2BEvent) => {
      this.eventEmitter.emit(event.type, event.data);
    });
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
  }
}
```

**2. `packages/web-backend/src/orchestrator-client/adapters/RemoteAdapter.test.ts`**

- Mock transport layer
- Test B→O request/response flow
- Test O→B event subscription and delivery
- Test error handling and timeouts
- Test reconnection scenarios

#### Acceptance criteria:

- Seamless request/response over any transport
- Event delivery with proper type safety
- > 90% test coverage
- Error handling for network failures

---

### Phase 6: Authentication Layer

**Goal**: Pluggable authentication with mTLS, token, and no-auth modes

#### Files to create:

**1. `packages/web-backend/src/orchestrator-client/auth/OrchestratorAuthProvider.ts`**

```typescript
export interface AuthCredentials {
	type: 'mtls' | 'bearer' | 'none';
	clientCert?: string;
	clientKey?: string;
	caCert?: string;
	token?: string;
}

export interface OrchestratorAuthProvider {
	authenticate(): Promise<AuthCredentials>;
	refresh(): Promise<void>;
}
```

**2. `packages/web-backend/src/orchestrator-client/auth/MtlsAuthProvider.ts`**

- mTLS implementation
- Load client certificate from file
- Load client key from file
- Load CA certificate for validation
- Provide credentials to transport layer

**3. `packages/web-backend/src/orchestrator-client/auth/TokenAuthProvider.ts`**

- JWT/Bearer token authentication
- Token refresh logic (if needed)
- Token injection into requests

**4. `packages/web-backend/src/orchestrator-client/auth/NoAuthProvider.ts`**

- No-auth mode for tests
- Simply returns empty credentials

**5. `packages/web-backend/src/orchestrator-client/auth/AuthProviderFactory.ts`**

```typescript
export class AuthProviderFactory {
	static create(config: AuthConfig): OrchestratorAuthProvider {
		switch (config.type) {
			case 'mtls':
				return new MtlsAuthProvider(config.clientCert!, config.clientKey!, config.caCert!);
			case 'token':
				return new TokenAuthProvider(config.token!);
			case 'none':
				return new NoAuthProvider();
			default:
				throw new Error(`Unknown auth type: ${config.type}`);
		}
	}
}
```

**6. Test files for each auth provider**

- `MtlsAuthProvider.test.ts` - Unit tests with mock certificates
- `TokenAuthProvider.test.ts` - Unit tests with mock tokens
- `NoAuthProvider.test.ts` - Unit tests for no-auth

#### Acceptance criteria:

- mTLS works with real certificates
- Token auth implements refresh (if needed)
- No-auth mode for tests
- Each auth method tested independently
- Auth provider pluggable into transports
- > 90% coverage

---

### Phase 7: Orchestrator Request Handler & Event Broadcaster

**Goal**: Server-side implementation to handle remote requests and broadcast events

#### Files to create:

**1. `packages/orchestrator/src/api/OrchestratorRequestHandler.ts`**

```typescript
export class OrchestratorRequestHandler {
	constructor(private orchestrator: OrchestratorCore) {}

	async handleRequest(request: B2ORequest): Promise<B2OResponse> {
		try {
			// Validate request
			// Route to appropriate method
			switch (request.method) {
				case 'createTask':
					const task = await this.orchestrator.createTask(request.params.spec);
					return { id: request.id, result: task };

				case 'getWorkers':
					const workers = await this.orchestrator.getWorkers(request.params.filters);
					return { id: request.id, result: workers };

				case 'updateConfig':
					await this.orchestrator.updateConfig(request.params.config);
					return { id: request.id, result: undefined };

				case 'renameWorker':
					await this.orchestrator.renameWorker(request.params.workerId, request.params.name);
					return { id: request.id, result: undefined };

				default:
					throw new Error(`Unknown method: ${request.method}`);
			}
		} catch (error) {
			return {
				id: request.id,
				error: {
					code: 'INTERNAL_ERROR',
					message: error.message,
				},
			};
		}
	}
}
```

**2. `packages/orchestrator/src/api/OrchestratorEventBroadcaster.ts`**

```typescript
export class OrchestratorEventBroadcaster {
	private clients = new Map<string, ClientConnection>();

	constructor(private orchestrator: OrchestratorCore) {
		// Subscribe to all O→B events from OrchestratorCore
		this.setupEventListeners();
	}

	private setupEventListeners(): void {
		// Listen to orchestrator events and broadcast to clients
		this.orchestrator.events.on('worker.status', data => {
			this.broadcast({ type: 'worker.status', data });
		});

		this.orchestrator.events.on('worker.log', data => {
			this.broadcast({ type: 'worker.log', data });
		});

		this.orchestrator.events.on('task.completed', data => {
			this.broadcast({ type: 'task.completed', data });
		});

		this.orchestrator.events.on('task.failed', data => {
			this.broadcast({ type: 'task.failed', data });
		});
	}

	registerClient(clientId: string, connection: ClientConnection): void {
		this.clients.set(clientId, connection);
	}

	unregisterClient(clientId: string): void {
		this.clients.delete(clientId);
	}

	broadcast(event: O2BEvent): void {
		for (const [clientId, connection] of this.clients.entries()) {
			// Only send events the client is subscribed to
			if (connection.isSubscribedTo(event.type)) {
				connection.send(event);
			}
		}
	}
}

interface ClientConnection {
	isSubscribedTo(eventType: O2BEventType): boolean;
	send(event: O2BEvent): void;
}
```

**3. `packages/orchestrator/src/api/OrchestratorRequestHandler.test.ts`**

- Mock requests and validate responses
- Test error scenarios
- Test method routing
- > 85% coverage

**4. Integration with existing UIWebSocketServer or create new endpoints**

#### Files to modify:

- `packages/orchestrator/src/core/index.ts` - Export request handler and event broadcaster
- `packages/orchestrator/src/websocket/UIWebSocketServer.ts` - Add backend client support or create separate server

#### Acceptance criteria:

- Request handler handles all defined B→O methods
- Event broadcasting to multiple clients
- Client subscription management
- Authentication enforcement
- > 85% test coverage

---

### Phase 8: Backend Integration

**Goal**: Integrate OrchestratorClient into backend services

#### Files to modify:

**1. `packages/web-backend/src/server.ts`**

```typescript
// Create OrchestratorClient using factory
const orchestratorClient = await OrchestratorClientFactory.create({
	mode: process.env.ORCHESTRATOR_MODE || 'library',
	url: process.env.ORCHESTRATOR_URL,
	transport: process.env.ORCHESTRATOR_TRANSPORT,
	auth: {
		type: process.env.ORCHESTRATOR_AUTH || 'none',
		clientCert: process.env.ORCHESTRATOR_MTLS_CLIENT_CERT,
		clientKey: process.env.ORCHESTRATOR_MTLS_CLIENT_KEY,
		caCert: process.env.ORCHESTRATOR_MTLS_CA_CERT,
		token: process.env.ORCHESTRATOR_TOKEN,
	},
});

await orchestratorClient.connect();

// Pass to services via dependency injection
const tasksService = new TasksService(orchestratorClient);
const workersService = new WorkersService(orchestratorClient);
const dashboardService = new DashboardService(orchestratorClient);
```

**2. `packages/web-backend/src/services/TasksService.ts`**

- Replace direct orchestrator access with OrchestratorClient
- Use client for B→O requests (createTask, etc.)
- Subscribe to O→B events (task.completed, task.failed)

**3. `packages/web-backend/src/services/WorkersService.ts`**

- Use OrchestratorClient for worker operations
- Subscribe to O→B worker events (worker.status, worker.log)

**4. `packages/web-backend/src/services/DashboardService.ts`**

- Use OrchestratorClient for dashboard data
- Subscribe to relevant O→B events

**5. Update all service tests to mock OrchestratorClient**

#### Acceptance criteria:

- All services use OrchestratorClient
- No direct access to OrchestratorCore
- Services work in both library and remote modes
- All service tests pass with mocked client
- > 70% overall coverage maintained

---

### Phase 9: Configuration & Environment

**Goal**: Environment-driven configuration for deployment flexibility

#### Files to create:

**1. `packages/web-backend/src/config/orchestrator-client.config.ts`**

```typescript
export const OrchestratorConfigSchema = z.object({
	mode: z.enum(['library', 'remote']).default('library'),
	url: z.string().url().optional(),
	transport: z.enum(['auto', 'websocket', 'rest-sse', 'rest-longpolling']).default('auto'),
	auth: z.object({
		type: z.enum(['mtls', 'token', 'none']).default('none'),
		clientCert: z.string().optional(),
		clientKey: z.string().optional(),
		caCert: z.string().optional(),
		token: z.string().optional(),
	}),
	requestTimeout: z.number().default(30000),
	maxRetries: z.number().default(3),
	reconnectDelay: z.number().default(1000),
});

export function loadOrchestratorConfig(): OrchestratorConfig {
	return OrchestratorConfigSchema.parse({
		mode: process.env.ORCHESTRATOR_MODE,
		url: process.env.ORCHESTRATOR_URL,
		transport: process.env.ORCHESTRATOR_TRANSPORT,
		auth: {
			type: process.env.ORCHESTRATOR_AUTH,
			clientCert: process.env.ORCHESTRATOR_MTLS_CLIENT_CERT,
			clientKey: process.env.ORCHESTRATOR_MTLS_CLIENT_KEY,
			caCert: process.env.ORCHESTRATOR_MTLS_CA_CERT,
			token: process.env.ORCHESTRATOR_TOKEN,
		},
		requestTimeout: parseInt(process.env.ORCHESTRATOR_REQUEST_TIMEOUT || '30000'),
		maxRetries: parseInt(process.env.ORCHESTRATOR_MAX_RETRIES || '3'),
		reconnectDelay: parseInt(process.env.ORCHESTRATOR_WS_RECONNECT_DELAY || '1000'),
	});
}
```

#### Environment variables:

```bash
# Mode selection
ORCHESTRATOR_MODE=library  # or 'remote'

# Remote mode configuration
ORCHESTRATOR_URL=https://orchestrator.example.com
ORCHESTRATOR_TRANSPORT=auto  # or 'websocket', 'rest-sse', 'rest-longpolling'

# Authentication
ORCHESTRATOR_AUTH=mtls  # or 'token', 'none'
ORCHESTRATOR_MTLS_CLIENT_CERT=/path/to/client.crt
ORCHESTRATOR_MTLS_CLIENT_KEY=/path/to/client.key
ORCHESTRATOR_MTLS_CA_CERT=/path/to/ca.crt
ORCHESTRATOR_TOKEN=optional-api-token  # for token auth

# Transport-specific settings
ORCHESTRATOR_WS_RECONNECT_DELAY=1000
ORCHESTRATOR_REQUEST_TIMEOUT=30000
ORCHESTRATOR_MAX_RETRIES=3
```

#### Acceptance criteria:

- All configuration from environment variables
- Sensible defaults
- Validation with clear error messages
- Configuration documented

---

### Phase 10: Documentation & Examples

**Goal**: Document the architecture and provide usage examples

#### Files to create:

**1. `packages/shared-orch-backend/docs/transport-layer.md`**

- Architecture overview
- B2O (Backend→Orchestrator) request types
- O2B (Orchestrator→Backend) event types
- Contract structure with examples

**2. `packages/web-backend/docs/orchestrator-client-usage.md`**

- How to use OrchestratorClient
- Library vs remote mode
- B→O request patterns
- O→B event subscription patterns
- Error handling

**3. `packages/web-backend/docs/orchestrator-client-configuration.md`**

- Environment variables
- Authentication setup (mTLS, token, no-auth)
- Transport selection
- Deployment scenarios

**4. Example configuration files:**

- `.env.library` - Library mode example
- `.env.remote-mtls` - Remote mode with mTLS
- `.env.remote-token` - Remote mode with token auth
- `.env.test` - Test configuration

#### Acceptance criteria:

- Complete architecture documentation
- Usage examples for all modes
- Configuration guide
- Troubleshooting section

---

## Testing Strategy

### Unit Tests (>90% coverage target)

- All adapters (Library, Remote)
- All transports (WebSocket, REST+SSE, REST+LongPolling)
- All auth providers (mTLS, Token, NoAuth)
- Transport factory and fallback logic
- Request handler and event broadcaster

### Integration Tests

- End-to-end library mode
- End-to-end remote mode with each transport
- Auth integration (mTLS with test certificates)
- O→B event delivery across modes
- Transport failover scenarios

### Test Organization

```
packages/web-backend/src/orchestrator-client/
├── OrchestratorClient.test.ts
├── OrchestratorClientFactory.test.ts
├── adapters/
│   ├── LibraryAdapter.test.ts
│   └── RemoteAdapter.test.ts
├── transport/
│   ├── WebSocketTransport.test.ts
│   ├── RestSseTransport.test.ts
│   ├── RestLongPollingTransport.test.ts
│   └── TransportFactory.test.ts
├── auth/
│   ├── MtlsAuthProvider.test.ts
│   ├── TokenAuthProvider.test.ts
│   └── NoAuthProvider.test.ts
└── integration/
    ├── library-mode.integration.test.ts
    └── remote-mode.integration.test.ts
```

---

## Migration Path

### Step 1: Implement without breaking existing code

- Add OrchestratorClient alongside existing direct access
- Services can gradually migrate

### Step 2: Feature flag for testing

- Environment variable to enable/disable new client
- Test in parallel with existing implementation

### Step 3: Migrate services one by one

- TasksService → OrchestratorClient
- WorkersService → OrchestratorClient
- DashboardService → OrchestratorClient
- Validate each migration with tests

### Step 4: Remove legacy direct access

- Once all services migrated and tested
- Remove direct OrchestratorCore access
- Enforce OrchestratorClient as the only interface

---

## Critical Files Summary

### New Files (~26 files)

**Shared types:**

- `packages/shared-orch-backend/src/transport/B2OContract.ts`
- `packages/shared-orch-backend/src/transport/O2BEventTypes.ts`
- `packages/shared-orch-backend/src/transport/index.ts`

**Client interface:**

- `packages/web-backend/src/orchestrator-client/OrchestratorClient.ts`
- `packages/web-backend/src/orchestrator-client/OrchestratorClientFactory.ts`

**Adapters:**

- `packages/web-backend/src/orchestrator-client/adapters/LibraryAdapter.ts`
- `packages/web-backend/src/orchestrator-client/adapters/RemoteAdapter.ts`

**Transports:**

- `packages/web-backend/src/orchestrator-client/transport/OrchestratorTransport.ts`
- `packages/web-backend/src/orchestrator-client/transport/WebSocketTransport.ts`
- `packages/web-backend/src/orchestrator-client/transport/RestSseTransport.ts`
- `packages/web-backend/src/orchestrator-client/transport/RestLongPollingTransport.ts`
- `packages/web-backend/src/orchestrator-client/transport/TransportFactory.ts`

**Authentication:**

- `packages/web-backend/src/orchestrator-client/auth/OrchestratorAuthProvider.ts`
- `packages/web-backend/src/orchestrator-client/auth/MtlsAuthProvider.ts`
- `packages/web-backend/src/orchestrator-client/auth/TokenAuthProvider.ts`
- `packages/web-backend/src/orchestrator-client/auth/NoAuthProvider.ts`
- `packages/web-backend/src/orchestrator-client/auth/AuthProviderFactory.ts`

**Server-side:**

- `packages/orchestrator/src/api/OrchestratorRequestHandler.ts`
- `packages/orchestrator/src/api/OrchestratorEventBroadcaster.ts`

**Configuration:**

- `packages/web-backend/src/config/orchestrator-client.config.ts`

**Documentation:**

- `packages/shared-orch-backend/docs/transport-layer.md`
- `packages/web-backend/docs/orchestrator-client-usage.md`
- `packages/web-backend/docs/orchestrator-client-configuration.md`

**Examples:**

- `.env.library`, `.env.remote-mtls`, `.env.remote-token`, `.env.test`

### Modified Files (6 files)

- `packages/web-backend/src/server.ts`
- `packages/web-backend/src/services/TasksService.ts`
- `packages/web-backend/src/services/WorkersService.ts`
- `packages/web-backend/src/services/DashboardService.ts`
- `packages/orchestrator/src/core/index.ts`
- `packages/orchestrator/src/websocket/UIWebSocketServer.ts`

**Plus**: ~26 test files (one per implementation file)

---

## Success Criteria

✅ Type-safe communication in both library and remote modes
✅ O2B/B2O naming for clear discoverability
✅ Auto-fallback transport selection works reliably
✅ mTLS authentication works with real certificates
✅ No-auth mode works for tests (modular/antifragile)
✅ All service tests pass with >70% overall coverage
✅ All adapter/transport/auth tests have >90% coverage
✅ Library mode has zero serialization overhead
✅ Remote mode successfully reconnects after failures
✅ Event subscription works identically in both modes
✅ Documentation complete with examples
✅ Smooth migration path from existing implementation
