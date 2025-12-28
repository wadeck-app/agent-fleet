/**
 * Transport Manager - Singleton Pattern
 *
 * Manages the transport client instance independently of React component lifecycle.
 * This prevents unwanted disconnections caused by React StrictMode's double-mounting.
 *
 * Key Features:
 * - Singleton pattern: Single transport instance across app lifetime
 * - ConnId management: Generates and persists unique connection ID per tab
 * - Config change detection: Recreates transport when mode/baseUrl changes
 * - StrictMode compatible: Survives React remounts without disconnecting
 *
 * Problem Solved:
 * Before: TransportProvider created new transport on every render and called disconnect()
 *         in cleanup, causing StrictMode to disconnect during remount.
 * After: Singleton persists across remounts, cleanup only unsubscribes listeners.
 *
 * @example
 * ```typescript
 * // Get singleton instance
 * const manager = TransportManager.getInstance({
 *   mode: 'sse',
 *   baseUrl: 'http://localhost:3030',
 *   wsUrl: 'ws://localhost:3030'
 * });
 *
 * // Connect (safe to call multiple times)
 * await manager.connect();
 *
 * // Get transport client
 * const transport = manager.getTransport();
 * transport.subscribe('b2f:task:created', handler);
 *
 * // Get connId (unique per tab)
 * const connId = manager.getConnId();
 *
 * // Cleanup (for tests or app shutdown)
 * await TransportManager.cleanup();
 * ```
 */
import type { ITransportClient } from './ITransportClient';
import { HttpPollingTransportClient } from './adapters/HttpPollingTransportClient';
import { LongPollingTransportClient } from './adapters/LongPollingTransportClient';
import { MockTransportClient } from './adapters/MockTransportClient';
import { RestTransportClient } from './adapters/RestTransportClient';
import { SSETransportClient } from './adapters/SSETransportClient';
import { WebSocketTransportClient } from './adapters/WebSocketTransportClient';

export type TransportMode = 'auto' | 'websocket' | 'sse' | 'long-polling' | 'http-polling' | 'rest' | 'mock';

/**
 * Transport Manager Configuration
 */
export interface TransportManagerConfig {
	/**
	 * Transport mode to use
	 */
	mode: TransportMode;

	/**
	 * Base URL for the backend API
	 */
	baseUrl: string;

	/**
	 * WebSocket URL (if different from baseUrl)
	 */
	wsUrl: string;

	/**
	 * Custom transport instance (for testing)
	 * If provided, mode/baseUrl/wsUrl are ignored
	 */
	customTransport?: ITransportClient;
}

/**
 * Transport Manager Singleton
 *
 * Manages transport lifecycle independently of React component lifecycle.
 */
export class TransportManager {
	/**
	 * Singleton instance
	 */
	private static instance: TransportManager | null = null;

	/**
	 * Current transport client
	 */
	private transport: ITransportClient | null = null;

	/**
	 * Current configuration
	 */
	private currentConfig: TransportManagerConfig | null = null;

	/**
	 * Connection ID (unique per tab)
	 * Generated once and persisted in sessionStorage
	 */
	private connId: string | null = null;

	/**
	 * Connection promise for deduplication
	 * Stores the ongoing connection promise to prevent multiple simultaneous connections
	 */
	private connectPromise: Promise<void> | null = null;

	/**
	 * Private constructor (singleton pattern)
	 */
	private constructor() {}

	/**
	 * Get or create singleton instance
	 *
	 * If config changes (mode/baseUrl), disconnects old transport and creates new one.
	 *
	 * @param config - Transport configuration
	 * @returns TransportManager singleton instance
	 */
	static getInstance(config: TransportManagerConfig): TransportManager {
		if (!TransportManager.instance) {
			TransportManager.instance = new TransportManager();
		}

		// Check if config changed
		const instance = TransportManager.instance;
		const configChanged = instance.hasConfigChanged(config);

		if (configChanged) {
			console.log('[TransportManager] Config changed, recreating transport');
			// Disconnect old transport (but don't clear connId)
			if (instance.transport) {
				instance.transport.disconnect().catch(error => {
					console.error('[TransportManager] Failed to disconnect old transport:', error);
				});
			}
			instance.transport = null;
			instance.currentConfig = null;
		}

		// Create transport if needed
		if (!instance.transport) {
			instance.currentConfig = config;
			instance.transport = instance.createTransport(config);
		}

		return instance;
	}

	/**
	 * Get transport client instance
	 *
	 * @returns Transport client instance
	 * @throws Error if transport not initialized
	 */
	getTransport(): ITransportClient {
		if (!this.transport) {
			throw new Error('[TransportManager] Transport not initialized. Call getInstance() first.');
		}
		return this.transport;
	}

	/**
	 * Get or create connection ID (unique per tab)
	 *
	 * ConnId is generated once per tab and persisted in sessionStorage.
	 * This enables proper multi-tab support:
	 * - Each tab has unique connId
	 * - Backend can exclude broadcast to specific tab (prevent echo)
	 * - Survives React StrictMode remounts
	 *
	 * @returns Connection ID
	 */
	getConnId(): string {
		if (this.connId) {
			return this.connId;
		}

		// Try to get existing connId from sessionStorage
		const CONN_ID_KEY = 'agent_fleet_conn_id';
		const existingConnId = sessionStorage.getItem(CONN_ID_KEY);

		if (existingConnId) {
			console.log('[TransportManager] Using existing connId:', existingConnId.substring(0, 8) + '...');
			this.connId = existingConnId;
			return existingConnId;
		}

		// Generate new connId
		const newConnId = crypto.randomUUID();
		sessionStorage.setItem(CONN_ID_KEY, newConnId);
		console.log('[TransportManager] Generated new connId:', newConnId.substring(0, 8) + '...');
		this.connId = newConnId;
		return newConnId;
	}

	/**
	 * Connect to transport server with deduplication
	 *
	 * Safe to call multiple times - will deduplicate concurrent connection attempts.
	 * If a connection is already in progress, returns the existing promise instead of
	 * starting a new connection. This prevents race conditions during React StrictMode.
	 *
	 * @returns Promise that resolves when connected
	 */
	async connect(): Promise<void> {
		if (!this.transport) {
			throw new Error('[TransportManager] Transport not initialized. Call getInstance() first.');
		}

		// Already connected
		if (this.transport.isConnected()) {
			console.log('[TransportManager] Already connected');
			return;
		}

		// Connection in progress - reuse existing promise
		if (this.transport.isConnecting() && this.connectPromise) {
			console.log('[TransportManager] Connection already in progress, reusing promise');
			return this.connectPromise;
		}

		// Start new connection
		console.log('[TransportManager] Starting new connection...');
		this.connectPromise = this.transport.connect();

		try {
			await this.connectPromise;
			console.log('[TransportManager] Connected successfully');
		} catch (error) {
			console.error('[TransportManager] Connection failed:', error);
			throw error;
		} finally {
			// Clear promise after completion (success or failure)
			this.connectPromise = null;
		}
	}

	/**
	 * Disconnect from transport server
	 *
	 * Note: In normal app usage, you should NOT call this.
	 * The singleton persists across React remounts.
	 * Only call this for:
	 * - Testing (cleanup between tests)
	 * - App shutdown (window.onbeforeunload)
	 * - Manual user action (logout)
	 *
	 * @returns Promise that resolves when disconnected
	 */
	async disconnect(): Promise<void> {
		if (!this.transport) {
			return;
		}

		console.log('[TransportManager] Disconnecting...');
		await this.transport.disconnect();
		console.log('[TransportManager] Disconnected');
	}

	/**
	 * Cleanup singleton (for tests or app shutdown)
	 *
	 * Disconnects transport and resets singleton instance.
	 * Clears connId from sessionStorage.
	 */
	static async cleanup(): Promise<void> {
		if (TransportManager.instance) {
			await TransportManager.instance.disconnect();
			TransportManager.instance.transport = null;
			TransportManager.instance.currentConfig = null;
			TransportManager.instance.connId = null;
			TransportManager.instance = null;

			// Clear connId from sessionStorage
			sessionStorage.removeItem('agent_fleet_conn_id');
			console.log('[TransportManager] Cleanup complete');
		}
	}

	/**
	 * Check if config has changed
	 *
	 * @param newConfig - New configuration
	 * @returns True if config changed
	 */
	private hasConfigChanged(newConfig: TransportManagerConfig): boolean {
		if (!this.currentConfig) {
			return false; // No previous config, not a change
		}

		// Custom transport always considered "changed" to force recreation
		if (newConfig.customTransport || this.currentConfig.customTransport) {
			return true;
		}

		// Check if mode or URLs changed
		return (
			this.currentConfig.mode !== newConfig.mode ||
			this.currentConfig.baseUrl !== newConfig.baseUrl ||
			this.currentConfig.wsUrl !== newConfig.wsUrl
		);
	}

	/**
	 * Create transport client based on config
	 *
	 * @param config - Transport configuration
	 * @returns Transport client instance
	 */
	private createTransport(config: TransportManagerConfig): ITransportClient {
		// Use custom transport if provided
		if (config.customTransport) {
			console.log('[TransportManager] Using custom transport');
			return config.customTransport;
		}

		console.log('[TransportManager] Creating transport client with mode:', config.mode);

		switch (config.mode) {
			case 'websocket':
				return new WebSocketTransportClient({
					baseUrl: config.baseUrl,
					wsUrl: config.wsUrl,
					reconnect: true,
					reconnectMaxAttempts: 10,
					reconnectDelay: 1000,
					connectionTimeout: 10000,
					requestTimeout: 30000,
				});

			// case 'rest':
			// 	return new RestTransportClient({ baseUrl: config.baseUrl });
			//
			// case 'mock':
			// 	return new MockTransportClient();

			case 'sse':
				return new SSETransportClient({
					baseUrl: config.baseUrl,
					wsUrl: '', // Not used for SSE
					reconnect: true,
					reconnectMaxAttempts: 10,
					reconnectDelay: 1000,
					connectionTimeout: 10000,
					requestTimeout: 30000,
				});

			case 'long-polling':
				return new LongPollingTransportClient({
					baseUrl: config.baseUrl,
					wsUrl: '', // Not used for long polling
					reconnect: true,
					reconnectMaxAttempts: 10,
					reconnectDelay: 1000,
					connectionTimeout: 10000,
					requestTimeout: 30000,
				});

			case 'http-polling':
				return new HttpPollingTransportClient({
					baseUrl: config.baseUrl,
					wsUrl: '', // Not used for HTTP polling
					reconnect: false, // HTTP polling doesn't reconnect (just keeps polling)
					reconnectMaxAttempts: 0,
					reconnectDelay: 0,
					connectionTimeout: 10000,
					requestTimeout: 30000,
					pollInterval: 5000, // Poll every 5 seconds
				});

			case 'auto':
			default:
				// Auto mode: Try WebSocket first
				return new WebSocketTransportClient({
					baseUrl: config.baseUrl,
					wsUrl: config.wsUrl,
					reconnect: true,
					reconnectMaxAttempts: 10,
					reconnectDelay: 1000,
					connectionTimeout: 10000,
					requestTimeout: 30000,
				});
		}
	}
}
