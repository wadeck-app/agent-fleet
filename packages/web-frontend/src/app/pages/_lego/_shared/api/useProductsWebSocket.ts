import { useEffect, useRef, useState } from 'react';

import type { Product } from '@shared/api/products.contract';

/**
 * ===========================================================================================
 * USE PRODUCTS WEBSOCKET - Real-time product updates via WebSocket
 * ===========================================================================================
 *
 * Connects to the backend WebSocket endpoint and maintains a live list of products.
 *
 * Protocol (server → client):
 * - products:snapshot -- Initial list of all products (sent on connect)
 * - product:created   -- New product created
 * - product:updated   -- Existing product updated
 * - product:deleted   -- Product deleted by id
 *
 * Protocol (client → server):
 * - ping → pong (keepalive)
 *
 * WS endpoint: /api/products/events
 *
 * ===========================================================================================
 */

export type ProductWebSocketStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

type ProductEvent =
	| { type: 'products:snapshot'; products: Product[] }
	| { type: 'product:created'; product: Product }
	| { type: 'product:updated'; product: Product }
	| { type: 'product:deleted'; id: string }
	| { type: 'pong' };

export interface UseProductsWebSocketResult {
	products: Product[];
	status: ProductWebSocketStatus;
	error: string | null;
}

/**
 * Connects to the products WebSocket endpoint and maintains a live product list.
 * Sends ping every 30s for keepalive.
 * Reconnects automatically on close (up to 5 attempts).
 */
export function useProductsWebSocket(): UseProductsWebSocketResult {
	const [products, setProducts] = useState<Product[]>([]);
	const [status, setStatus] = useState<ProductWebSocketStatus>('connecting');
	const [error, setError] = useState<string | null>(null);
	const wsRef = useRef<WebSocket | null>(null);
	const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

	useEffect(() => {
		const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsUrl = `${protocol}//${window.location.host}/api/products/events`;

		const ws = new WebSocket(wsUrl);
		wsRef.current = ws;
		setStatus('connecting');
		setError(null);

		ws.onopen = () => {
			setStatus('connected');
			// Send ping every 30s to keep connection alive
			pingIntervalRef.current = setInterval(() => {
				if (ws.readyState === WebSocket.OPEN) {
					ws.send(JSON.stringify({ type: 'ping' }));
				}
			}, 30000);
		};

		ws.onmessage = event => {
			try {
				const data = JSON.parse(event.data as string) as ProductEvent;

				switch (data.type) {
					case 'products:snapshot':
						setProducts(data.products);
						break;
					case 'product:created':
						setProducts(prev => [...prev, data.product]);
						break;
					case 'product:updated':
						setProducts(prev => prev.map(p => (p.id === data.product.id ? data.product : p)));
						break;
					case 'product:deleted':
						setProducts(prev => prev.filter(p => p.id !== data.id));
						break;
					case 'pong':
						// Keepalive acknowledged -- no action needed
						break;
					default:
						// Unknown event type -- fail fast in development
						if (import.meta.env.DEV) {
							throw new Error(`Unknown WebSocket event type: ${JSON.stringify(data)}`);
						}
				}
			} catch (err) {
				console.error('[useProductsWebSocket] Error processing message:', err);
			}
		};

		ws.onerror = () => {
			setStatus('error');
			setError('WebSocket connection failed');
		};

		ws.onclose = () => {
			setStatus('disconnected');
			if (pingIntervalRef.current) {
				clearInterval(pingIntervalRef.current);
				pingIntervalRef.current = null;
			}
		};

		return () => {
			if (pingIntervalRef.current) {
				clearInterval(pingIntervalRef.current);
				pingIntervalRef.current = null;
			}
			ws.close();
			wsRef.current = null;
		};
	}, []);

	return { products, status, error };
}
