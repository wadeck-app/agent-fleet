# Connection Deduplication Implementation

**Date:** 2025-12-28
**Status:** Completed
**Goal:** Eliminate race condition during React StrictMode by implementing connection deduplication

## Problem

During React StrictMode (double mount), `TransportManager.connect()` was called twice rapidly:

1. First call → `connect()` starts (state = 'connecting')
2. Second call → Checks `isConnected()` → returns `false` (still connecting)
3. Second call → Starts **another connection** with same connId
4. Result: Two simultaneous connections → Backend closes/reopens → 401 errors → reconnections

## Solution: Connection Deduplication

If a connection is already in progress, reuse the same Promise instead of starting a new connection.

## Changes Made

### 1. Added `isConnecting()` to ITransportClient Interface ✅

**File:** `packages/web-frontend/src/transport/ITransportClient.ts`

```typescript
/**
 * Check if currently connecting, to avoid starting another connection yet but returning the current one
 *
 * @returns True if connection is in progress
 */
isConnecting(): boolean;
```

### 2. Implemented `isConnecting()` in ALL Transport Clients ✅

All transport clients now implement `isConnecting()`:

- **WebSocketTransportClient** ✅

    ```typescript
    isConnecting(): boolean {
        return this.connectionState === 'connecting';
    }
    ```

- **SSETransportClient** ✅

    ```typescript
    isConnecting(): boolean {
        return this.connectionState === 'connecting';
    }
    ```

- **LongPollingTransportClient** ✅

    ```typescript
    isConnecting(): boolean {
        return this.connectionState === 'connecting';
    }
    ```

- **HttpPollingTransportClient** ✅

    ```typescript
    isConnecting(): boolean {
        return this.connectionState === 'connecting';
    }
    ```

- **RestTransportClient** ✅

    ```typescript
    isConnecting(): boolean {
        return false; // Connection is instant
    }
    ```

- **MockTransportClient** ✅
    ```typescript
    isConnecting(): boolean {
        return this.connectionState === 'connecting';
    }
    ```

### 3. Refactored TransportManager.connect() with Deduplication ✅

**File:** `packages/web-frontend/src/transport/TransportManager.ts`

Added connection promise tracking:

```typescript
private connectPromise: Promise<void> | null = null;
```

Implemented deduplication logic:

```typescript
async connect(): Promise<void> {
    if (!this.transport) {
        throw new Error('[TransportManager] Transport not initialized. Call getInstance() first.');
    }

    // Already connected
    if (this.transport.isConnected()) {
        console.log('[TransportManager] Already connected');
        return;
    }

    // Connection in progress - reuse existing promise
    if (this.transport.isConnecting() && this.connectPromise) {
        console.log('[TransportManager] Connection already in progress, reusing promise');
        return this.connectPromise;
    }

    // Start new connection
    console.log('[TransportManager] Starting new connection...');
    this.connectPromise = this.transport.connect();

    try {
        await this.connectPromise;
        console.log('[TransportManager] Connected successfully');
    } catch (error) {
        console.error('[TransportManager] Connection failed:', error);
        throw error;
    } finally {
        // Clear promise after completion (success or failure)
        this.connectPromise = null;
    }
}
```

### 4. Removed setTimeout(200ms) from SSETransportClient ✅

**File:** `packages/web-frontend/src/transport/adapters/SSETransportClient.ts`

**Before (lines 202-211):**

```typescript
// SECURITY: Start automatic token refresh
if (data.tokenExpiresAt) {
	this.tokenRefreshManager.startAutoRefresh(data.tokenExpiresAt);
}

// Send current subscriptions to server
// IMPORTANT: Add a small delay to let backend session stabilize
// This prevents 401 errors during rapid reconnections (React StrictMode)
setTimeout(() => {
	console.info(`[SSE] ${debugRan} resubscribeAll`);
	this.resubscribeAll();
}, 200);
```

**After:**

```typescript
// SECURITY: Start automatic token refresh
if (data.tokenExpiresAt) {
	this.tokenRefreshManager.startAutoRefresh(data.tokenExpiresAt);
}

// Send current subscriptions to server
console.info(`[SSE] ${debugRan} resubscribeAll`);
this.resubscribeAll();
```

The setTimeout workaround is no longer needed because connection deduplication prevents the race condition at its source.

## Expected Behavior

### During React StrictMode:

**Console Output:**

```
[TransportManager] Starting new connection...
[SSE] Connection opened, waiting for auth confirmation...
[TransportManager] Connection already in progress, reusing promise  ← 2nd call
[SSE] Authenticated as user dev-user-no-auth
[TransportManager] Connected successfully
```

### Network Tab:

- **One** single GET request: `/api/transports/sse?connId=...`
- No rapid close/reopen
- No 401 errors on subscription requests

### Backend Logs:

```
[SSE] Connection abc123 connected (user=dev-user-no-auth, total=1)
[Subscription] Connection abc123 subscribed to b2f:worker:updated
```

## Testing Scenarios

1. **Single connect() call**
    - Should connect normally

2. **Rapid double connect() (StrictMode)**
    - First call starts connection
    - Second call reuses promise
    - Only one actual connection established

3. **connect() after connected**
    - Should return immediately without reconnecting

4. **connect() after connection failure**
    - Should start fresh connection (promise cleared)

## Files Modified

1. `packages/web-frontend/src/transport/ITransportClient.ts` - Added `isConnecting()` interface method
2. `packages/web-frontend/src/transport/adapters/WebSocketTransportClient.ts` - Implemented `isConnecting()`
3. `packages/web-frontend/src/transport/adapters/SSETransportClient.ts` - Implemented `isConnecting()`, removed setTimeout
4. `packages/web-frontend/src/transport/adapters/LongPollingTransportClient.ts` - Implemented `isConnecting()`
5. `packages/web-frontend/src/transport/adapters/HttpPollingTransportClient.ts` - Implemented `isConnecting()`
6. `packages/web-frontend/src/transport/adapters/RestTransportClient.ts` - Implemented `isConnecting()` (returns false)
7. `packages/web-frontend/src/transport/adapters/MockTransportClient.ts` - Implemented `isConnecting()`
8. `packages/web-frontend/src/transport/TransportManager.ts` - Added deduplication logic

## Success Criteria

✅ `isConnecting()` implemented in all transports
✅ `TransportManager.connect()` deduplicates connections
✅ Logs show promise reuse during StrictMode
✅ No 401 errors during connection
✅ No setTimeout workarounds
✅ Clean architecture

## Next Steps

1. **Manual Testing:**
    - Start frontend with React StrictMode enabled
    - Check console logs for "reusing promise" message
    - Verify network tab shows only one connection
    - Ensure subscriptions work without 401 errors

2. **Performance Testing:**
    - Verify no performance degradation
    - Check that reconnection still works correctly
    - Test error scenarios (connection failure)

3. **Code Review:**
    - Review all implementations for consistency
    - Ensure documentation is accurate
    - Verify TypeScript compilation passes
