import type { FastifyInstance, FastifyRequest } from 'fastify';
import { createLogger } from 'shared-common/logger';

import type { DataStoreFactory } from './factories';
import { ProductsWebSocketService } from './services/ProductsWebSocketService';

const log = createLogger('ProductsWebSocket');

/**
 * ===========================================================================================
 * PRODUCTS WEBSOCKET ROUTES
 * ===========================================================================================
 *
 * WebSocket endpoint for real-time product updates.
 *
 * Endpoint: GET /api/products/events (WebSocket upgrade)
 *
 * Connection flow:
 * 1. Client connects via WebSocket upgrade
 * 2. Server sends initial snapshot of all products
 * 3. Server broadcasts future product events (created, updated, deleted)
 * 4. Client can send ping messages to keep connection alive
 *
 * Protocol:
 * - Client → Server: { type: 'ping' }
 * - Server → Client: { type: 'pong' }
 * - Server → Client: { type: 'products:snapshot', products: Product[] }
 * - Server → Client: { type: 'product:created', product: Product }
 * - Server → Client: { type: 'product:updated', product: Product }
 * - Server → Client: { type: 'product:deleted', id: string }
 *
 * ===========================================================================================
 */

/**
 * Register products WebSocket routes
 */
export async function registerProductsWebSocketRoutes(
	fastify: FastifyInstance,
	factory: DataStoreFactory
): Promise<void> {
	const wsService = ProductsWebSocketService.getInstance();
	const productsService = factory.getProductsService();

	/**
	 * GET /api/products/events
	 * WebSocket endpoint for real-time product updates
	 */
	fastify.get('/api/products/events', { websocket: true }, async (ws: any, request: FastifyRequest) => {
		log.info('New WebSocket connection for products');

		try {
			// Add connection to service
			wsService.addConnection(ws);

			// Send initial snapshot of all products
			const snapshot = await productsService.list({});
			wsService.sendSnapshot(ws, snapshot.items);

			log.info('Sent initial snapshot to client', { productCount: snapshot.items.length });
		} catch (error) {
			log.error('Error handling WebSocket connection:', error);
			ws.close();
		}
	});

	log.info('Products WebSocket routes registered: GET /api/products/events');
}
