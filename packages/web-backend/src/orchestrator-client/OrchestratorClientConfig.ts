/**
 * ===========================================================================================
 * ORCHESTRATOR CLIENT CONFIGURATION
 * ===========================================================================================
 *
 * Configuration types for OrchestratorClient.
 * Supports both library mode and remote mode.
 *
 * ===========================================================================================
 */

/**
 * Base configuration for all modes
 */
export interface BaseOrchestratorClientConfig {
	mode: 'library' | 'remote';
}

/**
 * Library mode configuration
 * Orchestrator runs in-process, direct method calls
 */
export interface LibraryOrchestratorClientConfig extends BaseOrchestratorClientConfig {
	mode: 'library';
	// No additional config needed - orchestrator instance will be injected
}

/**
 * Remote mode configuration
 * Orchestrator runs in separate process, network communication
 */
export interface RemoteOrchestratorClientConfig extends BaseOrchestratorClientConfig {
	mode: 'remote';

	/**
	 * Orchestrator URL (e.g., "http://localhost:3737")
	 */
	url: string;

	/**
	 * Transport mode selection
	 * - 'auto': Try WebSocket → REST+SSE → REST+LongPolling
	 * - 'websocket': Use WebSocket only
	 * - 'rest-sse': Use REST+SSE only
	 * - 'rest-longpolling': Use REST+LongPolling only
	 */
	transportMode?: 'auto' | 'websocket' | 'rest-sse' | 'rest-longpolling';

	/**
	 * Authentication configuration
	 */
	auth?: {
		type: 'none' | 'mtls' | 'token';
		clientCert?: string;
		clientKey?: string;
		caCert?: string;
		token?: string;
	};

	/**
	 * Request timeout in milliseconds
	 */
	requestTimeout?: number;

	/**
	 * Maximum number of retries for failed requests
	 */
	maxRetries?: number;

	/**
	 * WebSocket reconnection delay in milliseconds
	 */
	reconnectDelay?: number;
}

/**
 * Union type for all configuration modes
 */
export type OrchestratorClientConfig = LibraryOrchestratorClientConfig | RemoteOrchestratorClientConfig;

/**
 * Type guard to check if config is library mode
 */
export function isLibraryMode(config: OrchestratorClientConfig): config is LibraryOrchestratorClientConfig {
	return config.mode === 'library';
}

/**
 * Type guard to check if config is remote mode
 */
export function isRemoteMode(config: OrchestratorClientConfig): config is RemoteOrchestratorClientConfig {
	return config.mode === 'remote';
}
