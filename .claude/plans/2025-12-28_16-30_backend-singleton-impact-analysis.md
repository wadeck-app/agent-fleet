# Backend Impact Analysis: Frontend TransportManager Singleton

**Date:** 2025-12-28 16:30
**Context:** Analyzing backend readiness for frontend TransportManager singleton refactoring

## Problem Statement

Frontend is being refactored to use a singleton TransportManager to prevent disconnections caused by React StrictMode. The current issue is that frontend B connects via SSE but disconnects immediately, resulting in "Sending to 0 connections" when frontend A broadcasts events.

## Analysis Results

### 1. Session Management - TransportSessionManager ✅ GOOD

**Current Implementation:**

- Sessions are stored by `connId` in a Map
- Each authentication creates/overwrites session for the `connId`
- Sessions are properly cleaned up on disconnection via `removeSession()`
- Multi-device support works correctly (multiple connIds per userId)

**Reconnection Behavior:**

```typescript
async authenticateConnection(connId: string, request: IncomingMessage, transportType: TransportType) {
    // If connId already exists in sessions, it will be OVERWRITTEN
    const baseSession: BaseSession = { connId, userId, accessToken, ... };
    this.sessions.set(connId, baseSession); // ← This overwrites existing session

    // Track in userSessions
    if (!this.userSessions.has(userId)) {
        this.userSessions.set(userId, new Set());
    }
    this.userSessions.get(userId)!.add(connId); // ← Set.add() is idempotent
}
```

**Verdict:** ✅ **NO ISSUES DETECTED**

- Reconnecting with same `connId` is safe
- Session map is overwritten (not duplicated)
- User sessions Set is idempotent
- No memory leaks from rapid reconnections

**Subscriptions Handling:**

- Subscriptions are tied to the session object
- When session is overwritten during reconnection, subscriptions are LOST
- **POTENTIAL ISSUE:** Client needs to re-subscribe after reconnection

### 2. SSE Transport Server - SSETransportServer ⚠️ ISSUES FOUND

**Current Implementation:**

```typescript
private async handleSSEConnection(request: FastifyRequest, reply: FastifyReply) {
    const connId = (request.query as { connId?: string }).connId;

    // Authenticate (overwrites session in TransportSessionManager)
    const session = await this.sessionManager.authenticateConnection(connId, request.raw, 'sse');

    // Create SSE connection
    const connection: SSEConnection = { connId, userId, reply, ... };
    this.connections.set(connId, connection); // ← OVERWRITES old connection

    // Setup close handler
    request.raw.on('close', () => {
        this.handleDisconnection(connId);
    });
}
```

**Problem 1: Orphaned Connection Cleanup** ⚠️
When reconnecting with same `connId`:

1. Old connection exists in `this.connections` with old `reply` stream
2. New connection overwrites it: `this.connections.set(connId, newConnection)`
3. Old `reply` stream is never closed → **memory leak**
4. Old `request.raw.on('close')` event listener still exists → **event listener leak**

**Problem 2: Double Cleanup on Disconnect** ⚠️

```typescript
private handleDisconnection(connId: string): void {
    const connection = this.connections.get(connId);
    if (!connection) return; // ← Guards against double cleanup

    this.connections.delete(connId);
    this.sessionManager.removeSession(connId); // ← Clean
}
```

This part is actually OK - the guard prevents double cleanup.

**Problem 3: Race Condition with Heartbeat** ⚠️

```typescript
private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
        for (const [connId, connection] of this.connections) {
            // Check if connection is dead
            const timeSinceLastHeartbeat = now - connection.lastHeartbeat;
            if (timeSinceLastHeartbeat > this.CONNECTION_TIMEOUT) {
                console.warn(`[SSE] Connection timeout for ${connId}, removing`);
                this.handleDisconnection(connId); // ← Could remove NEW connection
                continue;
            }
        }
    }, this.HEARTBEAT_INTERVAL);
}
```

**Scenario:**

1. Old connection established at T=0, lastHeartbeat=0
2. Client disconnects but server doesn't detect yet (no 'close' event fired)
3. Client reconnects at T=10 with SAME connId
4. New connection overwrites old one: `lastHeartbeat=10`
5. Heartbeat timer runs at T=70 (60s timeout from T=10)
6. But it checks `timeSinceLastHeartbeat` which should be OK...

Actually, this is OK because the connection object is overwritten, so the new lastHeartbeat is used.

### 3. EventBroadcaster ✅ GOOD

**Current Implementation:**

```typescript
broadcastExcept<E extends EventType>(event: E, data: EventData<E>, excludeConnId?: string) {
    // Get all connected connections from all transports
    const allConnections = this.getConnectedClients();

    // Filter out the excluded connId
    const targetConnections = allConnections.filter(connId => connId !== excludeConnId);

    // Send to each connection individually
    for (const connId of targetConnections) {
        this.sendToClient(connId, event, data);
    }
}

sendToClient<E extends EventType>(connId: string, event: E, data: EventData<E>) {
    // Try each transport until one successfully sends
    for (const transport of this.transportServers) {
        try {
            transport.sendToClient(connId, event, data);
            return; // Success, no need to try other transports
        } catch (error) {
            continue; // Try next transport
        }
    }

    // If no transport found, queue for later
    if (this.messageQueue) {
        this.messageQueue.enqueue(connId, { ... });
    }
}
```

**Verdict:** ✅ **NO ISSUES DETECTED**

- Correctly excludes the source connId
- Handles missing connections gracefully
- Message queue fallback works well

### 4. Logging Analysis 🔍

**Current Logs:**

```typescript
// Connection
console.log(`[SSE] Connection ${connId} connected (user=${session.userId}, total=${this.connections.size})`);

// Disconnection
console.log(`[SSE] Connection ${connId} disconnected (user=${connection.userId}, total=${this.connections.size})`);

// Broadcasting
console.log(`[EventBroadcaster] Sending to ${targetConnections.length} connections (excluded 1)`);
```

**Issues:**

- No log when OVERWRITING an existing connection
- No log for orphaned connection cleanup
- Connection count might be misleading during rapid reconnects

**Recommended Additional Logs:**

```typescript
// In handleSSEConnection, before this.connections.set():
const existingConnection = this.connections.get(connId);
if (existingConnection) {
	console.warn(`[SSE] Replacing existing connection ${connId} (possible rapid reconnect)`);
	// Clean up old connection
	try {
		existingConnection.reply.raw.end();
	} catch (error) {
		console.error(`[SSE] Failed to close orphaned connection ${connId}:`, error);
	}
}
```

## Summary of Issues

### Critical Issues (Must Fix)

None - the backend can handle singleton reconnections

### Important Issues (Should Fix)

1. **⚠️ Subscription Loss on Reconnect** - Client must re-subscribe after reconnection
2. **⚠️ Orphaned SSE Streams** - Old reply streams are not closed when same connId reconnects

### Minor Issues (Nice to Have)

1. **Missing logs** for connection replacement scenarios
2. **Connection count** might be temporarily incorrect during rapid reconnects

## Root Cause of "Sending to 0 connections"

Based on the code analysis, the most likely causes are:

### Hypothesis 1: Client Disconnects Before Subscription ⭐ MOST LIKELY

```
Timeline:
T=0: Frontend B connects to SSE → Backend creates connection
T=10: Backend sends 'connected' event
T=20: Frontend B receives 'connected' event
T=25: React StrictMode unmounts component → SSE connection closes
T=30: Frontend B tries to subscribe → 401 or connection error
T=40: Frontend A broadcasts event → Backend sees 0 SSE connections
```

**Evidence:**

- React StrictMode causes double mount/unmount
- Connection established but immediately closed
- Subscription happens AFTER connection, not during

### Hypothesis 2: Subscription Not Persisting

```
Timeline:
T=0: Frontend B connects and subscribes
T=10: React StrictMode unmounts → connection closes + session removed
T=20: React StrictMode remounts → new connection (same connId)
T=30: But subscriptions were LOST (tied to old session object)
T=40: Frontend A broadcasts → Backend filters out Frontend B (no subscription)
```

**Evidence from code:**

```typescript
async authenticateConnection(connId: string, ...) {
    const baseSession: BaseSession = {
        connId,
        userId,
        accessToken,
        // ...
        subscribedEvents: new Set(), // ← EMPTY on reconnection!
        eventFilters: new Map(),
    };

    this.sessions.set(connId, baseSession); // ← Overwrites old session with subscriptions
}
```

This is the REAL PROBLEM! When reconnecting with same connId, subscriptions are wiped.

## Recommendations

### 1. Fix Subscription Loss on Reconnection (HIGH PRIORITY)

**Option A: Preserve Subscriptions on Reconnection** (Recommended)

```typescript
async authenticateConnection(connId: string, request: IncomingMessage, transportType: TransportType) {
    // Check if session already exists (reconnection)
    const existingSession = this.sessions.get(connId);
    const existingSubscriptions = existingSession?.subscribedEvents || new Set();
    const existingFilters = existingSession?.eventFilters || new Map();

    // Authenticate and create new session
    const { userId, expiresAt } = await this.authService.verifyAccessToken(accessToken);

    const baseSession: BaseSession = {
        connId,
        userId,
        accessToken,
        tokenExpiresAt: expiresAt,
        createdAt: Date.now(),
        lastActivity: Date.now(),
        subscribedEvents: existingSubscriptions, // ← PRESERVE subscriptions
        eventFilters: existingFilters,           // ← PRESERVE filters
    };

    this.sessions.set(connId, baseSession);

    // Log if reconnection
    if (existingSession) {
        console.log(`[Auth] Reconnection detected: connId=${connId}, preserved ${existingSubscriptions.size} subscriptions`);
    }
}
```

**Option B: Client Re-subscribes on Each Reconnection**

- Simpler but requires client-side changes
- Client must track its subscriptions and re-send them after each connection
- More network overhead

### 2. Clean Up Orphaned SSE Connections (MEDIUM PRIORITY)

```typescript
private async handleSSEConnection(request: FastifyRequest, reply: FastifyReply) {
    const connId = (request.query as { connId?: string }).connId;

    // Check for existing connection (rapid reconnect)
    const existingConnection = this.connections.get(connId);
    if (existingConnection) {
        console.warn(`[SSE] Replacing existing connection ${connId} (rapid reconnect detected)`);

        // Clean up orphaned connection
        try {
            existingConnection.reply.raw.end();
            console.log(`[SSE] Closed orphaned connection ${connId}`);
        } catch (error) {
            console.error(`[SSE] Failed to close orphaned connection ${connId}:`, error);
        }
    }

    // Continue with normal flow...
    const session = await this.sessionManager.authenticateConnection(connId, request.raw, 'sse');
    // ...
}
```

### 3. Improve Logging (LOW PRIORITY)

Add logs for:

- Connection replacement detection
- Subscription preservation/loss
- Orphaned connection cleanup
- Better visibility into "why" 0 connections

### 4. Consider Reconnection Grace Period (OPTIONAL)

```typescript
// In TransportSessionManager
private reconnectionGracePeriod = 5000; // 5 seconds
private pendingDisconnections = new Map<string, NodeJS.Timeout>();

removeSession(connId: string): void {
    // Don't immediately remove, give client a chance to reconnect
    const existingTimer = this.pendingDisconnections.get(connId);
    if (existingTimer) {
        clearTimeout(existingTimer);
    }

    const timer = setTimeout(() => {
        // Actually remove session after grace period
        const session = this.sessions.get(connId);
        if (!session) return;

        // Remove from user sessions
        const userConnections = this.userSessions.get(session.userId);
        if (userConnections) {
            userConnections.delete(connId);
            if (userConnections.size === 0) {
                this.userSessions.delete(session.userId);
            }
        }

        // Remove session and transport type
        this.sessions.delete(connId);
        this.transportTypes.delete(connId);
        this.pendingDisconnections.delete(connId);

        console.log(`[Session] Removed after grace period: connId=${connId}`);
    }, this.reconnectionGracePeriod);

    this.pendingDisconnections.set(connId, timer);
}
```

This would allow rapid reconnections without losing subscriptions, but adds complexity.

## Testing Strategy

### Unit Tests to Add

1. Test reconnection with same connId preserves subscriptions
2. Test orphaned connection cleanup
3. Test concurrent reconnections don't cause race conditions

### Integration Tests to Add

1. Test frontend rapid reconnect scenario (StrictMode simulation)
2. Test event broadcasting during reconnection window
3. Test message queue works during reconnection

### Manual Testing

1. Enable React StrictMode in frontend
2. Connect Frontend B with SSE
3. Trigger worker update from Frontend A
4. Verify Frontend B receives the broadcast
5. Check backend logs for connection lifecycle

## Conclusion

**Backend Status:** ⚠️ **MOSTLY READY with ONE CRITICAL ISSUE**

The backend can handle singleton reconnections, but there is ONE critical issue that explains the "Sending to 0 connections" problem:

**Root Cause:** Subscriptions are lost on reconnection because `authenticateConnection()` creates a new session with empty `subscribedEvents` Set.

**Immediate Fix Required:**

1. Preserve subscriptions on reconnection (Option A recommended)
2. Add logging for reconnection scenarios

**Optional Improvements:**

1. Clean up orphaned SSE streams
2. Add reconnection grace period
3. Better logging throughout

**Impact Assessment:**

- Without fix: Frontend B will NOT receive broadcasts after reconnection
- With fix: Frontend B will seamlessly receive broadcasts even with StrictMode reconnections
- No breaking changes required
- Backward compatible (clients that don't reconnect work as before)
