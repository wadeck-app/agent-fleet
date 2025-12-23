# Backend Startup and Shutdown Flow Analysis

## Executive Summary

The backend uses a **layered architecture** with multiple server instances being created and destroyed. Graceful shutdown is implemented with SIGTERM/SIGINT handlers, but there are potential cleanup gaps when the orchestrator is used in library mode.

**Key Finding**: The orchestrator instance created during library mode initialization is NOT stored in a variable accessible to shutdown handlers, creating a potential resource leak.

---

## 1. BACKEND INITIALIZATION FLOW (Library Mode)

### Entry Point: packages/web-backend/src/server.ts

**Startup Sequence:**

1. **Environment Loading** (Lines 1-41)
    - Load .env files from root and backend package
    - Critical env vars checked: NODE_ENV, DISABLE_AUTH_DEV, E2E_MODE, PROJECT_ID, WORKSPACE_ID

2. **Orchestrator Initialization** (Lines 46-81, 397)
    - Called in library mode only via initializeOrchestratorClient()
    - Creates embedded Orchestrator instance
    - Connects OrchestratorClient via LibraryAdapter

3. **Fastify HTTP Server** (Lines 190-441)
    - Initialized at line 190
    - Plugins registered (CORS, Helmet, Cookie, etc.)
    - Health check endpoints at /health and /api/health
    - **Listens at line 441**: await fastify.listen({ port: PORT, host: '0.0.0.0' })

4. **DataStoreFactory** (Lines 399-437)
    - Global singleton factory initialized for dependency injection
    - Three initialization paths based on environment

5. **WebSocket Transport Server** (Lines 86-114, 424)
    - Created via initializeTransportServer(fastify, factory)
    - Registers /ws endpoint with Fastify
    - Manages client sessions and subscriptions

6. **Event Bridge** (Lines 120-131, 413)
    - OrchestratorEventBridge subscribes to O→B events
    - Forwards orchestrator events to frontend clients
    - Stored in module-level variable eventBridge (line 262)

---

## 2. ALL SERVER INSTANCES CREATED

### 2.1 Fastify HTTP Server

Location: packages/web-backend/src/server.ts:190

- **Ports**: Calculated from PROJECT_ID (default: 3000 + projectId*10 + workspaceId*100)
- **Default**: PORT 3000
- **Started**: Line 441 - await fastify.listen()
- **Graceful Shutdown**: Line 482 - await fastify.close()
- **Status**: ✅ Proper cleanup

### 2.2 WebSocket Transport Server (Backend ↔ Frontend)

Location: packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts:69-78

- **Registers**: GET /ws endpoint with @fastify/websocket plugin
- **Manages**: Client sessions, subscriptions, WebSocket connections
- **Expiration Timers**: Stored in expirationTimers Map (line 58)
- **Client Connections**: Stored in clients Map (line 55)
- **NO explicit stop() method** ❌ (potential issue!)
- **Status**: ❌ No cleanup handler - connections not explicitly closed on shutdown

### 2.3 Orchestrator Instance (Library Mode)

Location: packages/orchestrator-adapters/src/OrchestratorClientFactory.ts:35-69

The orchestrator creates these servers:

#### 2.3.1 WorkerWebSocketServer (Orchestrator)

- **Port**: 3738 (calculated: 3737 + 1, or custom ORCHESTRATOR_WS_PORT)
- **Purpose**: Worker ↔ Orchestrator communication
- **Stop**: Line 111-121 of WorkerWebSocketServer.ts has proper stop() method
- **Status**: ✅ Has stop() method

#### 2.3.2 REST API Server (Orchestrator)

- **Port**: 3737 (HTTP server via Express)
- **Purpose**: REST endpoints for task management
- **Start**: Line 392-401 of RestAPI.ts
- **Stop**: Line 404-425 (includes UI WebSocket cleanup)
- **Status**: ✅ Has stop() method

#### 2.3.3 UI WebSocket Server (Orchestrator)

- **Endpoint**: HTTP upgrade to /ws/ui on port 3737
- **Stop**: Line 406-412 (called from RestAPI.stop())
- **Status**: ✅ Cleanup included

#### 2.3.4 StateManager

- **Purpose**: Event coordination (task lifecycle, worker connections)
- **Status**: ✅ Event cleanup handled (no resources to release)

#### 2.3.5 MetricsCollector

- **Purpose**: Collects metrics every 5 seconds
- **Start**: Line 123 of Orchestrator index.ts
- **Stop**: Line 159
- **Status**: ✅ Has lifecycle management

### Orchestrator Shutdown (Line 145-180 of packages/orchestrator/src/core/index.ts)

```
async shutdown(): Promise<void> {
    this.stateManager.emitOrchestratorStopping();
    this.metricsCollector?.stop();
    this.uiClientHook?.disable();
    if (this.uiInstance) this.uiInstance.unmount();
    await this.restAPI?.stop();
    await this.wsServer?.stop();
}
```

---

## 3. GRACEFUL SHUTDOWN FLOW

### Main Shutdown Handler

Location: packages/web-backend/src/server.ts:470-485

```typescript
const signals = ['SIGTERM', 'SIGINT'] as const;
signals.forEach(signal => {
	process.on(signal, async () => {
		logger.info(`${signal} signal received: closing HTTP server`);

		// Cleanup orchestrator event bridge
		if (eventBridge) {
			eventBridge.dispose();
			logger.info('[Bridge] OrchestratorEventBridge disposed');
		}

		await fastify.close();
		process.exit(0);
	});
});
```

### Shutdown Sequence

1. Signal received: SIGTERM or SIGINT
2. Log message
3. Dispose event bridge
4. Close Fastify HTTP server
5. Exit process

---

## 4. MISSING CLEANUP HANDLERS - CRITICAL ISSUES

### ❌ CRITICAL: Orchestrator Instance Not Stored for Shutdown

**Problem Location**: packages/web-backend/src/server.ts:397

The orchestratorClient is created but the underlying Orchestrator instance is NOT stored in a module-level variable.

**Impact**:

- REST API (port 3737) not closed properly
- WorkerWebSocketServer (port 3738) not closed properly
- TaskManager state not persisted
- Metrics not finalized
- Potential zombie processes on Windows

**Result on nodemon restart**: Port already in use errors for ports 3737 and 3738

---

### ❌ WebSocketTransportServer (Backend) Has No Stop Method

**Problem Location**: packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts

- Has expirationTimers Map (line 58)
- Has clients Map (line 55)
- **NO stop() or dispose() method**
- Timers not cleared on shutdown
- Client connections not explicitly closed

**What Should Happen**:

- Clear all expiration timers
- Close all client connections
- Clean up internal state

---

### ⚠️ MODERATE: Orchestrator Event Listeners Not Fully Removed

**Problem Location**: packages/orchestrator-adapters/src/adapters/LibraryAdapter.ts:324-348

In off() method, composite events cannot be removed:

- task.completed
- task.failed
- task.status_changed
- worker.status
- worker.log

These events wrap StateManager events but handlers not stored for removal.

**Impact**: OrchestratorEventBridge.dispose() may not fully clean up wrapped event listeners

---

## 5. NODEMON PROCESS MANAGEMENT

### Nodemon Configuration

From packages/web-backend/package.json:

```
"dev": "nodemon --watch src --exec tsx src/server.ts"
```

### How Nodemon Works on File Change

1. File change detected
2. Send SIGTERM to current process (tsx)
3. Graceful shutdown triggered (line 471)
4. eventBridge.dispose() called
5. fastify.close() called
6. process.exit(0)
7. Nodemon starts new process
8. All initialization repeats

### Issue When Orchestrator Shutdown Missing

1. File detected as changed
2. SIGTERM sent
3. Event bridge disposed ✓
4. Fastify closed ✓
5. **Orchestrator still running** ❌ (ports 3737, 3738 still bound)
6. New process spawned
7. **Orchestrator initialization fails**: "Port already in use"
8. **Backend crashes on startup** 💥

---

## 6. PROCESS TERMINATION SIGNAL HANDLING

### Current Implementation

Lines 471-485 handle: SIGTERM, SIGINT

### Signal Coverage

- ✅ SIGTERM - Termination signal (nodemon uses this)
- ✅ SIGINT - Interrupt signal (Ctrl+C)
- ❌ SIGHUP - Not handled (terminal closed)
- ❌ SIGUSR2 - Not handled (debugger signals)
- ❌ Uncaught exceptions - No cleanup

### Timeout Protection

- ❌ No timeout for graceful shutdown
- ⚠️ If shutdown hangs, process.exit() still called immediately

---

## 7. FILE LOCATIONS - QUICK REFERENCE

### Backend Startup/Shutdown

- packages/web-backend/src/server.ts (Lines 1-488) - Main entry point
- packa
