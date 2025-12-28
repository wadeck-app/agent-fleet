# Architecture Unifiée des Transports - Proposition

**Date:** 2025-12-27_20-30
**Status:** Proposition

## Problèmes Actuels

### 1. Endpoints Incohérents

**Problème :** Tous les endpoints ne commencent pas par `/api`

```
❌ ACTUEL (production broken):
/ws                          → WebSocket
/sse                         → SSE
/sse/subscription            → SSE subscriptions
/long-polling/events         → Long polling
/long-polling/subscription   → Long polling subscriptions

✅ DEVRAIT ÊTRE:
/api/transports/ws           → WebSocket
/api/transports/sse          → SSE
/api/transports/long-polling → Long polling
/api/transports/simple-polling → Simple polling (nouveau)
/api/transports/subscriptions → Subscriptions (unifié)
```

### 2. Endpoints de Subscription Dupliqués

```
❌ ACTUEL:
POST /sse/subscription           → SSE subscription
POST /long-polling/subscription  → Long polling subscription
WebSocket message {type: 'subscription'} → WS subscription

✅ PROPOSITION:
POST   /api/transports/subscriptions        → Batch subscribe/unsubscribe
POST   /api/transports/subscriptions/:event → Single subscribe
DELETE /api/transports/subscriptions/:event → Single unsubscribe
WebSocket message {type: 'subscription'}    → WS reste inchangé (bidirectionnel)
```

---

## Solution Proposée

### Architecture Globale

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    UNIFIED TRANSPORT API ARCHITECTURE                    │
└─────────────────────────────────────────────────────────────────────────┘

                            /api/transports/*
                                    │
                    ┌───────────────┼───────────────────┐
                    │               │                   │
            ┌───────▼──────┐  ┌────▼──────┐  ┌────────▼──────────┐
            │ Event Streams│  │Subscriptions│  │ Health/Status    │
            └──────────────┘  └─────────────┘  └──────────────────┘
                    │               │                   │
        ┌───────────┼───────┐       │           /api/transports/status
        │           │       │       │
    /ws /sse  /long-polling │  /simple-polling
                            │
                /api/transports/subscriptions
                            │
            ┌───────────────┼───────────────┐
            │               │               │
    POST (batch)    POST/:event    DELETE/:event
```

---

## Endpoints Détaillés

### 1. Event Streams (Real-time + Polling)

```typescript
// WebSocket (bidirectionnel)
GET /api/transports/ws?connId={clientId}
→ Upgrade to WebSocket
→ Auth via cookies
→ Bidirectional communication

// SSE (unidirectionnel, real-time)
GET /api/transports/sse
→ Stream: text/event-stream
→ Auth via cookies
→ Server pushes events

// Long Polling (unidirectionnel, held connection)
GET /api/transports/long-polling
→ Connection held up to 30s
→ Auth via cookies
→ Returns events or empty after timeout

// Simple Polling (unidirectionnel, immediate response)
GET /api/transports/simple-polling
→ Immediate response
→ Auth via cookies
→ Returns pending events from queue
→ Client polls every 5-10s
```

### 2. Subscriptions (Unified API)

#### Batch Subscribe/Unsubscribe

```typescript
POST /api/transports/subscriptions
Content-Type: application/json

Body:
{
    "action": "subscribe" | "unsubscribe",
    "events": [
        "b2f:task:created",
        "b2f:task:updated",
        "b2f:worker:*"
    ],
    "filters": {
        "b2f:task:created": { "priority": "high" },
        "b2f:task:updated": { "status": "pending" }
    }
}

Response:
{
    "success": true,
    "subscribed": ["b2f:task:created", "b2f:task:updated", "b2f:worker:*"],
    "filters": { ... }
}
```

#### Single Event Subscribe

```typescript
POST /api/transports/subscriptions/:event
Content-Type: application/json

Example: POST /api/transports/subscriptions/b2f:task:created

Body:
{
    "filters": {
        "priority": "high",
        "assignee": "user-123"
    }
}

Response:
{
    "success": true,
    "event": "b2f:task:created",
    "filters": { "priority": "high", "assignee": "user-123" }
}
```

#### Single Event Unsubscribe

```typescript
DELETE /api/transports/subscriptions/:event

Example: DELETE /api/transports/subscriptions/b2f:task:created

Response:
{
    "success": true,
    "event": "b2f:task:created",
    "unsubscribed": true
}
```

#### Get Current Subscriptions

```typescript
GET /api/transports/subscriptions

Response:
{
    "subscriptions": [
        {
            "event": "b2f:task:created",
            "filters": { "priority": "high" }
        },
        {
            "event": "b2f:worker:*",
            "filters": {}
        }
    ],
    "transportType": "sse" | "long-polling" | "websocket" | "simple-polling"
}
```

### 3. Transport Status & Health

```typescript
GET /api/transports/status

Response:
{
    "clientId": "conn-abc-123",
    "userId": "user-456",
    "transportType": "sse",
    "connected": true,
    "authenticatedAt": 1703...,
    "lastActivity": 1703...,
    "subscriptions": ["b2f:task:*", "b2f:worker:updated"],
    "queuedEvents": 3
}
```

---

## WebSocket - Cas Spécial

WebSocket reste **inchangé** car bidirectionnel :

```typescript
// Subscribe via WebSocket message
{
    "type": "subscription",
    "action": "subscribe",
    "events": [
        "b2f:task:created",
        "b2f:worker:*"
    ],
    "filters": {
        "b2f:task:created": { "priority": "high" }
    }
}

// Response via WebSocket
{
    "type": "subscription_updated",
    "action": "subscribe",
    "events": ["b2f:task:created", "b2f:worker:*"],
    "filters": { ... }
}
```

**Pourquoi pas unifier ?**

- WebSocket peut envoyer/recevoir des messages directement
- Pas besoin d'HTTP POST/DELETE supplémentaires
- Garde la simplicité du protocole WebSocket

---

## Implémentation Backend

### Unified Subscription Controller

```typescript
// packages/web-backend/src/controllers/TransportsController.ts

export class TransportsController {
	constructor(
		private sessionManager: TransportSessionManager,
		private messageQueue: MessageQueue
	) {}

	// POST /api/transports/subscriptions (batch)
	async batchSubscriptions(request: FastifyRequest, reply: FastifyReply) {
		const clientId = this.getClientIdFromCookie(request);
		const session = this.sessionManager.getSession(clientId);

		if (!session) {
			return reply.code(401).send({ error: 'Not authenticated' });
		}

		const { action, events, filters } = request.body as {
			action: 'subscribe' | 'unsubscribe';
			events: string[];
			filters?: Record<string, unknown>;
		};

		// Update subscriptions (central method)
		this.sessionManager.updateSubscriptions(clientId, action, events, filters);

		return {
			success: true,
			subscribed: Array.from(session.subscribedEvents),
			filters: Object.fromEntries(session.eventFilters),
		};
	}

	// POST /api/transports/subscriptions/:event (single)
	async subscribeToEvent(request: FastifyRequest, reply: FastifyReply) {
		const clientId = this.getClientIdFromCookie(request);
		const { event } = request.params as { event: string };
		const { filters } = request.body as { filters?: Record<string, unknown> };

		const session = this.sessionManager.getSession(clientId);
		if (!session) {
			return reply.code(401).send({ error: 'Not authenticated' });
		}

		// Subscribe to single event
		this.sessionManager.updateSubscriptions(clientId, 'subscribe', [event], filters);

		return {
			success: true,
			event,
			filters: session.eventFilters.get(event) || {},
		};
	}

	// DELETE /api/transports/subscriptions/:event
	async unsubscribeFromEvent(request: FastifyRequest, reply: FastifyReply) {
		const clientId = this.getClientIdFromCookie(request);
		const { event } = request.params as { event: string };

		const session = this.sessionManager.getSession(clientId);
		if (!session) {
			return reply.code(401).send({ error: 'Not authenticated' });
		}

		// Unsubscribe from single event
		this.sessionManager.updateSubscriptions(clientId, 'unsubscribe', [event]);

		return {
			success: true,
			event,
			unsubscribed: true,
		};
	}

	// GET /api/transports/subscriptions
	async getSubscriptions(request: FastifyRequest, reply: FastifyReply) {
		const clientId = this.getClientIdFromCookie(request);
		const session = this.sessionManager.getSession(clientId);

		if (!session) {
			return reply.code(401).send({ error: 'Not authenticated' });
		}

		return {
			subscriptions: Array.from(session.subscribedEvents).map(event => ({
				event,
				filters: session.eventFilters.get(event) || {},
			})),
			transportType: session.transportType,
		};
	}

	// GET /api/transports/status
	async getStatus(request: FastifyRequest, reply: FastifyReply) {
		const clientId = this.getClientIdFromCookie(request);
		const session = this.sessionManager.getSession(clientId);

		if (!session) {
			return reply.code(401).send({ error: 'Not authenticated' });
		}

		// Check queued events
		const queuedEvents = this.messageQueue.peek(clientId);

		return {
			clientId: session.clientId,
			userId: session.userId,
			transportType: session.transportType,
			connected: true,
			authenticatedAt: session.authenticatedAt,
			lastActivity: session.lastActivity,
			subscriptions: Array.from(session.subscribedEvents),
			queuedEvents: queuedEvents.length,
		};
	}
}
```

### Routes Registration

```typescript
// packages/web-backend/src/routes.ts
import { TransportsController } from './controllers/TransportsController';

export function registerRoutes(app: FastifyInstance, factory: DataStoreFactory) {
	const transportsController = new TransportsController(factory.getSessionManager(), factory.getMessageQueue());

	// Subscriptions
	app.post('/api/transports/subscriptions', (req, reply) => transportsController.batchSubscriptions(req, reply));
	app.post('/api/transports/subscriptions/:event', (req, reply) => transportsController.subscribeToEvent(req, reply));
	app.delete('/api/transports/subscriptions/:event', (req, reply) =>
		transportsController.unsubscribeFromEvent(req, reply)
	);
	app.get('/api/transports/subscriptions', (req, reply) => transportsController.getSubscriptions(req, reply));

	// Status
	app.get('/api/transports/status', (req, reply) => transportsController.getStatus(req, reply));
}
```

---

## Implémentation Frontend

### Unified Subscription API

```typescript
// packages/web-frontend/src/transport/TransportClient.ts

export interface ITransportClient {
	// ... existing methods

	// New unified subscription methods
	subscribeBatch(events: string[], filters?: Record<string, Record<string, unknown>>): Promise<void>;

	subscribeToEvent(event: string, filters?: Record<string, unknown>): Promise<void>;

	unsubscribeFromEvent(event: string): Promise<void>;

	getSubscriptions(): Promise<Subscription[]>;

	getTransportStatus(): Promise<TransportStatus>;
}
```

### Implementation for SSE/Long Polling/Simple Polling

```typescript
// packages/web-frontend/src/transport/adapters/SSETransportClient.ts

export class SSETransportClient extends EventEmitter implements ITransportClient {
	// ... existing code

	async subscribeBatch(events: string[], filters?: Record<string, Record<string, unknown>>): Promise<void> {
		const response = await fetch(`${this.config.baseUrl}/api/transports/subscriptions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			credentials: 'include',
			body: JSON.stringify({
				action: 'subscribe',
				events,
				filters,
			}),
		});

		if (!response.ok) {
			throw new Error(`Subscription failed: ${response.status}`);
		}

		const result = await response.json();
		console.log(`[SSE] Subscribed to ${result.subscribed.length} events`);
	}

	async subscribeToEvent(event: string, filters?: Record<string, unknown>): Promise<void> {
		const response = await fetch(
			`${this.config.baseUrl}/api/transports/subscriptions/${encodeURIComponent(event)}`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				credentials: 'include',
				body: JSON.stringify({ filters }),
			}
		);

		if (!response.ok) {
			throw new Error(`Subscription failed: ${response.status}`);
		}

		console.log(`[SSE] Subscribed to ${event}`);
	}

	async unsubscribeFromEvent(event: string): Promise<void> {
		const response = await fetch(
			`${this.config.baseUrl}/api/transports/subscriptions/${encodeURIComponent(event)}`,
			{
				method: 'DELETE',
				credentials: 'include',
			}
		);

		if (!response.ok) {
			throw new Error(`Unsubscription failed: ${response.status}`);
		}

		console.log(`[SSE] Unsubscribed from ${event}`);
	}

	async getSubscriptions(): Promise<Subscription[]> {
		const response = await fetch(`${this.config.baseUrl}/api/transports/subscriptions`, {
			method: 'GET',
			credentials: 'include',
		});

		if (!response.ok) {
			throw new Error(`Failed to get subscriptions: ${response.status}`);
		}

		const result = await response.json();
		return result.subscriptions;
	}

	async getTransportStatus(): Promise<TransportStatus> {
		const response = await fetch(`${this.config.baseUrl}/api/transports/status`, {
			method: 'GET',
			credentials: 'include',
		});

		if (!response.ok) {
			throw new Error(`Failed to get status: ${response.status}`);
		}

		return await response.json();
	}
}
```

---

## Migration Plan

### Phase 1: Backend - Add Unified Endpoints (Keep Old Ones)

1. Create `TransportsController`
2. Register routes:
    - `POST /api/transports/subscriptions`
    - `POST /api/transports/subscriptions/:event`
    - `DELETE /api/transports/subscriptions/:event`
    - `GET /api/transports/subscriptions`
    - `GET /api/transports/status`
3. **Keep old endpoints** for backward compatibility:
    - `POST /sse/subscription` → redirect to new
    - `POST /long-polling/subscription` → redirect to new

### Phase 2: Frontend - Update Clients

1. Update `ITransportClient` interface
2. Implement new methods in:
    - `SSETransportClient`
    - `LongPollingTransportClient`
    - `SimplePollingTransportClient` (new)
3. Update `subscribe()` method to use new API
4. Add deprecation warnings for old methods

### Phase 3: Update Event Stream Endpoints

1. **Rename endpoints** (with redirects):
    - `/ws` → `/api/transports/ws` (with 301 redirect)
    - `/sse` → `/api/transports/sse` (with 301 redirect)
    - `/long-polling/events` → `/api/transports/long-polling` (with 301 redirect)

2. **Add new endpoint**:
    - `/api/transports/simple-polling` (new implementation)

### Phase 4: Remove Deprecated Endpoints

1. Remove old subscription endpoints:
    - `POST /sse/subscription` ❌
    - `POST /long-polling/subscription` ❌
2. Remove old event stream redirects
3. Update documentation

---

## Benefits

### 1. Consistency

✅ All endpoints start with `/api/transports/*`
✅ Production-safe routing
✅ Clear separation from other API routes

### 2. Simplicity

✅ Single subscription API for all transports (except WebSocket)
✅ RESTful design (POST/DELETE/GET)
✅ Batch operations support

### 3. Discoverability

✅ `GET /api/transports/subscriptions` → see current subscriptions
✅ `GET /api/transports/status` → see transport state
✅ Self-documenting API structure

### 4. Extensibility

✅ Easy to add new transport types
✅ Easy to add new subscription features (filters, priorities, etc.)
✅ Easy to add transport-level features (reconnection policies, etc.)

---

## Backward Compatibility

### Option 1: Redirects (Recommended)

```typescript
// Keep old endpoints with 308 redirect
app.post('/sse/subscription', (req, reply) => {
	reply.redirect(308, '/api/transports/subscriptions');
});

app.post('/long-polling/subscription', (req, reply) => {
	reply.redirect(308, '/api/transports/subscriptions');
});
```

### Option 2: Dual Implementation (Transitional)

```typescript
// Both old and new endpoints call the same controller
app.post('/sse/subscription', (req, reply) => transportsController.batchSubscriptions(req, reply));
app.post('/api/transports/subscriptions', (req, reply) => transportsController.batchSubscriptions(req, reply));
```

---

## Testing Strategy

### Unit Tests

```typescript
describe('TransportsController', () => {
	describe('POST /api/transports/subscriptions', () => {
		it('should subscribe to multiple events', async () => {
			const response = await request(app)
				.post('/api/transports/subscriptions')
				.send({
					action: 'subscribe',
					events: ['b2f:task:created', 'b2f:worker:*'],
				});

			expect(response.status).toBe(200);
			expect(response.body.subscribed).toContain('b2f:task:created');
		});

		it('should support filters', async () => {
			const response = await request(app)
				.post('/api/transports/subscriptions')
				.send({
					action: 'subscribe',
					events: ['b2f:task:created'],
					filters: {
						'b2f:task:created': { priority: 'high' },
					},
				});

			expect(response.body.filters['b2f:task:created']).toEqual({ priority: 'high' });
		});
	});

	describe('POST /api/transports/subscriptions/:event', () => {
		it('should subscribe to single event', async () => {
			const response = await request(app)
				.post('/api/transports/subscriptions/b2f:task:created')
				.send({ filters: { priority: 'high' } });

			expect(response.status).toBe(200);
			expect(response.body.event).toBe('b2f:task:created');
		});
	});

	describe('DELETE /api/transports/subscriptions/:event', () => {
		it('should unsubscribe from event', async () => {
			const response = await request(app).delete('/api/transports/subscriptions/b2f:task:created');

			expect(response.status).toBe(200);
			expect(response.body.unsubscribed).toBe(true);
		});
	});
});
```

### Integration Tests

```typescript
describe('Transport Subscriptions E2E', () => {
	it('should work across all transport types', async () => {
		// Test SSE
		const sseClient = new SSETransportClient(config);
		await sseClient.connect();
		await sseClient.subscribeBatch(['b2f:task:*']);

		// Test Long Polling
		const lpClient = new LongPollingTransportClient(config);
		await lpClient.connect();
		await lpClient.subscribeBatch(['b2f:worker:*']);

		// Both should receive events
		// ...
	});
});
```

---

## Documentation Updates

### API Reference

```markdown
# Transport API Reference

## Subscriptions

### Subscribe to Events (Batch)

`POST /api/transports/subscriptions`

Subscribe to multiple events at once.

**Body:**
\`\`\`json
{
"action": "subscribe",
"events": ["b2f:task:created", "b2f:worker:*"],
"filters": {
"b2f:task:created": { "priority": "high" }
}
}
\`\`\`

### Subscribe to Single Event

`POST /api/transports/subscriptions/:event`

Subscribe to a single event with optional filters.

### Unsubscribe from Event

`DELETE /api/transports/subscriptions/:event`

Unsubscribe from a specific event.

### Get Current Subscriptions

`GET /api/transports/subscriptions`

Returns list of current subscriptions.
```

---

## Next Steps

1. ✅ Add `/api` prefix rule to lessons-learned
2. ⬜ Create `TransportsController`
3. ⬜ Implement unified subscription endpoints
4. ⬜ Implement `SimplePollingTransportServer`
5. ⬜ Update frontend clients
6. ⬜ Add integration tests
7. ⬜ Update documentation
8. ⬜ Migrate existing code
9. ⬜ Remove deprecated endpoints

---

**Status:** Ready for implementation
**Estimated Effort:** 2-3 days
**Priority:** Medium-High (improves architecture, fixes production routing)
