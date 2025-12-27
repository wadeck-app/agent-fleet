# Transport Singleton Pattern - Fixing StrictMode Connection Issues

**Created:** 2025-12-27_12-06
**Status:** Planned (Not Implemented)
**Priority:** Medium
**Related Issue:** React StrictMode causes double connection attempts and error logs

## Problem Statement

Currently, the `TransportProvider` creates a new transport instance on every render and calls `disconnect()` in the cleanup function. In React StrictMode (development), this causes:

1. First mount → `connect()` starts
2. Immediate unmount (StrictMode) → `disconnect()` kills the connection
3. Second mount → `connect()` succeeds

**Logs showing the issue:**

```
[TransportProvider] Connection state: error
[WS] Connection error Event {...}
[TransportProvider] Connection failed: Event {...}
[WS] Connection closed
[TransportProvider] Connection state: reconnecting
[WS] Reconnecting in 1s (attempt 1/10)
[WS] Connection opened, waiting for auth confirmation...
[TransportProvider] Connection state: connected
```

This creates unnecessary error logs and degrades developer experience.

## Current Architecture

**File:** `packages/web-frontend/src/transport/TransportProvider.tsx`

```typescript
export function TransportProvider({ children, autoConnect = true }: TransportProviderProps) {
	// Creates new transport on every render
	const transport = useMemo(() => createTransportClient(mode, port), [mode, port]);

	useEffect(() => {
		// Auto-connect
		if (autoConnect) {
			transport
				.connect()
				.then(() => console.log('[TransportProvider] Connected'))
				.catch(error => console.error('[TransportProvider] Connection failed:', error));
		}

		// Cleanup: disconnect on unmount
		return () => {
			transport.disconnect(); // ⚠️ Problem: kills connection during StrictMode remount
		};
	}, [transport, autoConnect]);
}
```

## Industry Best Practices

### 1. **Singleton Pattern** (Recommended)

Create the transport instance once, outside of component lifecycle:

```typescript
// transport-singleton.ts
let transportInstance: WebSocketTransportClient | null = null;

export function getTransportInstance(mode: TransportMode, port: number): ITransportClient {
	if (!transportInstance) {
		transportInstance = createTransportClient(mode, port);
	}
	return transportInstance;
}

export function resetTransportInstance() {
	transportInstance?.disconnect();
	transportInstance = null;
}
```

**Benefits:**

- Single connection instance across remounts
- No unnecessary disconnects during StrictMode
- Easier to test
- Better performance

### 2. **Connection Ref Pattern**

Use `useRef` to persist connection across remounts:

```typescript
const connectionRef = useRef<ITransportClient | null>(null);

useEffect(() => {
	if (!connectionRef.current) {
		connectionRef.current = createTransportClient(mode, port);
		connectionRef.current.connect();
	}

	return () => {
		// Only cleanup on real unmount
		connectionRef.current?.disconnect();
		connectionRef.current = null;
	};
}, []);
```

**Benefits:**

- Survives StrictMode remounts
- Simple to implement
- Standard React pattern

### 3. **Conditional Cleanup Pattern**

Check connection state before disconnecting:

```typescript
useEffect(() => {
	transport.connect();

	return () => {
		// Only disconnect if connection is established
		if (transport.getConnectionState() === 'connected') {
			transport.disconnect();
		}
	};
}, []);
```

**Benefits:**

- Avoids disconnecting pending connections
- Simple change to existing code

### 4. **Document & Ignore**

Add comment explaining it's normal in development:

```typescript
// Note: In development with React StrictMode, components mount twice.
// This causes a connection attempt, immediate disconnect, then reconnection.
// This is expected behavior and only happens in development.
```

**Benefits:**

- Zero code changes
- Clear documentation

## Recommended Solution: Singleton Pattern

Implement a singleton pattern for the transport instance:

### Implementation Steps

1. **Create transport singleton module** (`transport-singleton.ts`)
2. **Update TransportProvider** to use singleton
3. **Handle mode/port changes** gracefully
4. **Add cleanup on app shutdown** (not component unmount)
5. **Update tests** to reset singleton between tests

### Files to Modify

1. `packages/web-frontend/src/transport/transport-singleton.ts` (NEW)
2. `packages/web-frontend/src/transport/TransportProvider.tsx` (MODIFY)
3. `packages/web-frontend/src/transport/__tests__/TransportProvider.test.tsx` (UPDATE)

### Pseudo-code

```typescript
// transport-singleton.ts
let instance: ITransportClient | null = null;
let currentConfig = { mode: null, port: null };

export function getTransportInstance(mode: TransportMode, port: number): ITransportClient {
	// Recreate if config changed
	if (instance && (currentConfig.mode !== mode || currentConfig.port !== port)) {
		instance.disconnect();
		instance = null;
	}

	if (!instance) {
		instance = createTransportClient(mode, port);
		currentConfig = { mode, port };
	}

	return instance;
}

export function cleanupTransport() {
	instance?.disconnect();
	instance = null;
}

// TransportProvider.tsx
export function TransportProvider({ children, autoConnect = true }: TransportProviderProps) {
	const transport = getTransportInstance(mode, port);

	useEffect(() => {
		if (autoConnect && transport.getConnectionState() === 'disconnected') {
			transport.connect();
		}

		// No cleanup - singleton persists
		return () => {
			// Cleanup only on app shutdown, not component unmount
		};
	}, [transport, autoConnect]);
}
```

## Testing Considerations

1. **Reset singleton between tests:**

    ```typescript
    afterEach(() => {
    	cleanupTransport();
    });
    ```

2. **Test config changes:**
    - Verify disconnect when mode changes
    - Verify reconnect with new config

3. **Test StrictMode behavior:**
    - Verify single connection during remounts
    - Verify no error logs

## Risks & Mitigations

| Risk                                 | Mitigation                                   |
| ------------------------------------ | -------------------------------------------- |
| Singleton makes testing harder       | Provide `resetTransportInstance()` for tests |
| Memory leaks if not cleaned up       | Add cleanup in app-level unmount             |
| Multiple TransportProviders conflict | Document that only one provider should exist |
| Config changes not reflected         | Detect config changes and recreate instance  |

## Alternative: Quick Fix (Document & Ignore)

If we decide singleton is too complex for now, simply document the behavior:

```typescript
// TransportProvider.tsx

/**
 * Note: React StrictMode (development only) causes components to mount twice
 * to detect bugs. This results in:
 * 1. First connection attempt
 * 2. Immediate disconnect (cleanup)
 * 3. Second connection attempt (succeeds)
 *
 * Error logs during step 1-2 are expected and don't affect production.
 */
useEffect(() => {
	// existing code
}, []);
```

## Decision

**Status:** Pending discussion with team

**Options:**

- [ ] Implement full singleton pattern (recommended)
- [ ] Use connection ref pattern (simpler)
- [ ] Document and ignore (no code change)

## References

- React StrictMode: https://react.dev/reference/react/StrictMode
- Singleton Pattern in React: https://kentcdodds.com/blog/application-state-management-with-react
- WebSocket Best Practices: https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications

## Notes

This issue was discovered while implementing worker rename functionality. The error logs were initially mistaken for a real connection problem, which delayed debugging of the actual issue (missing real-time updates for worker renames).

Once this transport singleton issue is resolved, it will improve developer experience and make real connection issues easier to spot.
