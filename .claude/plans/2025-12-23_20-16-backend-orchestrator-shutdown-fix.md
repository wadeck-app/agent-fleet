# Backend Orchestrator Shutdown Fix (2025-12-23_20-16)

## Problem Summary

When the backend process is killed or restarted (via nodemon), **ports 3737 and 3738 remain bound** even after the Node.js process exits. This causes "Port already in use" errors on the next restart, forcing manual port cleanup.

### Root Cause Analysis

The orchestrator instance running in library mode is created but **never shut down properly** during graceful shutdown:

1. `OrchestratorClientFactory.create()` creates an Orchestrator instance and starts it (creates REST API on port 3737, WebSocket server on port 3738)
2. Backend stores the returned `OrchestratorClient` (LibraryOrchestratorAdapter wrapper) but doesn't keep a reference to the underlying Orchestrator instance
3. When SIGTERM/SIGINT is received, the backend **never calls `orchestrator.shutdown()`**
4. Orchestrator's REST API and WebSocket servers remain bound to ports → ports stay open after process exit
5. WebSocket transport server has timers that aren't cleared either

### Secondary Issue: WebSocket Transport Server Cleanup

The `WebSocketTransportServer` class has no `stop()` method to clean up:

- Expiration timers (map of `NodeJS.Timeout`) aren't cleared
- Client WebSocket connections aren't gracefully closed
- Event handler arrays aren't reset

## Solution Implemented

### 1. Added `getOrchestrator()` Public Method to LibraryAdapter

**File**: `packages/orchestrator-adapters/src/adapters/LibraryAdapter.ts:372-374`

```typescript
/**
 * Get the underlying orchestrator instance (library mode only)
 * Used for shutdown and cleanup in library mode
 */
getOrchestrator(): Orchestrator {
    return this.orchestrator;
}
```

This provides access to the underlying Orchestrator instance that has the `shutdown()` method.

### 2. Added `stop()` Method to WebSocketTransportServer

**File**: `packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts:397-429`

```typescript
/**
 * Stop the WebSocket server and clean up resources
 * Closes all client connections, clears timers, and resets state
 */
stop(): void {
    // Clear all expiration timers
    this.expirationTimers.forEach(timer => {
        clearTimeout(timer);
    });
    this.expirationTimers.clear();

    // Close all client connections gracefully
    this.clients.forEach(socket => {
        try {
            if (socket && socket.readyState === 1) {
                // 1 = OPEN
                socket.close(1000, 'Server shutting down');
            }
        } catch (error) {
            // Ignore errors when closing sockets
        }
    });
    this.clients.clear();

    // Clear event handlers
    this.clientConnectedHandlers = [];
    this.clientDisconnectedHandlers = [];
}
```

### 3. Made Factory and Orchestrator Client Global Module Variables

**File**: `packages/web-backend/src/server.ts:260-262`

```typescript
// Store references for cleanup in shutdown handlers
// Declared at module level to be accessible in shutdown handlers
let orchestratorClient: Awaited<ReturnType<typeof initializeOrchestratorClient>> | undefined;
let dataStoreFactory: DataStoreFactory | undefined;
```

### 4. Enhanced Graceful Shutdown Handler

**File**: `packages/web-backend/src/server.ts:468-501`

Added comprehensive shutdown logic in SIGTERM/SIGINT handler:

```typescript
// Stop WebSocket transport server (closes all client connections and timers)
if (dataStoreFactory) {
	try {
		const transportServer = dataStoreFactory.getTransportServer();
		if (transportServer && typeof (transportServer as any).stop === 'function') {
			(transportServer as any).stop();
			logger.info('[Transport] WebSocket transport server stopped');
		}
	} catch (error) {
		logger.error('[Transport] Error stopping transport server:', error);
	}
}

// Shutdown orchestrator client (closes REST and WebSocket servers on ports 3737/3738)
if (orchestratorClient) {
	try {
		const client = orchestratorClient as any;
		if (typeof client.getOrchestrator === 'function') {
			const orchestratorInstance = client.getOrchestrator();
			if (orchestratorInstance && typeof orchestratorInstance.shutdown === 'function') {
				await orchestratorInstance.shutdown();
				logger.info('[Orchestrator] Orchestrator shutdown complete');
			}
		}
	} catch (error) {
		logger.error('[Orchestrator] Error during orchestrator shutdown:', error);
	}
}
```

## Shutdown Order

1. **Transport Server Stops First** - Gracefully closes all WebSocket connections and clears timers
2. **Orchestrator Shuts Down** - Closes REST API and worker WebSocket server (ports 3737, 3738)
3. **Fastify Closes** - HTTP server (port 3000) closes
4. **Process Exits** - Clean termination

This order ensures all resources are properly released before the process exits.

## Testing Guide

### Prerequisites

```bash
cd packages/web-backend
npm install
npm run build
```

### Test Graceful Shutdown

```bash
# Terminal 1: Start backend with file watching
npm run dev:backend

# Terminal 2: Check ports are open
lsof -i :3000  # Fastify HTTP
lsof -i :3737  # Orchestrator REST
lsof -i :3738  # Orchestrator WebSocket

# Terminal 1: Press Ctrl+C to trigger graceful shutdown

# Terminal 2: Verify ports are released
lsof -i :3000  # Should return empty
lsof -i :3737  # Should return empty
lsof -i :3738  # Should return empty
```

### Expected Log Output

```
SIGTERM signal received: closing HTTP server
[Transport] WebSocket transport server stopped
[Orchestrator] Orchestrator shutdown complete
```

### Test nodemon Restart

```bash
npm run dev:backend

# In another terminal, modify a file to trigger nodemon restart
touch src/server.ts

# Should restart without "Port already in use" errors
```

## Files Modified

1. **packages/orchestrator-adapters/src/adapters/LibraryAdapter.ts**
    - Added `getOrchestrator()` method to expose internal orchestrator instance

2. **packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts**
    - Added `stop()` method to gracefully clean up resources

3. **packages/web-backend/src/server.ts**
    - Added `dataStoreFactory` as module-level variable
    - Changed factory creation from local `const` to module-level assignment
    - Enhanced shutdown handler with transport server and orchestrator cleanup

## Impact Assessment

### What This Fixes

- ✅ Ports 3737 and 3738 properly release on shutdown
- ✅ nodemon restarts work without "Port already in use" errors
- ✅ WebSocket timers are properly cleared (prevents memory leaks)
- ✅ WebSocket clients are gracefully disconnected (no orphaned connections)
- ✅ All server resources cleaned up in correct order

### Backward Compatibility

- ✅ No breaking changes to existing API
- ✅ No changes to public interfaces (except new optional `getOrchestrator()`)
- ✅ All changes are internal to shutdown flow

### Error Handling

- ✅ Graceful error handling in shutdown (errors logged, doesn't prevent process exit)
- ✅ Type assertions (`as any`) used safely with runtime checks
- ✅ Works even if getOrchestrator() or stop() don't exist (for future compatibility)

## Design Notes

1. **Type Assertions**: Used `as any` for dynamic method access since `getOrchestrator()` is a new method not on the `OrchestratorClient` interface. Runtime checks ensure it exists before calling.

2. **Shutdown Order**: Critical to stop transport server first (it might use orchestrator), then orchestrator, then Fastify. This prevents orphaned connections.

3. **Error Resilience**: Each shutdown step is wrapped in try-catch. If one fails, others still execute and process still exits cleanly.

4. **Logging**: Comprehensive logging at each shutdown step for visibility into graceful shutdown process.

## Future Enhancements

1. Could add `shutdown()` method to `OrchestratorClient` interface for cleaner API
2. Could implement timeout for graceful shutdown (force kill after 5 seconds)
3. Could add connection drain period before closing WebSocket clients
