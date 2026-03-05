import type { WebSocket } from '@fastify/websocket';
import { createLogger } from 'shared-common/logger';

import type { Product } from '@app/shared/api/products.contract';

const log = createLogger('ProductsWebSocketService');

/**
 * ===========================================================================================
 * PRODUCTS WEBSOCKET SERVICE
 * ===========================================================================================
 *
 * Manages WebSocket connections for real-time product updates.
 *
 * Responsibilities:
 * - Maintain active WebSocket connections
 * - Broadcast product events to all connected clients
 * - Handle connection lifecycle (connect, disconnect, cleanup)
 * - Support ping/pong heartbeat protocol
 *
 * Event types:
 * - product:created - New product created
 * - product:updated - Existing product updated
 * - product:deleted - Product deleted
 * - products:snapshot - Initial snapshot of all products (sent on connection)
 *
 * ===========================================================================================
 */

/**
 * Product event types
 */
export type ProductEvent =
	| { type: 'product:created'; product: Product }
	| { type: 'product:updated'; product: Product }
	| { type: 'product:deleted'; id: string }
	| { type: 'products:snapshot'; products: Product[] };

/**
 * Client message types (from client to server)
 */
type ClientMessage = { type: 'ping' };

/**
 * Server message types (from server to client)
 */
type ServerMessage = ProductEvent | { type: 'pong' } | { type: 'error'; message: string };

/**
 * ProductsWebSocketService - Singleton service for WebSocket connections
 */
export class ProductsWebSocketService {
	private connections: Set<WebSocket> = new Set();
	private static instance: ProductsWebSocketService | null = null;

	private constructor() {
		log.info('ProductsWebSocketService initialized');
	}

	/**
	 * Get singleton instance
	 */
	static getInstance(): ProductsWebSocketService {
		if (!ProductsWebSocketService.instance) {
			ProductsWebSocketService.instance = new ProductsWebSocketService();
		}
		return ProductsWebSocketService.instance;
	}

	/**
	 * Add a new WebSocket connection
	 */
	addConnection(ws: WebSocket): void {
		this.connections.add(ws);
		log.info(`Client connected. Total connections: ${this.connections.size}`);

		// Setup message handler for ping/pong
		ws.on('message', (message: Buffer) => {
			try {
				const data = JSON.parse(message.toString()) as ClientMessage;

				if (data.type === 'ping') {
					this.sendToClient(ws, { type: 'pong' });
				}
			} catch (error) {
				log.error('Error parsing client message:', error);
				this.sendToClient(ws, { type: 'error', message: 'Invalid message format' });
			}
		});

		// Setup disconnect handler
		ws.on('close', () => {
			this.removeConnection(ws);
		});

		// Setup error handler
		ws.on('error', (error: Error) => {
			log.error('WebSocket error:', error);
			this.removeConnection(ws);
		});
	}

	/**
	 * Remove a WebSocket connection
	 */
	removeConnection(ws: WebSocket): void {
		if (this.connections.delete(ws)) {
			log.info(`Client disconnected. Total connections: ${this.connections.size}`);
		}
	}

	/**
	 * Send message to a specific client
	 */
	private sendToClient(ws: WebSocket, message: ServerMessage): void {
		try {
			if (ws.readyState === ws.OPEN) {
				ws.send(JSON.stringify(message));
			}
		} catch (error) {
			log.error('Error sending message to client:', error);
		}
	}

	/**
	 * Broadcast event to all connected clients
	 */
	broadcast(event: ProductEvent): void {
		log.debug(`Broadcasting event: ${event.type}`, { connections: this.connections.size });

		const deadConnections: WebSocket[] = [];

		for (const ws of this.connections) {
			try {
				if (ws.readyState === ws.OPEN) {
					ws.send(JSON.stringify(event));
				} else {
					// Connection is no longer open, mark for removal
					deadConnections.push(ws);
				}
			} catch (error) {
				log.error('Error broadcasting to client:', error);
				deadConnections.push(ws);
			}
		}

		// Clean up dead connections
		for (const ws of deadConnections) {
			this.removeConnection(ws);
		}
	}

	/**
	 * Send initial snapshot to a specific client
	 */
	sendSnapshot(ws: WebSocket, products: Product[]): void {
		this.sendToClient(ws, {
			type: 'products:snapshot',
			products,
		});
		log.debug(`Sent snapshot with ${products.length} products to client`);
	}

	/**
	 * Get current connection count (for monitoring/testing)
	 */
	getConnectionCount(): number {
		return this.connections.size;
	}

	/**
	 * Close all connections (for cleanup during shutdown)
	 */
	closeAll(): void {
		log.info(`Closing all WebSocket connections (${this.connections.size})`);

		for (const ws of this.connections) {
			try {
				ws.close();
			} catch (error) {
				log.error('Error closing connection:', error);
			}
		}

		this.connections.clear();
		log.info('All WebSocket connections closed');
	}

	/**
	 * Reset singleton instance (for testing)
	 */
	static resetInstance(): void {
		if (ProductsWebSocketService.instance) {
			ProductsWebSocketService.instance.closeAll();
			ProductsWebSocketService.instance = null;
		}
	}
}
