# TODO: WebSocketTransportClient Test Scenarios

**Status**: Tests temporarily skipped due to MockWebSocket timing issues interfering with integration tests.

**Problem**: The MockWebSocket implementation uses `queueMicrotask()` which has different timing than `setTimeout(fn, 0)`. This causes race conditions in `transport-integration.test.tsx` that depend on specific event timing.

---

## Test Scenarios to Cover

### 1. Connection Management

#### 1.1 Basic Connection

- [ ] Should start in disconnected state
- [ ] Should successfully connect to WebSocket server
- [ ] Should fail connection with authentication error
- [ ] Should timeout if no response within 10s
- [ ] Should emit connection state changes (disconnected → connecting → connected)

#### 1.2 Disconnection

- [ ] Should disconnect successfully
- [ ] Should clean up WebSocket on disconnect
- [ ] Should set state to disconnected after disconnect

#### 1.3 Connection State Tracking

- [ ] Should expose `isConnected()` method
- [ ] Should expose `onConnectionStateChange()` callback registration
- [ ] Should notify all registered callbacks on state change

### 2. Request/Response Flow

#### 2.1 Successful Requests

- [ ] Should send request and receive response
- [ ] Should handle GET requests with path params
- [ ] Should handle POST requests with body
- [ ] Should generate unique request IDs
- [ ] Should match response to request by ID
- [ ] Should return response body on success

#### 2.2 Error Handling

- [ ] Should reject promise on error response (status >= 400)
- [ ] Should timeout requests after 30s
- [ ] Should fail immediately if not connected
- [ ] Should handle malformed responses gracefully
- [ ] Should provide error details (code, message) from server

#### 2.3 Concurrent Requests

- [ ] Should handle multiple concurrent requests
- [ ] Should not mix up responses from different requests
- [ ] Should timeout individual requests independently

### 3. Event Subscriptions

#### 3.1 Subscribe to Events

- [ ] Should send subscription message to server
- [ ] Should register event handler locally
- [ ] Should support multiple handlers for same event
- [ ] Should return unsubscribe function

#### 3.2 Receive Events

- [ ] Should invoke handler when event is received
- [ ] Should pass event data to handler
- [ ] Should handle events with no registered handlers gracefully

#### 3.3 Unsubscribe from Events

- [ ] Should send unsubscription message to server
- [ ] Should remove handler from local registry
- [ ] Should not invoke handler after unsubscribe
- [ ] Should clean up empty event handler arrays

### 4. Token Refresh Integration

#### 4.1 Token Expiring Soon

- [ ] Should call refresh API when receiving token_expiring_soon message
- [ ] Should use correct refresh endpoint
- [ ] Should include credentials in refresh request
- [ ] Should update token expiry on successful refresh

#### 4.2 Token Expired

- [ ] Should disconnect when receiving token_expired message
- [ ] Should clean up connection state
- [ ] Should transition to disconnected state

### 5. Transport Type

- [ ] Should return 'websocket' from getTransportType()

---

## MockWebSocket Implementation Requirements

The mock needs to properly simulate WebSocket behavior:

### Timing Behavior

**CRITICAL**: Must use `setTimeout(fn, 0)` instead of `queueMicrotask(fn)` for connection simulation.

**Why**:

- `queueMicrotask` executes immediately after current call stack
- `setTimeout(fn, 0)` executes after current call stack AND after microtasks
- Integration tests depend on the delayed timing of `setTimeout` for proper React component state updates

### Required Mock Features

1. **Connection Simulation**

    ```typescript
    constructor(url: string) {
        MockWebSocket.instances.push(this);
        setTimeout(() => {
            if (this.readyState === MockWebSocket.CONNECTING) {
                this.readyState = MockWebSocket.OPEN;
                this.onopen?.();
            }
        }, 0); // Use setTimeout, NOT queueMicrotask
    }
    ```

2. **Message Handling**
    - `send(data: string)` - Track sent messages
    - `simulateMessage(data: any)` - Trigger onmessage callback
    - Message format: `{ data: JSON.stringify(payload) }`

3. **State Management**
    - Track readyState (CONNECTING, OPEN, CLOSING, CLOSED)
    - Properly transition states
    - Support state queries

4. **Event Callbacks**
    - `onopen` - Called when connection opens
    - `onmessage` - Called when message received
    - `onerror` - Called on errors
    - `onclose` - Called when connection closes

5. **Test Helpers**
    - `MockWebSocket.getLastInstance()` - Get most recent instance
    - `MockWebSocket.resetInstances()` - Clear instance registry
    - `simulateError(error)` - Trigger error event
    - Track sent messages for verification

### DO NOT Include

-  `waitForOpen()` method - Causes timing issues
-  `queueMicrotask` for async operations - Use `setTimeout(fn, 0)` instead

---

## Integration Test Considerations

These tests must not interfere with:

- `transport-integration.test.tsx` - Full transport integration tests
- Component tests that use transport (TasksPage, useTasks, etc.)

**Isolation Strategy**:

- Use separate mock instances for each test
- Reset MockWebSocket.instances in beforeEach
- Avoid shared state between tests
- Use proper async/await patterns
- Don't rely on specific timing beyond basic event loop behavior

---

## Current Issues

1. **MockWebSocket Timing**: Changed from `setTimeout` to `queueMicrotask`, breaking dependent tests
2. **Integration Test Failures**:
    - transport-integration.test.tsx: 3 tests failing
    - TasksPage.test.tsx: 1 test failing
    - useTasks.test.ts: 1 test failing

3. **Root Cause**: The faster microtask timing changes when React state updates occur, causing:
    - Race conditions in error handling
    - State updates after component unmount
    - Subscription cleanup timing issues

---

## Priority

**HIGH** - These tests are critical for verifying WebSocket transport functionality, but must be fixed carefully to not break integration tests.

**Next Steps**:

1. Revert MockWebSocket to use `setTimeout(fn, 0)`
2. Remove `waitForOpen()` method and its usage
3. Re-enable tests
4. Verify integration tests pass
5. If integration tests still fail, investigate React component timing issues separately

---

## Notes

- WebSocket is not available in jsdom, so mocking is required
- Real WebSocket behavior is async by nature
- Mock timing must closely match real behavior
- Integration tests are more important than unit test speed
