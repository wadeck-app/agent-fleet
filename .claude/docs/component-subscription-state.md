# Component-Level Subscription State Management

## Overview

The WebSocket transport client now supports **component-level subscription state management**, which reduces WebSocket message overhead by merging all component subscription states into a single message.

## Problem

Previously, each component would send individual `subscribe` and `unsubscribe` messages to the server:

```
Component1 mounts → subscribe(task:created)
Component2 mounts → subscribe(task:updated)
Component1 unmounts → unsubscribe(task:created)
```

This resulted in:

- Multiple WebSocket messages
- Complex subscription tracking
- Difficult state reconciliation on reconnection

## Solution

Components now declare their **desired subscription state**, and the transport layer:

1. Merges all component states (union with deduplication)
2. Sends a single `subscription_state` message to the server
3. Automatically recalculates when components mount/unmount

```
Component1 mounts → setComponentSubscriptionState('Component1', [...])
Component2 mounts → setComponentSubscriptionState('Component2', [...])
→ Single merged subscription_state message sent
```

## Architecture

### WebSocketTransportClient

**New Methods:**

1. `setComponentSubscriptionState(componentId, subscriptions)` - Set desired state for a component
2. `removeComponentSubscriptions(componentId)` - Remove component on unmount
3. `syncSubscriptionState()` - Merge all states and send to server (private)
4. `mergeAllComponentStates()` - Deduplicate subscriptions (private)

**State Tracking:**

```typescript
private componentSubscriptions = new Map<string, Array<{ event: string; filters?: Record<string, unknown> }>>();
```

### useRealtimeRefresh Hook

The hook now uses the new API automatically:

```typescript
useRealtimeRefresh({
	events: [B2F_TASK_CREATED, B2F_TASK_UPDATED],
	onEvent: cache.actions.refresh,
	logPrefix: 'TasksPage', // Used as componentId
});
```

**Internally:**

1. Calls `setComponentSubscriptionState(logPrefix, subscriptions)` on mount
2. Calls `removeComponentSubscriptions(logPrefix)` on unmount
3. Still registers local event handlers via `subscribe()` (for handler management)

## Deduplication Logic

Subscriptions are deduplicated by creating a unique key:

```typescript
const key = filters ? `${event}:${JSON.stringify(filters)}` : event;
```

**Examples:**

```typescript
// Same event, no filters → Deduplicated
{ event: 'task:created' }
{ event: 'task:created' }
→ Single subscription

// Same event, different filters → NOT deduplicated
{ event: 'task:updated', filters: { taskId: '123' } }
{ event: 'task:updated', filters: { taskId: '456' } }
→ Two subscriptions

// Same event+filters → Deduplicated
{ event: 'task:updated', filters: { taskId: '123' } }
{ event: 'task:updated', filters: { taskId: '123' } }
→ Single subscription
```

## Backward Compatibility

The legacy `subscribe()` method still works:

```typescript
// Legacy API (still supported)
const unsubscribe = transport.subscribe('b2f:task:created', handler);

// New API (state-based)
transport.setComponentSubscriptionState('Component1', [{ event: 'b2f:task:created' }]);
```

**Reconnection Behavior:**

- If `componentSubscriptions.size > 0`: Use `subscription_state` message
- Otherwise: Fall back to individual `subscribe` messages (legacy)

## Benefits

1. **Reduced Messages**: Single WebSocket message instead of N messages
2. **Automatic Cleanup**: Unlisted events are automatically unsubscribed
3. **Simple Reconciliation**: Single state snapshot on reconnection
4. **Multi-Component Support**: Components declare state independently, transport merges

## Testing

See `WebSocketTransportClient.componentSubscriptions.test.ts` for comprehensive tests:

- Setting component subscription state
- Removing component subscriptions
- Merging multiple component states
- Deduplication logic
- Reconnection behavior
- Backward compatibility

## Message Format

**subscription_state Message:**

```json
{
	"type": "subscription_state",
	"subscriptions": [
		{ "event": "b2f:task:created" },
		{ "event": "b2f:task:updated", "filters": { "taskId": "123" } },
		{ "event": "b2f:worker:heartbeat" }
	]
}
```

**Server Response:**

```json
{
	"type": "subscription_updated",
	"action": "state_updated",
	"count": 3
}
```

## Future Improvements

1. Batch state updates (debounce multiple rapid component mounts)
2. Subscription diff (only send changed subscriptions)
3. Server-side state verification (audit log)
