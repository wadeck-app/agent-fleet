/**
 * ===========================================================================================
 * ORCHESTRATOR CLIENT CONFIGURATION
 * ===========================================================================================
 *
 * Configuration types for OrchestratorClient.
 * Supports library mode (embedded orchestrator) and test mode (mocked orchestrator).
 *
 * ===========================================================================================
 */

/**
 * Base configuration for all modes
 */
export interface BaseOrchestratorClientConfig {
	mode: 'library' | 'test';
}

/**
 * Library mode configuration
 * Orchestrator runs in-process, direct method calls
 */
export interface LibraryOrchestratorClientConfig extends BaseOrchestratorClientConfig {
	mode: 'library';

	/**
	 * WebSocket port for worker connections
	 * @default 3738
	 */
	wsPort?: number;

	/**
	 * REST API port for orchestrator
	 * @default 3737
	 */
	restPort?: number;

	/**
	 * Project root directory
	 * @default process.cwd()
	 */
	projectRoot?: string;

	/**
	 * Disable REST API server when embedded in backend
	 * @default false
	 */
	libraryMode?: boolean;
}

/**
 * Test mode configuration
 * Orchestrator is mocked for unit tests, no real orchestrator instance
 */
export interface TestOrchestratorClientConfig extends BaseOrchestratorClientConfig {
	mode: 'test';

	/**
	 * Optional mock orchestrator instance for custom test scenarios
	 * If not provided, a default mock will be used
	 */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	mockOrchestrator?: any;
}

/**
 * Union type for all configuration modes
 */
export type OrchestratorClientConfig = LibraryOrchestratorClientConfig | TestOrchestratorClientConfig;

/**
 * Type guard to check if config is library mode
 */
export function isLibraryMode(config: OrchestratorClientConfig): config is LibraryOrchestratorClientConfig {
	return config.mode === 'library';
}

/**
 * Type guard to check if config is test mode
 */
export function isTestMode(config: OrchestratorClientConfig): config is TestOrchestratorClientConfig {
	return config.mode === 'test';
}
