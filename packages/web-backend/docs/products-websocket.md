# Products WebSocket API

This document describes the real-time WebSocket endpoint for product updates.

## Endpoint

```
GET /api/products/events
```

Upgrades to WebSocket connection.

## Connection Flow

1. Client initiates WebSocket connection to `/api/products/events`
2. Server authenticates the connection (no auth required in dev mode with `DISABLE_AUTH_DEV=true`)
3. Server sends initial snapshot of all products
4. Server broadcasts future product events (created, updated, deleted)
5. Client can send ping messages to keep connection alive

## Message Protocol

### Client → Server Messages

#### Ping

```json
{
	"type": "ping"
}
```

Server responds with:

```json
{
	"type": "pong"
}
```

### Server → Client Messages

#### Initial Snapshot

Sent immediately after connection is established:

```json
{
	"type": "products:snapshot",
	"products": [
		{
			"id": "prod-1",
			"name": "Product 1",
			"description": "Description 1",
			"category": "electronics",
			"price": 99.99,
			"stock": 10,
			"status": "active",
			"rating": 4.5,
			"featured": true,
			"imageUrl": "https://example.com/image.jpg",
			"version": 1,
			"createdAt": "2025-01-15T10:00:00.000Z",
			"updatedAt": "2025-01-15T10:00:00.000Z"
		}
	]
}
```

#### Product Created

Sent when a new product is created:

```json
{
	"type": "product:created",
	"product": {
		"id": "prod-2",
		"name": "New Product",
		"description": "New Description",
		"category": "clothing",
		"price": 49.99,
		"stock": 5,
		"status": "active",
		"rating": 4.0,
		"featured": false,
		"version": 1,
		"createdAt": "2025-01-15T11:00:00.000Z",
		"updatedAt": "2025-01-15T11:00:00.000Z"
	}
}
```

#### Product Updated

Sent when an existing product is updated:

```json
{
	"type": "product:updated",
	"product": {
		"id": "prod-1",
		"name": "Updated Product",
		"description": "Updated Description",
		"category": "electronics",
		"price": 89.99,
		"stock": 8,
		"status": "active",
		"rating": 4.8,
		"featured": true,
		"version": 2,
		"createdAt": "2025-01-15T10:00:00.000Z",
		"updatedAt": "2025-01-15T12:00:00.000Z"
	}
}
```

#### Product Deleted

Sent when a product is deleted:

```json
{
	"type": "product:deleted",
	"id": "prod-1"
}
```

#### Error

Sent when client sends invalid message:

```json
{
	"type": "error",
	"message": "Invalid message format"
}
```

## Example Client Implementation

### JavaScript/TypeScript

```typescript
const ws = new WebSocket('ws://localhost:3000/api/products/events');

ws.onopen = () => {
	console.log('Connected to products WebSocket');
};

ws.onmessage = event => {
	const message = JSON.parse(event.data);

	switch (message.type) {
		case 'products:snapshot':
			console.log('Initial snapshot:', message.products);
			// Initialize UI with products
			break;

		case 'product:created':
			console.log('Product created:', message.product);
			// Add product to UI
			break;

		case 'product:updated':
			console.log('Product updated:', message.product);
			// Update product in UI
			break;

		case 'product:deleted':
			console.log('Product deleted:', message.id);
			// Remove product from UI
			break;

		case 'pong':
			console.log('Pong received');
			break;

		case 'error':
			console.error('Error:', message.message);
			break;
	}
};

ws.onerror = error => {
	console.error('WebSocket error:', error);
};

ws.onclose = () => {
	console.log('Disconnected from products WebSocket');
};

// Send ping every 30 seconds to keep connection alive
setInterval(() => {
	if (ws.readyState === WebSocket.OPEN) {
		ws.send(JSON.stringify({ type: 'ping' }));
	}
}, 30000);
```

## Architecture

### Components

1. **ProductsWebSocketService** (`services/ProductsWebSocketService.ts`)
    - Singleton service managing WebSocket connections
    - Handles connection lifecycle (connect, disconnect, cleanup)
    - Broadcasts events to all connected clients
    - Supports ping/pong heartbeat protocol

2. **ProductsService** (`services/ProductsService.ts`)
    - Business logic layer for products
    - Broadcasts events after mutations (create, update, delete)
    - Uses ProductsWebSocketService singleton

3. **WebSocket Routes** (`routes-websocket.ts`)
    - Registers WebSocket endpoint `/api/products/events`
    - Handles connection upgrade
    - Sends initial snapshot to new connections

### Event Flow

```
Client connects
    ↓
Server accepts connection
    ↓
ProductsWebSocketService.addConnection()
    ↓
Send products:snapshot
    ↓
Client receives all products
    ↓
[User performs action]
    ↓
ProductsService.create/update/delete()
    ↓
Repository mutation
    ↓
ProductsWebSocketService.broadcast()
    ↓
All connected clients receive event
```

## Testing

### Unit Tests

Run unit tests for WebSocket service:

```bash
npm test ProductsWebSocketService.test.ts
```

### Integration Tests

Run integration tests for service broadcasting:

```bash
npm test ProductsService.websocket.test.ts
```

### Manual Testing

1. Start backend server:

```bash
cd packages/web-backend
npm run dev
```

2. Open browser console and connect:

```javascript
const ws = new WebSocket('ws://localhost:3000/api/products/events');
ws.onmessage = e => console.log(JSON.parse(e.data));
```

3. In another terminal, create a product:

```bash
curl -X POST http://localhost:3000/api/products/ \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Product",
    "description": "Test Description",
    "category": "electronics",
    "price": 99.99,
    "stock": 10,
    "status": "active",
    "rating": 4.5,
    "featured": true
  }'
```

4. Check browser console for `product:created` event

## Security Considerations

1. **Authentication**: WebSocket connections use the same authentication as HTTP requests (cookies)
2. **Rate Limiting**: Consider implementing rate limiting for WebSocket connections
3. **Input Validation**: All client messages are validated before processing
4. **Error Handling**: Errors are logged and sent to client without exposing sensitive data

## Performance Considerations

1. **Connection Limits**: Monitor number of active connections
2. **Broadcast Efficiency**: Events are only sent to open connections
3. **Dead Connection Cleanup**: Closed connections are automatically removed
4. **Memory Management**: Singleton pattern ensures single service instance

## Future Enhancements

- [ ] Add support for filtering events (e.g., only specific categories)
- [ ] Add support for subscribing to specific product IDs
- [ ] Add support for rate limiting per connection
- [ ] Add support for connection authentication with JWT tokens
- [ ] Add metrics for WebSocket connections (Prometheus/Grafana)
