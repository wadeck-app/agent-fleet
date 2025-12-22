/**
 * ===========================================================================================
 * TRANSPORT FACTORY - AUTO-FALLBACK TRANSPORT CREATION
 * ===========================================================================================
 *
 * Factory for creating orchestrator transport instances with automatic fallback.
 * Tries WebSocket → REST+SSE → REST+LongPolling until a working transport is found.
 *
 * Features:
 * - Automatic transport selection ('auto' mode)
 * - Explicit transport mode selection
 * - Fallback chain with connection testing
 * - Timeout handling for connection attempts
 *
 * Supported modes:
 * - 'auto': Try WebSocket → REST+SSE → Long-polling
 * - 'websocket': WebSocket only (fail if unavailable)
 * - 'rest-sse': REST+SSE only (fail if unavailable)
 * - 'rest-longpolling': Long-polling only (always works)
 *
 * @example
 * ```typescript
 * // Auto-fallback mode (recommended)
 * const transport = await TransportFactory.create({
 *   url: 'http://localhost:3737',
 *   mode: 'auto',
 * });
 *
 * // Explicit mode
 * const wsTransport = await TransportFactory.create({
 *   url: 'ws://localhost:3737/ws',
 *   mode: 'websocket',
 * });
 * ```
 *
 * ===========================================================================================
 */
import type { OrchestratorTransport } from './OrchestratorTransport.js';
import { RestLongPollingTransport } from './RestLongPollingTransport.js';
import { RestSseTransport } from './RestSseTransport.js';
import { WebSocketTransport } from './WebSocketTransport.js';

/**
 * Transport mode
 */
export type TransportMode = 'auto' | 'websocket' | 'rest-sse' | 'rest-longpolling';

/**
 * Transport factory configuration
 */
export interface TransportFactoryConfig {
	/** Base URL (HTTP or WS) */
	url: string;
	/** Transport mode (default: 'auto') */
	mode?: TransportMode;
	/** Connection timeout per attempt in ms (default: 5000) */
	connectionTimeout?: number;
}

/**
 * Transport Factory
 *
 * Creates transport instances with automatic fallback.
 */
export class TransportFactory {
	/**
	 * Create a transport instance
	 *
	 * @param config - Transport configuration
	 * @returns Connected transport instance
	 * @throws Error if no transport could be established
	 *
	 * @example
	 * ```typescript
	 * const transport = await TransportFactory.create({
	 *   url: 'http://localhost:3737',
	 *   mode: 'auto',
	 * });
	 * ```
	 */
	static async create(config: TransportFactoryConfig): Promise<OrchestratorTransport> {
		const mode = config.mode ?? 'auto';
		const connectionTimeout = config.connectionTimeout ?? 5000;

		if (mode === 'auto') {
			return this.createWithFallback(config, connectionTimeout);
		}

		switch (mode) {
			case 'websocket':
				return this.createWebSocket(config, connectionTimeout);

			case 'rest-sse':
				return this.createRestSse(config, connectionTimeout);

			case 'rest-longpolling':
				return this.createRestLongPolling(config, connectionTimeout);

			default:
				throw new Error(`Unknown transport mode: ${mode}`);
		}
	}

	/**
	 * Create transport with automatic fallback
	 * Tries: WebSocket → REST+SSE → Long-polling
	 *
	 * @param config - Transport configuration
	 * @param timeout - Connection timeout per attempt
	 * @returns Connected transport instance
	 */
	private static async createWithFallback(
		config: TransportFactoryConfig,
		timeout: number
	): Promise<OrchestratorTransport> {
		const errors: Array<{ mode: string; error: Error }> = [];

		// Try WebSocket
		try {
			console.log('[TransportFactory] Attempting WebSocket connection...');
			return await this.createWebSocket(config, timeout);
		} catch (error) {
			errors.push({ mode: 'websocket', error: error as Error });
			console.log('[TransportFactory] WebSocket failed, trying REST+SSE');
		}

		// Try REST+SSE
		try {
			console.log('[TransportFactory] Attempting REST+SSE connection...');
			return await this.createRestSse(config, timeout);
		} catch (error) {
			errors.push({ mode: 'rest-sse', error: error as Error });
			console.log('[TransportFactory] REST+SSE failed, trying Long-polling');
		}

		// Try Long-polling (most compatible)
		try {
			console.log('[TransportFactory] Attempting Long-polling connection...');
			return await this.createRestLongPolling(config, timeout);
		} catch (error) {
			errors.push({ mode: 'rest-longpolling', error: error as Error });
		}

		// All transports failed
		const errorSummary = errors.map(e => `${e.mode}: ${e.error.message}`).join(', ');
		throw new Error(`Failed to establish connection with any transport. Errors: ${errorSummary}`);
	}

	/**
	 * Create and connect WebSocket transport
	 *
	 * @param config - Transport configuration
	 * @param timeout - Connection timeout
	 * @returns Connected WebSocket transport
	 */
	private static async createWebSocket(
		config: TransportFactoryConfig,
		timeout: number
	): Promise<OrchestratorTransport> {
		// Convert HTTP URL to WS URL if needed
		const wsUrl = this.convertToWebSocketUrl(config.url);

		const transport = new WebSocketTransport({
			url: wsUrl,
			requestTimeout: 30000,
			pingInterval: 30000,
		});

		await this.connectWithTimeout(transport, timeout);
		console.log('[TransportFactory] ✓ WebSocket transport connected');

		return transport;
	}

	/**
	 * Create and connect REST+SSE transport
	 *
	 * @param config - Transport configuration
	 * @param timeout - Connection timeout
	 * @returns Connected REST+SSE transport
	 */
	private static async createRestSse(
		config: TransportFactoryConfig,
		timeout: number
	): Promise<OrchestratorTransport> {
		const httpUrl = this.convertToHttpUrl(config.url);

		const transport = new RestSseTransport({
			baseUrl: httpUrl,
			requestTimeout: 30000,
		});

		await this.connectWithTimeout(transport, timeout);
		console.log('[TransportFactory] ✓ REST+SSE transport connected');

		return transport;
	}

	/**
	 * Create and connect REST+LongPolling transport
	 *
	 * @param config - Transport configuration
	 * @param timeout - Connection timeout
	 * @returns Connected REST+LongPolling transport
	 */
	private static async createRestLongPolling(
		config: TransportFactoryConfig,
		timeout: number
	): Promise<OrchestratorTransport> {
		const httpUrl = this.convertToHttpUrl(config.url);

		const transport = new RestLongPollingTransport({
			baseUrl: httpUrl,
			requestTimeout: 30000,
			pollTimeout: 30,
		});

		await this.connectWithTimeout(transport, timeout);
		console.log('[TransportFactory] ✓ Long-polling transport connected');

		return transport;
	}

	/**
	 * Connect transport with timeout
	 *
	 * @param transport - Transport to connect
	 * @param timeout - Timeout in milliseconds
	 * @throws Error if connection times out
	 */
	private static async connectWithTimeout(transport: OrchestratorTransport, timeout: number): Promise<void> {
		const timeoutPromise = new Promise<never>((_, reject) => {
			setTimeout(() => reject(new Error(`Connection timeout after ${timeout}ms`)), timeout);
		});

		await Promise.race([transport.connect(), timeoutPromise]);
	}

	/**
	 * Convert URL to WebSocket URL
	 *
	 * @param url - HTTP or WS URL
	 * @returns WebSocket URL
	 *
	 * @example
	 * 'http://localhost:3737' → 'ws://localhost:3737/ws'
	 * 'https://orch.example.com' → 'wss://orch.example.com/ws'
	 * 'ws://localhost:3737/ws' → 'ws://localhost:3737/ws'
	 */
	private static convertToWebSocketUrl(url: string): string {
		if (url.startsWith('ws://') || url.startsWith('wss://')) {
			return url;
		}

		// Convert HTTP to WS
		const wsUrl = url.replace(/^http:\/\//, 'ws://').replace(/^https:\/\//, 'wss://');

		// Add /ws endpoint if not present
		return wsUrl.endsWith('/ws') ? wsUrl : `${wsUrl}/orchestrator/ws`;
	}

	/**
	 * Convert URL to HTTP URL
	 *
	 * @param url - HTTP or WS URL
	 * @returns HTTP URL
	 *
	 * @example
	 * 'ws://localhost:3737/ws' → 'http://localhost:3737'
	 * 'wss://orch.example.com/ws' → 'https://orch.example.com'
	 * 'http://localhost:3737' → 'http://localhost:3737'
	 */
	private static convertToHttpUrl(url: string): string {
		if (url.startsWith('http://') || url.startsWith('https://')) {
			// Remove /ws endpoint if present
			return url.replace(/\/ws$/, '').replace(/\/orchestrator\/ws$/, '');
		}

		// Convert WS to HTTP
		const httpUrl = url.replace(/^ws:\/\//, 'http://').replace(/^wss:\/\//, 'https://');

		// Remove /ws endpoint if present
		return httpUrl.replace(/\/ws$/, '').replace(/\/orchestrator\/ws$/, '');
	}
}
