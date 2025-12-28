# Transport Singleton Implementation - Complete

**Created:** 2025-12-28_16-00
**Status:** Implemented
**Priority:** High
**Related Plan:** `.claude/plans/2025-12-27_12-06-transport-singleton-strictmode.md`

## Summary

Successfully implemented the singleton pattern for TransportManager to decouple transport lifecycle from React component lifecycle. This fixes the issue where React StrictMode's double-mounting caused unwanted disconnections.

## Problem Solved

**Before:**
- `TransportProvider` created new transport on every render
- Called `disconnect()` in cleanup, causing StrictMode to disconnect during remount
- Front B (SSE mode) would connect but immediately disconnect during StrictMode remount
- When Front A broadcasts an event, Front B is no longer connected (total=0 connections)

**After:**
- Singleton pattern: Single transport instance across app lifetime
- Cleanup only unsubscribes listeners, does NOT call disconnect()
- Transport persists across React remounts
- Front B stays connected and receives broadcasts from Front A

## Implementation Details

### 1. Created `TransportManager.ts` (Singleton)

**Location:** `packages/web-frontend/src/transport/TransportManager.ts`

**Features:**
- Singleton pattern with `getInstance()` method
- ConnId management (generates/persists in sessionStorage)
- Config change detection (recreates transport when mode/baseUrl changes)
- Safe `connect()` method (won't reconnect if already connected)
- `cleanup()` method for tests and app shutdown

**Key Methods:**
```typescript
// Get singleton instance
TransportManager.getInstance(config: TransportManagerConfig): TransportManager

// Get transport client
getTransport(): ITransportClient

// Get or create connId (unique per tab)
getConnId(): string

// Connect (safe to call multiple times)
connect(): Promise<void>

// Disconnect (only for tests/shutdown)
disconnect(): Promise<void>

// Cleanup singleton (for tests)
static cleanup(): Promise<void>
```

### 2. Refactored `TransportProvider.tsx`

**Changes:**
- Uses `TransportManager.getInstance()` instead of creating transport directly
- Gets transport and connId from manager
- Cleanup does NOT call `disconnect()` - only unsubscribes listeners
- Updated `switchTransport()` to work with singleton

**Key Code:**
```typescript
// Initialize singleton (persists across remounts)
const transportManager = useMemo(() => {
  const savedMode = localStorage.getItem('transport_mode') as TransportMode;
  const mode: TransportMode = savedMode || 'auto';

  return TransportManager.getInstance({
    mode,
    baseUrl,
    wsUrl: wsUrl || baseUrl.replace(/^http/, 'ws'),
    customTransport,
  });
}, [baseUrl, wsUrl, customTransport]);

// Get transport and connId from manager
const transport = transportManager.getTransport();
const connId = transportManager.getConnId();

// Cleanup: ONLY unsubscribe listeners, NOT disconnect!
return () => {
  console.log('[TransportProvider] Cleaning up listeners (NOT disconnecting - singleton persists)');
  unsubscribeConnectionState();
  window.removeEventListener('auth:failed', handleAuthFailed);
  window.removeEventListener('auth:token_expired', handleTokenExpired);
  window.removeEventListener('auth:refresh_failed', handleRefreshFailed);
};
```

### 3. Updated Tests

**TransportManager.test.ts:**
- Comprehensive tests for singleton pattern
- ConnId management tests
- Config change detection tests
- StrictMode compatibility tests

**TransportProvider.test.tsx:**
- Added cleanup between tests (`TransportManager.cleanup()`)
- Updated cleanup test to verify disconnect is NOT called on unmount
- Added sessionStorage clear in beforeEach

### 4. Transport Adapters

**No changes needed!** All transport adapters already get connId from sessionStorage:
- `WebSocketTransportClient.ts`
- `SSETransportClient.ts`
- `LongPollingTransportClient.ts`
- `HttpPollingTransportClient.ts`

They all use: `sessionStorage.getItem('agent_fleet_conn_id')`

### 5. Exported from Index

**Location:** `packages/web-frontend/src/transport/index.ts`

Added exports:
```typescript
export { TransportManager } from './TransportManager';
export type { TransportManagerConfig, TransportMode } from './TransportManager';
```

## Files Created/Modified

### Created:
1. `packages/web-frontend/src/transport/TransportManager.ts` (316 lines)
2. `packages/web-frontend/src/transport/TransportManager.test.ts` (380 lines)
3. `.claude/plans/2025-12-28_16-00_transport-singleton-implementation.md` (this file)

### Modified:
1. `packages/web-frontend/src/transport/TransportProvider.tsx`
   - Removed `getOrCreateConnId()` and `createTransportClient()` functions (moved to TransportManager)
   - Updated to use TransportManager singleton
   - Updated cleanup to NOT call disconnect()

2. `packages/web-frontend/src/transport/TransportProvider.test.tsx`
   - Added TransportManager import
   - Added cleanup between tests
   - Updated cleanup test to verify disconnect is NOT called

3. `packages/web-frontend/src/transport/index.ts`
   - Added TransportManager exports

## Testing

### Unit Tests
- All existing TransportProvider tests pass
- New TransportManager tests cover:
  - Singleton pattern
  - ConnId management
  - Config change detection
  - Connection management
  - StrictMode compatibility

### Manual Testing Required

**Test Scenario 1: StrictMode Connection Persistence**
1. Ensure React StrictMode is enabled in `main.tsx`
2. Open Front B in SSE mode
3. Check console logs - should see only ONE connection attempt
4. Front B should stay connected (no disconnect during remount)

**Test Scenario 2: Multi-Tab Broadcast**
1. Open Front A in one tab
2. Open Front B in another tab (SSE mode)
3. Front A creates/updates a worker
4. Front B should receive the broadcast event
5. Backend logs should show "Broadcasting to N clients" where N > 0

**Test Scenario 3: Transport Switching**
1. Start with WebSocket mode
2. Switch to SSE mode using TransportModeSelector
3. Should disconnect WebSocket and create SSE transport
4. Should reconnect successfully
5. Events should still work

**Test Scenario 4: ConnId Persistence**
1. Refresh the page multiple times
2. Check sessionStorage - should see same connId across refreshes
3. Open new tab - should get NEW connId (unique per tab)

## Verification Commands

```bash
# Run all checks (TypeScript + ESLint)
npm run check

# Run transport tests only
npm run test:agent -- --grep TransportManager
npm run test:agent -- --grep TransportProvider

# Run all frontend tests
npm run test:agent:frontend

# Build to verify no compile errors
npm run build
```

## Benefits

1. **StrictMode Compatible**: Transport survives React remounts without disconnecting
2. **Cleaner Code**: Centralized transport management in singleton
3. **Better Testing**: Easy to cleanup singleton between tests
4. **Multi-Tab Support**: Each tab gets unique connId (sessionStorage)
5. **Config Change Detection**: Automatically recreates transport when config changes
6. **Safe Reconnection**: `connect()` won't reconnect if already connected

## Risks Mitigated

| Risk | Mitigation |
|------|-----------|
| Memory leaks | Added `cleanup()` method for tests/shutdown |
| Multiple instances | Singleton pattern ensures single instance |
| StrictMode disconnects | Cleanup does NOT call disconnect() |
| Config changes not reflected | Detects config changes and recreates transport |
| ConnId collision | Uses sessionStorage (unique per tab) |

## Next Steps

1. ✅ Implementation complete
2. ⏳ Manual testing with React StrictMode enabled
3. ⏳ Verify multi-tab broadcast scenario
4. ⏳ Monitor production for any issues

## Notes

- The singleton persists for the entire app lifetime (or until cleanup is called)
- Only cleanup on:
  - Test teardown (`afterEach()`)
  - App shutdown (`window.onbeforeunload`)
  - Manual logout
- DO NOT call `TransportManager.cleanup()` during normal app usage
- The connId in sessionStorage is managed by TransportManager but accessed directly by transport adapters

## References

- Original Plan: `.claude/plans/2025-12-27_12-06-transport-singleton-strictmode.md`
- React StrictMode: https://react.dev/reference/react/StrictMode
- Singleton Pattern: https://kentcdodds.com/blog/application-state-management-with-react
