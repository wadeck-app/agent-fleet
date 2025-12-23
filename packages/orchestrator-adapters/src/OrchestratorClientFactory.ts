/**
 * ===========================================================================================
 * ORCHESTRATOR CLIENT FACTORY
 * ===========================================================================================
 *
 * Factory for creating OrchestratorClient instances.
 * Routes to appropriate adapter based on configuration mode.
 *
 * In library mode, dynamically imports and creates the Orchestrator instance internally.
 * In remote mode, creates a RemoteAdapter that connects to a running orchestrator server.
 *
 * ===========================================================================================
 */
import type { OrchestratorClient } from './OrchestratorClient.js';
import type { OrchestratorClientConfig } from './OrchestratorClientConfig.js';
import { isLibraryMode, isRemoteMode, isTestMode } from './OrchestratorClientConfig.js';
import { createMockOrchestrator } from './__mocks__/MockOrchestrator.js';

/**
 * Factory class for creating OrchestratorClient instances
 */
export class OrchestratorClientFactory {
	/**
	 * Create an OrchestratorClient based on configuration
	 *
	 * @param config - Client configuration (library or remote mode)
	 * @returns Configured OrchestratorClient instance
	 */
	static async create(config: OrchestratorClientConfig): Promise<OrchestratorClient> {
		if (isLibraryMode(config)) {
			// Library mode: import orchestrator dynamically and create instance internally
			// Dynamic import to avoid bundling orchestrator in remote mode builds
			const { Orchestrator } = await import('orchestrator');

			// Create orchestrator instance with provided config
			const orchestrator = new Orchestrator({
				wsPort: config.wsPort || 3738,
				restPort: config.restPort || 3737,
				projectRoot: config.projectRoot,
			});

			// Start the orchestrator
			await orchestrator.start();

			// Import LibraryAdapter dynamically to avoid circular dependencies
			const { LibraryOrchestratorAdapter } = await import('./adapters/LibraryAdapter.js');
			return new LibraryOrchestratorAdapter(orchestrator);
		} else if (isRemoteMode(config)) {
			// Remote mode: network communication
			// Import RemoteAdapter dynamically
			const { RemoteOrchestratorAdapter } = await import('./adapters/RemoteAdapter.js');
			return new RemoteOrchestratorAdapter(config);
		} else if (isTestMode(config)) {
			// Test mode: use mock orchestrator for unit tests
			// No dynamic import of real orchestrator, no side effects (ports, servers)
			const mockOrchestrator = config.mockOrchestrator ?? createMockOrchestrator();

			// Import LibraryAdapter dynamically
			const { LibraryOrchestratorAdapter } = await import('./adapters/LibraryAdapter.js');
			return new LibraryOrchestratorAdapter(mockOrchestrator);
		} else {
			throw new Error(`Unknown orchestrator client mode: ${(config as any).mode}`);
		}
	}
}
