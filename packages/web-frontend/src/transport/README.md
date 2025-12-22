# Transport Layer - Frontend Security Layer (Phase 4)

This module implements the frontend transport layer with automatic cookie-based authentication, token refresh, and server-side event filtering.

## Key Features

- **Automatic cookie-based authentication**: Uses HTTP_ONLY cookies (no token exposure to JavaScript)
- **Automatic token refresh**: Refreshes tokens before expiration via HTTP
- **Server-side event filtering**: Clients only receive events they subscribe to
- **Multiple transport adapters**: WebSocket (real-time), REST (fallback), Mock (testing)
- **Type-safe**: Full TypeScript support with shared types

## Security

- Tokens are NEVER exposed to JavaScript
- HTTP_ONLY cookies for authentication
- Automatic token refresh via HTTP with `credentials: 'include'`
- No tokens in WebSocket messages
- Browser automatically sends cookies during WebSocket upgrade

## Transport Adapters

### WebSocketTransportClient

Real-time bidirectional communication with automatic authentication and reconnection.

```typescript
import { WebSocketTransportClient } from './transport';

const client = new WebSocketTransportClient({
	baseUrl: 'http://localhost:3000',
	wsUrl: 'ws://localhost:3000',
	reconnect: true,
	reconnectMaxAttempts: 10,
});

// Connect (automatic authentication)
await client.connect();

// Make requests
const tasks = await client.request('GET', '/api/tasks/');

// Subscribe to events (server-side filtering)
const unsubscribe = client.subscribe('task:created', task => {
	console.log('New task:', task);
});

// Cleanup
unsubscribe();
await client.disconnect();
```

### RestTransportClient

HTTP/REST fallback for environments without WebSocket support.

```typescript
import { RestTransportClient } from './transport';

const client = new RestTransportClient({
	baseUrl: 'http://localhost:3000',
});

await client.connect();

// Make requests (uses fetch with credentials: 'include')
const tasks = await client.request('GET', '/api/tasks/', {
	query: { status: 'todo' },
});

// Note: No real-time events (use WebSocketTransportClient for that)
```

### MockTransportClient

In-memory mock for testing and Storybook.

```typescript
import { MockTransportClient } from './transport';

const client = new MockTransportClient();

// Configure mock responses
client.mockResponse('GET', '/api/tasks/', {
	body: [{ id: '1', description: 'Task 1' }],
});

// Make request
const tasks = await client.request('GET', '/api/tasks/');
// Returns: [{ id: '1', description: 'Task 1' }]

// Trigger events
client.emit('task:created', { id: '2', description: 'Task 2' });

// Check request history
const history = client.getRequestHistory();
```

## Token Refresh Manager

Handles automatic token refresh before expiration.

```typescript
import { TokenRefreshManager } from './transport';

const refreshManager = new TokenRefreshManager({
	refreshEndpoint: '/api/auth/refresh',
	refreshBeforeExpiry: 60000, // Refresh 1 minute before expiry
	onRefreshSuccess: expiresAt => {
		console.log('Token refreshed, expires at:', expiresAt);
	},
	onRefreshFailed: error => {
		console.error('Token refresh failed:', error);
		// Redirect to login
	},
});

// Start automatic refresh when WebSocket connects
refreshManager.startAutoRefresh(tokenExpiresAt);

// Stop when disconnecting
refreshManager.stopAutoRefresh();
```

## Usage in React Components

```typescript
import { WebSocketTransportClient } from './transport';
import { useEffect, useState } from 'react';

function TaskList() {
  const [client] = useState(() => new WebSocketTransportClient({
    baseUrl: 'http://localhost:3000',
    wsUrl: 'ws://localhost:3000'
  }));

  const [tasks, setTasks] = useState([]);

  useEffect(() => {
    // Connect
    client.connect().catch(console.error);

    // Subscribe to events
    const unsubscribe = client.subscribe('task:created', (task) => {
      setTasks(prev => [...prev, task]);
    });

    // Fetch initial data
    client.request('GET', '/api/tasks/')
      .then(setTasks)
      .catch(console.error);

    // Cleanup
    return () => {
      unsubscribe();
      client.disconnect();
    };
  }, [client]);

  return (
    <ul>
      {tasks.map(task => (
        <li key={task.id}>{task.description}</li>
      ))}
    </ul>
  );
}
```

## Authentication Flow

1. User logs in via HTTP POST `/api/auth/login`
2. Backend sets HTTP_ONLY cookies (`access_token`, `refresh_token`)
3. Frontend connects to WebSocket `/ws`
4. Browser automatically sends cookies during WebSocket upgrade
5. Backend validates cookies and sends `{ type: 'connected', userId, tokenExpiresAt }`
6. Frontend starts automatic token refresh
7. Before expiration, frontend POSTs to `/api/auth/refresh`
8. Backend updates cookies and all WebSocket sessions
9. On token expiration, backend closes WebSocket, frontend redirects to login

## Server Messages

The WebSocket server sends these control messages:

- `{ type: 'connected', userId, tokenExpiresAt }` - Connection successful
- `{ type: 'auth_error', message }` - Authentication failed
- `{ type: 'token_expiring_soon', expiresAt }` - Token expiring, refresh immediately
- `{ type: 'token_expired' }` - Token expired, disconnect
- `{ type: 'subscription_updated', action, events }` - Subscription confirmation

## Testing

All transport clients have comprehensive unit tests:

```bash
npm test -- TokenRefreshManager.test.ts
npm test -- WebSocketTransportClient.test.ts
npm test -- RestTransportClient.test.ts
npm test -- MockTransportClient.test.ts
```

## See Also

- Backend implementation: `packages/web-backend/src/transport/`
- Shared types: `packages/shared-frontend-backend/src/transport/`
- Architecture plan: `.claude/plans/transport-front-back_prop4.md`
