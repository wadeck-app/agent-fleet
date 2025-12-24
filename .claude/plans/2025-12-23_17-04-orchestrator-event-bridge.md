# Plan: Orchestrator Event Bridge (Worker Lifecycle Events)

**Date**: 2025-12-23_17-04
**Objective**: Enable real-time worker connection/disconnection events on the Workers page by creating a bridge between O2B (Orchestrator-to-Backend) and B2F (Backend-to-Frontend) event systems.

## Current State

**Problem**: Workers page uses polling (5s interval) instead of real-time WebSocket events.

**Why**: No code bridges O2B events from orchestrator to B2F events for frontend.

**Event Flow Gap**:

```
Orchestrator emits O2B event → [MISSING BRIDGE] → Frontend receives B2F event
```

## Solution Architecture

### 1. Create OrchestratorEventBridge Class

**Location**: `packages/web-backend/src/transport/OrchestratorEventBridge.ts`

**Why transport/ directory?**

- Pure event forwarding/translation logic
- Co-located with EventBroadcaster
- Not a traditional CRUD service

**Class Structure**:

```typescript
export class OrchestratorEventBridge {
	constructor(
		private orchestratorClient: OrchestratorClient,
		private eventBroadcaster: EventBroadcaster
	) {}

	// Call after orchestratorClient connected
	initialize(): void {
		this.orchestratorClient.on('worker.connected', this.handleWorkerConnected.bind(this));
		this.orchestratorClient.on('worker.disconnected', this.handleWorkerDisconnected.bind(this));
	}

	// Call during shutdown
	dispose(): void {
		this.orchestratorClient.off('worker.connected', this.handleWorkerConnected);
		this.orchestratorClient.off('worker.disconnected', this.handleWorkerDisconnected);
	}

	private handleWorkerConnected(data: O2BEventData<'worker.connected'>): void {
		// Transform O2B → B2F format
		// Validate required fields
		// Broadcast via eventBroadcaster.broadcast(B2F_WORKER_CONNECTED, worker)
	}

	private handleWorkerDisconnected(data: O2BEventData<'worker.disconnected'>): void {
		// Transform O2B → B2F format
		// Validate required fields
		// Broadcast via eventBroadcaster.broadcast(B2F_WORKER_DISCONNECTED, worker)
	}
}
```

### 2. Data Transformation

**O2B → B2F Mapping**:

**worker.connected**:

- Input: `{ workerId, workerType, connectedAt, timestamp }`
- Output: `Worker` object with `{ workerId, type: workerType, connected: true, state: 'idle', ... }`

**worker.disconnected**:

- Input: `{ workerId, reason?, timestamp }`
- Output: `Worker` object with `{ workerId, type: '<unknown>', connected: false, ... }`
- **Note**: workerType not available in disconnect event

**All Worker fields** (undefined for MVP data not tracked yet):

- `taskId`, `uptime`, `lastHeartbeat`, `tasksCompleted`, `successRate` → `undefined`

### 3. Server Integration

**File**: `packages/web-backend/src/server.ts`

**Step 1**: Add initialization function after `initializeTransportServer()` (~line 122):

```typescript
/**
 * Initialize Orchestrator Event Bridge
 * Connects O2B events to B2F event broadcasting
 */
function initializeOrchestratorEventBridge(
	orchestratorClient: OrchestratorClient,
	factory: DataStoreFactory
): OrchestratorEventBridge {
	const eventBroadcaster = factory.getEventBroadcaster();
	const bridge = new OrchestratorEventBridge(orchestratorClient, eventBroadcaster);

	bridge.initialize();
	logger.info('[Bridge] OrchestratorEventBridge initialized');

	return bridge;
}
```

**Step 2**: Call in `start()` function after `initializeTransportServer()` (~line 407):

```typescript
// Initialize WebSocket transport server
await initializeTransportServer(fastify, factory);

// NEW: Initialize orchestrator event bridge
const eventBridge = initializeOrchestratorEventBridge(orchestratorClient, factory);
```

**Step 3**: Cleanup in shutdown handlers (~line 450):

```typescript
signals.forEach(signal => {
	process.on(signal, async () => {
		logger.info(`${signal} signal received: closing HTTP server`);

		// NEW: Cleanup bridge
		if (eventBridge) {
			eventBridge.dispose();
			logger.info('[Bridge] OrchestratorEventBridge disposed');
		}

		await fastify.close();
		process.exit(0);
	});
});
```

**Challenge**: `eventBridge` needs to be accessible in shutdown handler.
**Solution**: Store reference in `start()` function closure scope before handlers.

### 4. Error Handling Strategy

**Principles**:

1. **Never crash the server** - wrap all handlers in try-catch
2. **Validate event data** - check required fields before transforming
3. **Log but continue** - if broadcast fails, log error but don't throw
4. **Graceful degradation** - skip invalid events, continue processing

**Implementation Pattern**:

```typescript
private handleWorkerConnected(data: O2BEventData<'worker.connected'>): void {
  try {
    // Validate required fields
    if (!data.workerId || !data.workerType) {
      logger.warn('[Bridge] Invalid worker.connected event data:', data);
      return;
    }

    // Transform and broadcast
    const worker: Worker = { /* ... */ };
    this.eventBroadcaster.broadcast(B2F_WORKER_CONNECTED, worker);

    logger.debug(`[Bridge] Broadcasted worker.connected for ${data.workerId}`);
  } catch (error) {
    logger.error('[Bridge] Failed to handle worker.connected event:', error);
  }
}
```

### 5. Testing Strategy

**File**: `packages/web-backend/src/transport/OrchestratorEventBridge.test.ts`

**Test Coverage**:

- `initialize()` subscribes to worker lifecycle events
- `worker.connected` event: transforms and broadcasts correctly
- `worker.disconnected` event: transforms and broadcasts correctly
- Invalid data: handles missing fields gracefully
- Broadcast failures: doesn't crash, logs error
- `dispose()`: unsubscribes from all events
- After disposal: no longer handles events

**Mocking**:

- Use `MockOrchestratorClient` (already exists in orchestrator-adapters)
- Mock `EventBroadcaster` using `vi.fn()`
- Emit O2B events via `mockOrchClient.emitEvent()`
- Assert on `mockBroadcaster.broadcast` calls

**Coverage Target**: >90% (critical infrastructure)

### 6. Logging Standards

All logs use `[Bridge]` prefix:

- `logger.info()` - lifecycle events (initialize, dispose)
- `logger.debug()` - successful event forwarding
- `logger.warn()` - validation failures (missing fields)
- `logger.error()` - unexpected errors

## Implementation Sequence

1. **Create OrchestratorEventBridge.ts** - class skeleton with initialize/dispose
2. **Implement handleWorkerConnected()** - data transformation + broadcast
3. **Implement handleWorkerDisconnected()** - data transformation + broadcast
4. **Create OrchestratorEventBridge.test.ts** - full test suite
5. **Update server.ts** - add initialization function (~line 122)
6. **Update server.ts** - call in start() (~line 407)
7. **Update server.ts** - add cleanup in shutdown (~line 450)
8. **Run tests** - verify all tests pass
9. **Run type check** - `npm run check` (skill: "check")
10. **Manual testing** - connect worker, verify B2F event received

## Critical Files

### New Files:

- `packages/web-backend/src/transport/OrchestratorEventBridge.ts` - main implementation
- `packages/web-backend/src/transport/OrchestratorEventBridge.test.ts` - unit tests

### Modified Files:

- `packages/web-backend/src/server.ts` - three changes:
    - Add `initializeOrchestratorEventBridge()` function (~line 122)
    - Call it in `start()` (~line 407)
    - Call `dispose()` in shutdown handlers (~line 450)

### Reference Files (read-only):

- `packages/web-backend/src/transport/EventBroadcaster.ts` - broadcast API
- `packages/shared-frontend-backend/src/transport/B2FEventConstants.ts` - B2F event names
- `packages/shared-orch-backend/src/transport/O2BEventTypes.ts` - O2B event types
- `packages/orchestrator-adapters/src/OrchestratorClient.ts` - .on() API
- `packages/orchestrator-adapters/src/__mocks__/MockOrchestratorClient.ts` - testing mock

## TypeScript Imports

```typescript
// OrchestratorEventBridge.ts
import type { OrchestratorClient } from 'orchestrator-adapters';

import type { Worker } from '@app/shared';
import { B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED } from '@app/shared-frontend-backend';
import type { O2BEventData } from '@app/shared-orch-backend';

import type { EventBroadcaster } from './EventBroadcaster';
```

## Edge Cases & Considerations

1. **Missing workerType on disconnect**:
    - O2B disconnect event doesn't include workerType
    - Use placeholder `'<unknown>'` in B2F event
    - Frontend should handle gracefully

2. **Event timing/ordering**:
    - Worker might disconnect before frontend receives connected event
    - Frontend must handle out-of-order events

3. **Memory leaks**:
    - Event listeners must be properly removed
    - `dispose()` method cleans up subscriptions
    - Test cleanup thoroughly

4. **Graceful shutdown**:
    - Store bridge reference in closure
    - Call `dispose()` before closing fastify
    - Prevents orphaned event listeners

## Success Criteria

✅ Unit tests pass with >90% coverage
✅ TypeScript compilation succeeds (no errors)
✅ Server starts without errors
✅ O2B worker.connected triggers B2F broadcast (manual test)
✅ O2B worker.disconnected triggers B2F broadcast (manual test)
✅ No memory leaks (listeners cleaned up)
✅ Graceful shutdown works (no errors, dispose called)

## Future Enhancements (NOT in initial scope)

- Worker state tracking: maintain registry for full Worker data on disconnect
- Additional events: bridge task lifecycle events (task.created, task.completed, etc.)
- Event filtering: configure which events to forward
- Metrics: track bridge health (events processed, errors, latency)
- Selective broadcasting: send events only to subscribed clients

## Risk Assessment

**Risk Level**: Low

**Rationale**:

- Isolated component with clear boundaries
- Non-breaking addition (no changes to existing code logic)
- Extensive test coverage possible
- Well-understood bridge pattern
- Error handling prevents crashes

**Mitigation**:

- Comprehensive error handling (try-catch, validation)
- Thorough testing (unit + manual)
- Graceful degradation (log and continue)
- Explicit lifecycle management (initialize/dispose)
