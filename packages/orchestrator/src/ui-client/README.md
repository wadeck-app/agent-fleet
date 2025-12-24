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

- Listen to all StateManager events
- Relay to connected UI clients
- Provide methods for sending responses to UI

**Usage:**

```typescript
// In Orchestrator
const hook = new UIClientHook(stateManager);
hook.enable();

// In future UIConnectionManager
hook.on('state_update', update => {
	// Forward to UI WebSocket
	ws.send(JSON.stringify(createUIMessage(UIMessageType.STATE_UPDATE, update)));
});

// Send command result
hook.sendCommandResult('req-123', true, { taskId: 'task-456' });
```

## Protocol Design

### Separation from Worker Protocol

**Worker Protocol** (`src/shared/types.ts`):

- `MessageType`: WORKER_READY, TASK_STARTED, etc.
- Used by: Workers ↔ Orchestrator

**UI Protocol** (`src/orchestrator/ui-client/types.ts`):

- `UIMessageType`: UI_CONNECT, UI_START_FLOW, etc.
- Used by: UI ↔ Orchestrator

**No shared types, no mixing, full type safety.**

### Message Flow

```
┌─────────┐                                    ┌──────────────┐
│   UI    │                                    │ Orchestrator │
│ Backend │                                    │    Core      │
└────┬────┘                                    └──────┬───────┘
     │                                                │
     │ UIConnectMessage                              │
     ├───────────────────────────────────────────────►
     │                                                │
     │                        UIConnectedMessage     │
     │◄───────────────────────────────────────────────┤
     │                                                │
     │ UIRequestSnapshotMessage                      │
     ├───────────────────────────────────────────────►
     │                                                │
     │                         UISnapshotMessage      │
     │◄───────────────────────────────────────────────┤
     │                                                │
     │ UIStartFlowMessage                            │
     ├───────────────────────────────────────────────►
     │                                                │
     │                    UICommandResultMessage      │
     │◄───────────────────────────────────────────────┤
     │                                                │
     │                    UIStateUpdateMessage        │
     │◄───────────────────────────────────────────────┤
     │                    (real-time events)          │
     │                                                │
```

## Configuration

Enable UI client hook in orchestrator:

```bash
export UI_CLIENT_ENABLED=true
```

Or in `.env`:

```
UI_CLIENT_ENABLED=true
```

## Next Steps

When implementing the UI:

1. **Create Web UI Backend** (Express + WebSocket server)
    - Import types from `src/orchestrator/ui-client/types.ts`
    - Use `UIMessageType` for all communication
    - Strong typing throughout

2. **Implement UIConnectionManager** (in orchestrator)
    - Connect to UI backend as WebSocket client
    - Listen to `UIClientHook` events
    - Send/receive using UI protocol

3. **Implement Authentication**
    - Token-based auth in `UIConnectMessage`
    - Command signing (HMAC)
    - Rate limiting

4. **Create Frontend** (React/Vue/Svelte)
    - Connect to UI backend
    - Real-time dashboard
    - Flow visualization

## Type Reusability

The types in `types.ts` are designed to be imported by both:

- **Orchestrator** (this codebase)
- **UI Backend Server** (future separate project)

Example:

```typescript
// In UI backend server (separate project)
// You can copy types.ts or import as a shared package

import {
  UIMessageType,
  UIMessage,
  UIStartFlowMessage
} from '@agent-fleet/ui-protocol'; // Future npm package

// Or just copy the file:
import {
  UIMessageType,
  UIMessage
} from './protocol/types'; // Copied from orchestrator
```

## Testing

Unit tests for this module should cover:

- `createUIMessage()` - Correct timestamp, type
- `parseUIMessage()` - Parsing, validation, error handling
- `isUICommand()` / `isUIResponse()` - Type guards
- `UIClientHook` - Event relaying, enable/disable

Example:

```typescript
import { describe, expect, it } from 'vitest';

import { UIMessageType, createUIMessage } from './types';

describe('UI Protocol', () => {
	it('should create message with timestamp', () => {
		const msg = createUIMessage(UIMessageType.PING, {});
		expect(msg.type).toBe(UIMessageType.PING);
		expect(msg.timestamp).toBeDefined();
	});
});
```
