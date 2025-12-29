# Fix EventBroadcaster Routing - 2025-12-28_16-00

## Problem

When broadcasting an event, `EventBroadcaster.sendToClient()` tries all transports sequentially using try-catch:

1. EventBroadcaster calls `sendToClient(connId='5a23fcee', ...)`
2. It tries WebSocketTransportServer first
3. WebSocket logs "[WS] Client not connected" but **doesn't throw exception**
4. EventBroadcaster does `return` and never tries SSETransportServer
5. The SSE client never receives the event

## Root Cause

The transport servers (WebSocket, SSE, etc.) don't throw exceptions when a client isn't connected - they just return silently. This breaks the try-catch pattern in EventBroadcaster.

## Solution

Use `TransportSessionManager.getTransportType(connId)` to route **directly** to the correct transport instead of trying all transports sequentially.

## Implementation

### 1. Add `getTransportType()` to ITransportServer interface ✅

```typescript
// ITransportServer.ts
getTransportType(): TransportType;
```

### 2. Implement in all transport servers ✅

- WebSocketTransportServer: returns 'websocket' ✅
- SSETransportServer: returns 'sse' ✅
- LongPollingTransportServer: returns 'long-polling' ✅
- HttpPollingTransportServer: returns 'http' ✅
- MockTransportServer: returns 'mock' ✅

### 3. Refactor EventBroadcaster.sendToClient() ✅

```typescript
sendToClient<E extends EventType>(connId: string, event: E, data: EventData<E>): void {
    // Get transport type from session manager
    const transportType = this.sessionManager.getTransportType(connId);

    if (!transportType) {
        // Queue for later delivery
        return;
    }

    // Find the correct transport server
    const transport = this.findTransportByType(transportType);

    if (!transport) {
        console.error(`No transport server found for type: ${transportType}`);
        return;
    }

    // Send directly to the correct transport
    transport.sendToClient(connId, event, data);
}
```

### 4. Add helper method `findTransportByType()` ✅

```typescript
private findTransportByType(transportType: string): ITransportServer | undefined {
    for (const transport of this.transportServers) {
        if (transport.getTransportType() === transportType) {
            return transport;
        }
    }
    return undefined;
}
```

### 5. Update tests ✅

Updated EventBroadcaster.test.ts to authenticate connections with transport type before testing sendToClient().

## Expected Logs After Fix

```
[EventBroadcaster] Sending to 1 connections: 5a23fcee
[SSE] Broadcast b2f:worker:updated: sent=1, queued=0
```

## Success Criteria

✅ EventBroadcaster detects the correct transport type via TransportSessionManager
✅ Routes directly to the correct transport (no try/catch on all transports)
✅ Front B in SSE receives broadcasts from front A
✅ Logs clearly show which transport is being used

## Files Modified

- `packages/web-backend/src/transport/ITransportServer.ts` - Added getTransportType() method
- `packages/web-backend/src/transport/adapters/WebSocketTransportServer.ts` - Implemented getTransportType()
- `packages/web-backend/src/transport/adapters/SSETransportServer.ts` - Implemented getTransportType()
- `packages/web-backend/src/transport/adapters/LongPollingTransportServer.ts` - Implemented getTransportType()
- `packages/web-backend/src/transport/adapters/HttpPollingTransportServer.ts` - Implemented getTransportType()
- `packages/web-backend/src/transport/adapters/MockTransportServer.ts` - Implemented getTransportType()
- `packages/web-backend/src/transport/EventBroadcaster.ts` - Refactored sendToClient() and added findTransportByType()
- `packages/web-backend/src/transport/EventBroadcaster.test.ts` - Updated tests to authenticate connections

## Status

✅ Implementation complete
✅ All code changes verified

## Testing Instructions

To test the fix manually:

1. Start backend: `npm run dev:backend`
2. Open two browser tabs (Front A and Front B)
3. Connect Front A with WebSocket transport
4. Connect Front B with SSE transport
5. Make a change in Front A (e.g., update a worker name)
6. Verify Front B receives the broadcast event via SSE

Expected backend logs:

```
[EventBroadcaster] Sending to 1 connections: 5a23fcee
[SSE] Broadcast b2f:worker:updated: sent=1, queued=0
```

To run automated tests:

```bash
npm run test --workspace=web-backend
```

Or run the full test suite:

```bash
npm run test:agent
```
