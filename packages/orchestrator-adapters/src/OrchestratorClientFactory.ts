/**
 * ===========================================================================================
 * ORCHESTRATOR CLIENT FACTORY
 * ===========================================================================================
 *
 * Factory for creating OrchestratorClient instances.
 * Routes to appropriate adapter based on configuration mode.
 *
 * In library mode, dynamically imports and creates the Orchestrator instance internally.
 * In test mode, creates a mock orchestrator for unit tests.
 *
 * Port calculation (when not explicitly provided):
 * - wsPort: calculated from WORKSPACE_ID/PROJECT_ID
 * - restPort: calculated from WORKSPACE_ID/PROJECT_ID
 *
 * ===========================================================================================
 */
import { getOrchestratorPortsFromEnv } from 'shared-common/PortCalculator.js';

import type { OrchestratorClient } from './OrchestratorClient.js';
import type { OrchestratorClientConfig } from './OrchestratorClientConfig.js';
import { isLibraryMode, isTestMode } from './OrchestratorClientConfig.js';
import { createMockOrchestrator } from './__mocks__/MockOrchestrator.js';

/**
 * Factory class for creating OrchestratorClient instances
 */
export class OrchestratorClientFactory {
	/**
	 * Create an OrchestratorClient based on configuration
	 *
	 * @param config - Client configuration (library or test mode)
	 * @returns Configured OrchestratorClient instance
	 */
	static async create(config: OrchestratorClientConfig): Promise<OrchestratorClient> {
		if (isLibraryMode(config)) {
			// Library mode: import orchestrator dynamically and create instance internally
			// Dynamic import to avoid bundling orchestrator in remote mode builds
			const { Orchestrator } = await import('orchestrator');

			// Calculate ports if not explicitly provided
			let wsPort = config.wsPort;
			let restPort = config.restPort;

			if (wsPort === undefined || restPort === undefined) {
				const { wsPort: calculatedWsPort, restPort: calculatedRestPort } = getOrchestratorPortsFromEnv();
				wsPort = wsPort ?? calculatedWsPort;
				restPort = restPort ?? calculatedRestPort;
			}

			const orchestratorConfig = {
				wsPort,
				restPort,
				projectRoot: config.projectRoot,
				libraryMode: config.libraryMode ?? false, // Always include libraryMode
			};
			const orchestrator = new Orchestrator(orchestratorConfig);

			// Start the orchestrator
			await orchestrator.start();

			// Import LibraryAdapter dynamically to avoid circular dependencies
			const { LibraryOrchestratorAdapter } = await import('./adapters/LibraryAdapter.js');
			return new LibraryOrchestratorAdapter(orchestrator);
		} else if (isTestMode(config)) {
			// Test mode: use mock orchestrator for unit tests
			// No dynamic import of real orchestrator, no side effects (ports, servers)
			const mockOrchestrator = config.mockOrchestrator ?? createMockOrchestrator();

			// Import LibraryAdapter dynamically
			const { LibraryOrchestratorAdapter } = await import('./adapters/LibraryAdapter.js');
			return new LibraryOrchestratorAdapter(mockOrchestrator);
		} else {
			throw new Error(`Unknown orchestrator client mode: ${(config as Record<string, unknown>).mode}`);
		}
	}
}
