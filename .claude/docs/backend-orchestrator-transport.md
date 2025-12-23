# Backend-Orchestrator Architecture - Embedded Mode

## Table of Contents

- [Introduction](#introduction)
- [Architecture Overview](#architecture-overview)
- [Package Structure](#package-structure)
- [Library Mode](#library-mode)
- [Communication Flow](#communication-flow)
- [Design Decisions](#design-decisions)

---

## Introduction

The Backend-Orchestrator architecture uses an **embedded orchestrator** that runs in the same process as the backend. This provides zero-latency communication and simplified deployment.

### Goals

1. **Simplified Deployment**: Single process, no network configuration
2. **Zero-Overhead**: Direct method calls with no serialization
3. **Type Safety**: End-to-end type safety with shared contracts
4. **Testability**: Mock implementations for fast parallel testing
5. **Reliability**: No network failures between backend and orchestrator

---

## Architecture Overview

### Embedded Architecture

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
│                                    │                        │
│                                    │ WebSocket              │
└────────────────────────────────────┼────────────────────────┘
                                     ↓
                          ┌──────────────────┐
                          │  Workers         │
                          │  (W1, W2, W3...) │
                          └──────────────────┘
```

**Key Points:**

- Backend and Orchestrator in same process
- Direct method calls (no network overhead)
- Workers connect via WebSocket to embedded orchestrator
- Simplified deployment (single container/process)

---

## Package Structure

### `packages/orchestrator`

Core orchestrator logic (task management, worker coordination, state management).

**Location**: `packages/orchestrator/src/`

### `packages/orchestrator-adapters`

Adapter layer for connecting backend to orchestrator.

**Key Files:**

- `OrchestratorClient.ts` - Interface for all adapters
- `LibraryAdapter.ts` - Direct method calls (embedded mode)
- `OrchestratorClientFactory.ts` - Creates appropriate adapter
- `__mocks__/MockOrchestrator.ts` - Mock for unit tests

**Location**: `packages/orchestrator-adapters/src/`

---

## Library Mode

### Configuration

```typescript
// packages/web-backend/src/server.ts
const orchestratorClient = await OrchestratorClientFactory.create({
	mode: 'library',
	wsPort: 3738,
	restPort: 3737,
});

await orchestratorClient.connect();
```

### How It Works

1. **Factory creates Orchestrator instance**
    - Dynamically imports `orchestrator` package
    - Creates new `Orchestrator({ wsPort, restPort })`
    - Starts the orchestrator

2. **LibraryAdapter wraps orchestrator**
    - Provides `OrchestratorClient` interface
    - Direct method calls to orchestrator instance
    - No network communication

3. **Zero latency**
    - In-process calls: ~0.01ms
    - No serialization overhead
    - Shared memory access

### Benefits

✅ **Performance**: Direct method calls (<1ms latency)
✅ **Simplicity**: Single process, no network configuration
✅ **Reliability**: No network failures
✅ **Deployment**: Single Docker container
✅ **Development**: One process to debug

---

## Communication Flow

### Request-Response (Backend → Orchestrator)

```
Backend Controller
    │
    │ client.createTask('description')
    ↓
LibraryAdapter
    │
    │ orchestrator.getTaskManager().createTask(...)
    ↓
Orchestrator TaskManager
    │
    │ return Task object
    ↓
Backend Controller
```

**Latency**: ~0.01ms (direct method call)

### Event Streaming (Orchestrator → Backend)

```
Orchestrator StateManager
    │
    │ emit('TASK_CREATED', { task })
    ↓
LibraryAdapter (EventEmitter)
    │
    │ emit('task.created', { task })
    ↓
Backend (OrchestratorEventBridge)
    │
    │ eventBroadcaster.broadcast('o2b.task.created', { task })
    ↓
Frontend (via WebSocket)
```

**Event Types:**

- `TASK_CREATED` → `task.created`
- `TASK_UPDATED` → `task.updated`
- `WORKER_CONNECTED` → `worker.connected`
- `WORKER_DISCONNECTED` → `worker.disconnected`

---

## Design Decisions

### Why Embedded Mode Only?

**Rationale:**

1. **99% of deployments don't need remote mode** - Single backend instance is sufficient
2. **Complexity reduction** - Removed ~2500 lines of transport layer code
3. **Better performance** - Zero-latency direct calls
4. **Simpler operations** - No network configuration, authentication, retries
5. **Future flexibility** - Can add dedicated relays if needed

### What About Horizontal Scaling?

**Options for scaling:**

**Option A: Vertical Scaling (Recommended)**

- Single Backend+Orchestrator with more resources
- Sufficient for most use cases

**Option B: Multiple Independent Instances**

- Each Backend+Orchestrator manages its own worker pool
- Partition by project/tenant
- No coordination needed

**Option C: Dedicated Relays (If Really Needed)**

- Create lightweight relay components for specific scenarios
- Frontend-Backend relay for internet-exposed deployments
- Orchestrator-Worker relay for multi-network setups
- See `.claude/docs/relay-architecture.md`

### What About Multi-Network Deployments?

Use **dedicated relays** instead of remote mode:

- **Frontend-Backend Relay**: Proxy between internet and local network
- **Worker Relay**: Bridge between orchestrator and workers in different networks

These are simpler, more targeted solutions than a full remote mode.

---

## Testing

### Test Mode

```typescript
// In tests
const client = await OrchestratorClientFactory.create({
	mode: 'test',
	mockOrchestrator: createMockOrchestrator(),
});
```

**Benefits:**

- No real orchestrator started
- No ports allocated
- Fast parallel tests
- Deterministic behavior

### Mock Implementation

```typescript
import { createMockOrchestrator, createMockTask } from 'orchestrator-adapters';

const mockOrch = createMockOrchestrator({
	taskManager: {
		createTask: vi.fn().mockResolvedValue(createMockTask({ id: 'test-123' })),
	},
});
```

**Location**: `packages/orchestrator-adapters/src/__mocks__/MockOrchestrator.ts`

---

## Migration from Remote Mode

If you previously used remote mode, migration is simple:

1. Remove `ORCHESTRATOR_MODE` and `ORCHESTRATOR_URL` from `.env`
2. Keep only `ORCHESTRATOR_WS_PORT` and `ORCHESTRATOR_REST_PORT`
3. Restart backend - orchestrator starts automatically

**Before:**

```bash
ORCHESTRATOR_MODE=remote
ORCHESTRATOR_URL=http://localhost:3737
ORCHESTRATOR_TRANSPORT=websocket
```

**After:**

```bash
ORCHESTRATOR_WS_PORT=3738
ORCHESTRATOR_REST_PORT=3737
```

---

## References

- Implementation: `packages/orchestrator-adapters/src/`
- Configuration: `packages/web-backend/.env.example`
- Tests: `packages/orchestrator-adapters/src/**/*.test.ts`
- Backend Integration: `packages/web-backend/src/server.ts:42-60`
