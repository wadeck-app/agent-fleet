# UI Client Module

This module contains the protocol definition and infrastructure for Web UI ↔ Orchestrator communication.

## Purpose

Provide a **completely separate protocol** from the worker protocol, with strong typing for reusability in the UI backend server.

## Files

### `types.ts`

Protocol definition for UI ↔ Orchestrator WebSocket communication.

**Key exports:**

- `UIMessageType` - Enum of all message types
- `UIMessage` - Union type of all messages (for type safety)
- `OrchestratorSnapshot` - Complete state snapshot
- Helper functions: `createUIMessage()`, `parseUIMessage()`

**Usage in UI Backend:**

```typescript
import { UIMessage, UIMessageType, createUIMessage, parseUIMessage } from './types';

// Create a message
const message = createUIMessage<UIStartFlowMessage>(UIMessageType.START_FLOW, {
	requestId: 'req-123',
	flowId: 'my-flow',
	inputs: { foo: 'bar' },
});

// Parse incoming message
const incoming = parseUIMessage(rawJson);
if (incoming.type === UIMessageType.SNAPSHOT) {
	console.log(incoming.snapshot);
}
```

### `UIClientHook.ts`

Hook point for UI client connections.

**Purpose:**

---

_Reference content moved to [docs/reference.md](docs/reference.md)._
