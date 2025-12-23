# Orchestrator Transport Layer - Unit Test Strategy

## Table of Contents

- [Overview](#overview)
- [Testing Principles](#testing-principles)
- [Test Coverage Goals](#test-coverage-goals)
- [Components to Test](#components-to-test)
- [Test Implementation Order](#test-implementation-order)
- [Mocks and Fixtures](#mocks-and-fixtures)
- [Test Patterns](#test-patterns)

---

## Overview

This document outlines the unit testing strategy for the Backend-Orchestrator transport layer implementation (Phases 4-10). The goal is to achieve >70% coverage overall and >90% for business logic components.

### Testing Scope

**In Scope:**

- Transport layer implementations (WebSocket, REST+SSE, REST+LongPolling)
- RemoteAdapter logic and request/response handling
- OrchestratorRequestHandler request routing
- OrchestratorEventBroadcaster event mapping
- TransportFactory auto-fallback logic
- Server endpoint routing and message handling

**Out of Scope:**

- End-to-end integration tests (will be covered separately)
- Performance/load testing
- Network reliability testing (except simulated failures)
- External dependencies (Orchestrator core, Fastify framework)

---

## Testing Principles

### 1. Isolation

- Each component tested independently with mocked dependencies
- Use MockOrchestratorClient for testing consumers
- Mock WebSocket/HTTP libraries for transport tests

### 2. Fast Execution

- All tests run in <5 seconds total
- No real network connections
- No setTimeout/sleep unless testing timing behavior

### 3. Deterministic

- No flaky tests
- Mock Date.now() for timestamp testing
- Mock Math.random() for ID generation

### 4. Comprehensive

- Happy path + error paths
- Edge cases (empty responses, malformed data)
- Boundary conditions (timeouts, reconnection limits)

### 5. Maintainable

- Clear test names describing behavior
- Arrange-Act-Assert pattern
- Shared fixtures and helpers

---

## Test Coverage Goals

| Component                    | Target Coverage | Priority |
| ---------------------------- | --------------- | -------- |
| **Transport Layer**          |                 |          |
| WebSocketTransport           | 85%             | HIGH     |
| RestSseTransport             | 85%             | HIGH     |
| RestLongPollingTransport     | 85%             | HIGH     |
| TransportFactory             | 95%             | HIGH     |
| **Adapters**                 |                 |          |
| RemoteAdapter                | 90%             | HIGH     |
| LibraryAdapter               | 80%             | MEDIUM   |
| **Server Components**        |                 |          |
| OrchestratorRequestHandler   | 95%             | HIGH     |
| OrchestratorEventBroadcaster | 90%             | HIGH     |
| WebSocketRoute               | 80%             | MEDIUM   |
| RestRoute                    | 80%             | MEDIUM   |
| SseRoute                     | 80%             | MEDIUM   |
| LongPollingRoute             | 80%             | MEDIUM   |
| **Integration Points**       |                 |          |
| DataStoreFactory             | 75%             | MEDIUM   |
| initializeOrchestratorClient | 85%             | HIGH     |

**Overall Target: 85% coverage**

---

## Components to Test

### Phase 4: Transport Layer

#### 4.1 WebSocketTransport

**File:** `packages/orchestrator-adapters/src/transport/WebSocketTransport.ts`
**Test File:** `packages/orchestrator-adapters/src/transport/WebSocketTransport.test.ts`
**Lines:** ~370 lines

**Test Cases:**

1. **Connection Management**
    - ✅ Should connect successfully to WebSocket server
    - ✅ Should reject connection if server unreachable
    - ✅ Should auto-reconnect after connection loss (exponential backoff)
    - ✅ Should stop reconnecting after max attempts
    - ✅ Should emit 'connected' event on successful connection
    - ✅ Should emit 'disconnected' event on connection loss

2. **Request/Response Handling**
    - ✅ Should send B2O request and receive response
    - ✅ Should correlate response to request via request.id
    - ✅ Should timeout request if no response received
    - ✅ Should handle multiple concurrent requests
    - ✅ Should reject request if not connected

3. **Event Subscription**
    - ✅ Should subscribe to O2B event types
    - ✅ Should unsubscribe from O2B event types
    - ✅ Should route incoming events to handlers
    - ✅ Should handle events for subscribed types only

4. **Error Handling**
    - ✅ Should handle malformed JSON responses
    - ✅ Should handle unexpected message types
    - ✅ Should handle server errors in responses
    - ✅ Should cleanup pending requests on disconnect

5. **Heartbeat/Ping-Pong**
    - ✅ Should send ping messages periodically
    - ✅ Should detect connection loss if pong not received
    - ✅ Should not send pings if recently active

**Mocks Required:**

- `ws` library (WebSocket client)
- Mock WebSocket server for responses
- Clock mocks for timeout/reconnection testing

**Complexity:** ~300 lines of test code

---

#### 4.2 RestSseTransport

**File:** `packages/orchestrator-adapters/src/transport/RestSseTransport.ts`
**Test File:** `packages/orchestrator-adapters/src/transport/RestSseTransport.test.ts`
**Lines:** ~230 lines

**Test Cases:**

1. **Connection Management**
    - ✅ Should establish SSE connection on connect()
    - ✅ Should reconnect SSE if connection lost
    - ✅ Should handle SSE connection errors
    - ✅ Should close SSE connection on disconnect()

2. **Request Handling (HTTP POST)**
    - ✅ Should send request to /orchestrator/request
    - ✅ Should include proper headers (Content-Type: application/json)
    - ✅ Should handle HTTP errors (4xx, 5xx)
    - ✅ Should timeout requests
    - ✅ Should parse JSON responses

3. **Event Streaming (SSE)**
    - ✅ Should receive events from SSE stream
    - ✅ Should parse SSE event data (JSON)
    - ✅ Should route events to handlers
    - ✅ Should handle SSE connection drops
    - ✅ Should auto-reconnect SSE stream

4. **Subscription Management**
    - ✅ Should send subscription list on SSE connect
    - ✅ Should update subscriptions dynamically
    - ✅ Should filter events by subscription

**Mocks Required:**

- `fetch` (global or node-fetch)
- EventSource or SSE client mock
- Mock HTTP server responses

**Complexity:** ~220 lines of test code

---

#### 4.3 RestLongPollingTransport

**File:** `packages/orchestrator-adapters/src/transport/RestLongPollingTransport.ts`
**Test File:** `packages/orchestrator-adapters/src/transport/RestLongPollingTransport.test.ts`
**Lines:** ~280 lines

**Test Cases:**

1. **Connection Management**
    - ✅ Should start long-polling loop on connect()
    - ✅ Should stop long-polling on disconnect()
    - ✅ Should restart polling after transient errors
    - ✅ Should respect polling interval

2. **Request Handling (HTTP POST)**
    - ✅ Should send request to /orchestrator/request
    - ✅ Should handle concurrent requests during polling
    - ✅ Should handle HTTP errors
    - ✅ Should timeout requests

3. **Event Polling (HTTP GET)**
    - ✅ Should poll /orchestrator/poll with timeout parameter
    - ✅ Should receive event batch from poll
    - ✅ Should immediately re-poll after receiving events
    - ✅ Should wait before re-polling if no events
    - ✅ Should handle poll timeouts (304 Not Modified)
    - ✅ Should restart poll after network errors

4. **Subscription Management**
    - ✅ Should send subscription list as query params
    - ✅ Should update subscriptions and restart poll
    - ✅ Should filter events by subscription

**Mocks Required:**

- `fetch` (global or node-fetch)
- Mock HTTP server responses
- Clock mocks for polling interval

**Complexity:** ~250 lines of test code

---

#### 4.4 TransportFactory

**File:** `packages/orchestrator-adapters/src/transport/TransportFactory.ts`
**Test File:** `packages/orchestrator-adapters/src/transport/TransportFactory.test.ts`
**Lines:** ~280 lines

**Test Cases:**

1. **Transport Selection**
    - ✅ Should create WebSocketTransport when mode='websocket'
    - ✅ Should create RestSseTransport when mode='rest-sse'
    - ✅ Should create RestLongPollingTransport when mode='rest-longpolling'
    - ✅ Should throw error for invalid mode

2. **Auto-Fallback Logic**
    - ✅ Should try WebSocket first when mode='auto'
    - ✅ Should fallback to REST+SSE if WebSocket fails
    - ✅ Should fallback to REST+LongPolling if REST+SSE fails
    - ✅ Should throw error if all transports fail
    - ✅ Should log fallback attempts

3. **Configuration Passing**
    - ✅ Should pass URL to all transports
    - ✅ Should pass timeout config to transports
    - ✅ Should pass headers to transports

**Mocks Required:**

- Mock transport constructors
- Mock transport.connect() success/failure

**Complexity:** ~180 lines of test code

---

#### 4.5 MockOrchestratorClient

**File:** `packages/orchestrator-adapters/src/__mocks__/MockOrchestratorClient.ts`
**Test File:** `packages/orchestrator-adapters/src/__mocks__/MockOrchestratorClient.test.ts`
**Lines:** ~370 lines

**Test Cases:**

1. **Method Mocking**
    - ✅ Should record all method calls in callHistory
    - ✅ Should return configured mock responses
    - ✅ Should return default responses if not configured
    - ✅ Should support async method mocking

2. **Event Emulation**
    - ✅ Should emit events via emitEvent()
    - ✅ Should deliver events to subscribed handlers
    - ✅ Should support all O2B event types

3. **Subscription Tracking**
    - ✅ Should track on() subscriptions
    - ✅ Should track off() unsubscriptions
    - ✅ Should not deliver events after unsubscribe

**Complexity:** ~120 lines of test code

---

### Phase 5: Remote Adapter

#### 5.1 RemoteAdapter

**File:** `packages/orchestrator-adapters/src/adapters/RemoteAdapter.ts`
**Test File:** `packages/orchestrator-adapters/src/adapters/RemoteAdapter.test.ts`
**Lines:** ~235 lines

**Test Cases:**

1. **Initialization**
    - ✅ Should create transport via TransportFactory
    - ✅ Should connect transport on connect()
    - ✅ Should setup event routing from transport to EventEmitter

2. **Request Methods (All 7 B2O methods)**
    - ✅ createTask: Should send request and return Task
    - ✅ getTask: Should send request and return Task or null
    - ✅ getTasks: Should send request and return Task[]
    - ✅ getWorkers: Should send request with filters and return WorkerInfo[]
    - ✅ getStats: Should send request and return OrchestratorStats
    - ✅ updateConfig: Should send request with config
    - ✅ renameWorker: Should send request with workerId and name

3. **Error Handling**
    - ✅ Should throw error if transport returns error response
    - ✅ Should include error message from response
    - ✅ Should reject request if not connected

4. **Event Subscription**
    - ✅ Should subscribe to event on first listener
    - ✅ Should unsubscribe when last listener removed
    - ✅ Should route transport events to local handlers
    - ✅ Should support multiple handlers per event type

5. **Request ID Generation**
    - ✅ Should generate unique IDs for each request
    - ✅ Should increment counter for request IDs

**Mocks Required:**

- Mock OrchestratorTransport
- Mock TransportFactory.create()

**Complexity:** ~280 lines of test code

---

### Phase 7: Orchestrator Server

#### 7.1 OrchestratorRequestHandler

**File:** `packages/orchestrator-server/src/OrchestratorRequestHandler.ts`
**Test File:** `packages/orchestrator-server/src/OrchestratorRequestHandler.test.ts`
**Lines:** ~250 lines

**Test Cases:**

1. **Request Routing**
    - ✅ Should route createTask to TaskManager.createTask()
    - ✅ Should route getTask to TaskManager.getTask()
    - ✅ Should route getTasks to TaskManager.getTasks()
    - ✅ Should route getWorkers to WorkerRegistry.getWorkers()
    - ✅ Should route getStats to getStats()
    - ✅ Should route updateConfig to updateConfig()
    - ✅ Should route renameWorker to WorkerRegistry.renameWorker()
    - ✅ Should return error for unknown method

2. **Response Format**
    - ✅ Should return response with matching request.id
    - ✅ Should include result on success
    - ✅ Should include error on failure

3. **Error Handling**
    - ✅ Should catch TaskManager errors and return error response
    - ✅ Should handle validation errors
    - ✅ Should handle missing required parameters

4. **Parameter Extraction**
    - ✅ Should extract parameters from request.params
    - ✅ Should pass parameters to orchestrator methods
    - ✅ Should handle optional parameters

**Mocks Required:**

- Mock Orchestrator instance
- Mock TaskManager
- Mock WorkerRegistry

**Complexity:** ~300 lines of test code

---

#### 7.2 OrchestratorEventBroadcaster

**File:** `packages/orchestrator-server/src/OrchestratorEventBroadcaster.ts`
**Test File:** `packages/orchestrator-server/src/OrchestratorEventBroadcaster.test.ts`
**Lines:** ~280 lines

**Test Cases:**

1. **Event Listener Setup**
    - ✅ Should subscribe to all StateManager events
    - ✅ Should map StateEvent.TASK_CREATED → O2B 'task.created'
    - ✅ Should map StateEvent.TASK_UPDATED → O2B 'task.updated'
    - ✅ Should map StateEvent.TASK_COMPLETED → O2B 'task.completed'
    - ✅ Should map StateEvent.TASK_FAILED → O2B 'task.failed'
    - ✅ Should map worker events to O2B events

2. **Client Management**
    - ✅ Should register new clients
    - ✅ Should unregister disconnected clients
    - ✅ Should track client subscriptions

3. **Event Broadcasting**
    - ✅ Should broadcast to all subscribed clients
    - ✅ Should not broadcast to unsubscribed clients
    - ✅ Should handle client send failures gracefully
    - ✅ Should remove client if send fails repeatedly

4. **Subscription Filtering**
    - ✅ Should only send events matching client subscriptions
    - ✅ Should handle wildcard subscriptions (future)

**Mocks Required:**

- Mock Orchestrator instance
- Mock StateManager
- Mock ClientConnection

**Complexity:** ~250 lines of test code

---

#### 7.3 Server Endpoints

**Files:**

- `packages/orchestrator-server/src/endpoints/WebSocketRoute.ts`
- `packages/orchestrator-server/src/endpoints/RestRoute.ts`
- `packages/orchestrator-server/src/endpoints/SseRoute.ts`
- `packages/orchestrator-server/src/endpoints/LongPollingRoute.ts`

**Test Files:** Corresponding `.test.ts` files

**Test Cases per Endpoint:**

**WebSocketRoute:**

- ✅ Should accept WebSocket connections
- ✅ Should route incoming messages to RequestHandler
- ✅ Should send responses back via WebSocket
- ✅ Should register client with EventBroadcaster
- ✅ Should handle subscription messages
- ✅ Should cleanup on disconnect

**RestRoute:**

- ✅ Should accept POST /orchestrator/request
- ✅ Should parse JSON body
- ✅ Should route to RequestHandler
- ✅ Should return JSON response
- ✅ Should handle malformed JSON

**SseRoute:**

- ✅ Should accept GET /orchestrator/events
- ✅ Should register client with EventBroadcaster
- ✅ Should send events as SSE format
- ✅ Should handle subscription query params
- ✅ Should cleanup on connection close

**LongPollingRoute:**

- ✅ Should accept GET /orchestrator/poll
- ✅ Should register client for event batch
- ✅ Should return events as JSON array
- ✅ Should timeout and return 304 if no events
- ✅ Should handle subscription query params

**Mocks Required:**

- Mock Fastify request/reply
- Mock WebSocket connection
- Mock OrchestratorRequestHandler
- Mock OrchestratorEventBroadcaster

**Complexity:** ~400 lines total (100 lines per endpoint)

---

### Phase 8: Backend Integration

#### 8.1 initializeOrchestratorClient Function

**File:** `packages/web-backend/src/server.ts` (lines 38-97)
**Test File:** `packages/web-backend/src/server.test.ts` (new or extend existing)

**Test Cases:**

1. **Library Mode**
    - ✅ Should read ORCHESTRATOR_MODE='library' from env
    - ✅ Should dynamically import orchestrator
    - ✅ Should create Orchestrator instance with ports from env
    - ✅ Should start orchestrator
    - ✅ Should create LibraryAdapter
    - ✅ Should connect adapter

2. **Remote Mode**
    - ✅ Should read ORCHESTRATOR_MODE='remote' from env
    - ✅ Should read ORCHESTRATOR_URL from env
    - ✅ Should throw error if ORCHESTRATOR_URL missing
    - ✅ Should read ORCHESTRATOR_TRANSPORT from env (default 'auto')
    - ✅ Should create RemoteAdapter with config
    - ✅ Should connect adapter

3. **Error Handling**
    - ✅ Should throw error for invalid ORCHESTRATOR_MODE
    - ✅ Should handle orchestrator start failures
    - ✅ Should handle adapter connection failures

**Mocks Required:**

- Mock `process.env`
- Mock dynamic import of orchestrator
- Mock OrchestratorClientFactory.create()

**Complexity:** ~150 lines of test code

---

#### 8.2 DataStoreFactory with OrchestratorClient

**File:** `packages/web-backend/src/factories/DataStoreFactory.ts`
**Test File:** `packages/web-backend/src/factories/DataStoreFactory.test.ts` (extend existing)

**Test Cases:**

1. **Constructor**
    - ✅ Should accept orchestratorClient parameter
    - ✅ Should store orchestratorClient as instance variable

2. **getOrchestratorClient**
    - ✅ Should return the injected orchestratorClient

3. **Service Creation**
    - ✅ getDashboardService: Should pass orchestratorClient to DashboardService
    - ✅ getTasksService: Should pass orchestratorClient to TasksService

**Mocks Required:**

- Mock OrchestratorClient

**Complexity:** ~50 lines of test code (extend existing tests)

---

## Test Implementation Order

### Priority 1: Foundation (Week 1)

1. ✅ MockOrchestratorClient tests (~120 lines)
2. ✅ TransportFactory tests (~180 lines)
3. ✅ RemoteAdapter tests (~280 lines)

**Rationale:** These are fundamental building blocks used by other tests.

### Priority 2: Transport Layer (Week 2)

4. ✅ WebSocketTransport tests (~300 lines)
5. ✅ RestSseTransport tests (~220 lines)
6. ✅ RestLongPollingTransport tests (~250 lines)

**Rationale:** Core functionality, high complexity.

### Priority 3: Server Components (Week 3)

7. ✅ OrchestratorRequestHandler tests (~300 lines)
8. ✅ OrchestratorEventBroadcaster tests (~250 lines)

**Rationale:** Business logic, high priority for correctness.

### Priority 4: Server Endpoints (Week 4)

9. ✅ WebSocketRoute tests (~100 lines)
10. ✅ RestRoute tests (~100 lines)
11. ✅ SseRoute tests (~100 lines)
12. ✅ LongPollingRoute tests (~100 lines)

**Rationale:** Integration points, lower complexity.

### Priority 5: Backend Integration (Week 4)

13. ✅ initializeOrchestratorClient tests (~150 lines)
14. ✅ DataStoreFactory extension tests (~50 lines)

**Rationale:** Integration testing, final validation.

**Total Estimated Test Code:** ~2,450 lines

---

## Mocks and Fixtures

### Shared Mocks (in orchestrator-adapters/**mocks**/)

#### MockTransport

```typescript
export class MockTransport implements OrchestratorTransport {
	connected = false;
	subscriptions = new Set<O2BEventType>();
	requestHandler: (req: B2ORequest) => Promise<B2OResponse> = async () => ({
		id: req.id,
		result: {},
	});

	async connect(): Promise<void> {
		this.connected = true;
	}

	async disconnect(): Promise<void> {
		this.connected = false;
	}

	async request(req: B2ORequest): Promise<B2OResponse> {
		return this.requestHandler(req);
	}

	subscribe(event: O2BEventType): void {
		this.subscriptions.add(event);
	}

	unsubscribe(event: O2BEventType): void {
		this.subscriptions.delete(event);
	}

	onEvent(handler: (event: O2BEvent) => void): void {
		this.eventHandler = handler;
	}

	// Test helper
	emitEvent(event: O2BEvent): void {
		if (this.eventHandler) {
			this.eventHandler(event);
		}
	}
}
```

#### MockWebSocket

```typescript
export class MockWebSocket extends EventEmitter {
	readyState = WebSocket.CONNECTING;
	url: string;

	constructor(url: string) {
		super();
		this.url = url;
	}

	send(data: string): void {
		// Emit mock response after delay
		setImmediate(() => {
			const request = JSON.parse(data);
			const response = { id: request.id, result: { success: true } };
			this.emit('message', JSON.stringify(response));
		});
	}

	close(): void {
		this.readyState = WebSocket.CLOSED;
		this.emit('close');
	}

	// Test helpers
	simulateOpen(): void {
		this.readyState = WebSocket.OPEN;
		this.emit('open');
	}

	simulateMessage(data: any): void {
		this.emit('message', JSON.stringify(data));
	}

	simulateError(error: Error): void {
		this.emit('error', error);
	}
}
```

### Shared Fixtures (in orchestrator-adapters/**fixtures**/)

#### Sample B2O Requests

```typescript
export const sampleCreateTaskRequest: B2ORequest = {
	id: 'req-001',
	method: 'createTask',
	params: {
		description: 'Test Task',
		metadata: { priority: 'high' },
	},
};

export const sampleGetTaskRequest: B2ORequest = {
	id: 'req-002',
	method: 'getTask',
	params: { taskId: 'task-123' },
};
```

#### Sample B2O Responses

```typescript
export const sampleTaskResponse: B2OResponse = {
	id: 'req-001',
	result: {
		id: 'task-123',
		description: 'Test Task',
		status: 'pending',
		priority: 'high',
		createdAt: '2025-01-01T00:00:00Z',
	},
};

export const sampleErrorResponse: B2OResponse = {
	id: 'req-001',
	error: {
		code: 'TASK_NOT_FOUND',
		message: 'Task not found: task-123',
	},
};
```

#### Sample O2B Events

```typescript
export const sampleTaskCreatedEvent: O2BEvent = {
	type: 'task.created',
	data: {
		taskId: 'task-123',
		task: {
			id: 'task-123',
			description: 'Test Task',
			status: 'pending',
			priority: 'high',
			createdAt: '2025-01-01T00:00:00Z',
		},
		timestamp: '2025-01-01T00:00:00Z',
	},
};
```

---

## Test Patterns

### Pattern 1: Arrange-Act-Assert

```typescript
describe('RemoteAdapter', () => {
	test('should create task successfully', async () => {
		// Arrange
		const mockTransport = new MockTransport();
		mockTransport.requestHandler = async req => ({
			id: req.id,
			result: { id: 'task-123', description: 'Test' },
		});
		const adapter = new RemoteAdapter(mockTransport);

		// Act
		const task = await adapter.createTask('Test', { priority: 'high' });

		// Assert
		expect(task.id).toBe('task-123');
		expect(mockTransport.subscriptions.size).toBe(0); // No event subscriptions
	});
});
```

### Pattern 2: Error Testing

```typescript
test('should throw error when transport returns error response', async () => {
	// Arrange
	const mockTransport = new MockTransport();
	mockTransport.requestHandler = async req => ({
		id: req.id,
		error: { code: 'NOT_FOUND', message: 'Task not found' },
	});
	const adapter = new RemoteAdapter(mockTransport);

	// Act & Assert
	await expect(adapter.getTask('task-123')).rejects.toThrow('Task not found');
});
```

### Pattern 3: Event Testing

```typescript
test('should deliver events to subscribed handlers', async () => {
	// Arrange
	const mockTransport = new MockTransport();
	const adapter = new RemoteAdapter(mockTransport);
	const handler = vi.fn();

	// Act
	adapter.on('task.created', handler);
	mockTransport.emitEvent({
		type: 'task.created',
		data: { taskId: 'task-123', task: { id: 'task-123' } },
	});

	// Assert
	expect(handler).toHaveBeenCalledTimes(1);
	expect(handler).toHaveBeenCalledWith(expect.objectContaining({ taskId: 'task-123' }));
});
```

### Pattern 4: Timeout Testing

```typescript
test('should timeout request after specified duration', async () => {
	// Arrange
	vi.useFakeTimers();
	const mockTransport = new MockTransport();
	mockTransport.requestHandler = async req => {
		// Never resolve
		return new Promise(() => {});
	};
	const adapter = new RemoteAdapter(mockTransport);

	// Act
	const promise = adapter.createTask('Test');
	vi.advanceTimersByTime(5000); // Advance past timeout

	// Assert
	await expect(promise).rejects.toThrow('Request timeout');
	vi.useRealTimers();
});
```

### Pattern 5: Reconnection Testing

```typescript
test('should reconnect with exponential backoff', async () => {
	// Arrange
	vi.useFakeTimers();
	const mockWs = new MockWebSocket('ws://localhost:3737');
	const transport = new WebSocketTransport({ url: 'ws://localhost:3737' });
	let connectAttempts = 0;

	// Simulate connection failures
	mockWs.on('connect', () => {
		connectAttempts++;
		if (connectAttempts < 3) {
			mockWs.simulateError(new Error('Connection refused'));
		} else {
			mockWs.simulateOpen();
		}
	});

	// Act
	const connectPromise = transport.connect();
	vi.advanceTimersByTime(1000); // First retry
	vi.advanceTimersByTime(2000); // Second retry (backoff)
	vi.advanceTimersByTime(4000); // Third retry (backoff)

	await connectPromise;

	// Assert
	expect(connectAttempts).toBe(3);
	expect(transport.isConnected()).toBe(true);
	vi.useRealTimers();
});
```

---

## Test Execution

### Run All Tests

```bash
cd packages/orchestrator-adapters
npm test
```

### Run Specific Test File

```bash
npm test WebSocketTransport.test.ts
```

### Run with Coverage

```bash
npm run test:coverage
```

### Watch Mode (Development)

```bash
npm test -- --watch
```

---

## Success Criteria

✅ **All tests pass**
✅ **Overall coverage ≥85%**
✅ **Business logic coverage ≥90%**
✅ **No skipped tests (no .skip or .todo)**
✅ **Fast execution (<5 seconds total)**
✅ **Zero flaky tests (100 consecutive runs pass)**

---

## Next Steps

1. **Create shared mocks and fixtures** (Priority 1)
2. **Implement tests in order of priority** (Priorities 1-5)
3. **Run coverage reports after each batch**
4. **Refactor code if coverage gaps found**
5. **Document any untestable code with rationale**

---

## Related Documentation

- [Architecture Overview](./backend-orchestrator-transport.md)
- [Usage Guide](./orchestrator-client-usage.md)
- [Configuration Reference](./orchestrator-client-configuration.md)
