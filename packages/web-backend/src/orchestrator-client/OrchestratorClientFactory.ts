/**
 * ===========================================================================================
 * ORCHESTRATOR CLIENT FACTORY
 * ===========================================================================================
 *
 * Factory for creating OrchestratorClient instances.
 * Routes to appropriate adapter based on configuration mode.
 *
 * ===========================================================================================
 */
import type { OrchestratorClient } from './OrchestratorClient.js';
import type { OrchestratorClientConfig } from './OrchestratorClientConfig.js';
import { isLibraryMode, isRemoteMode } from './OrchestratorClientConfig.js';

/**
 * Orchestrator instance type (from orchestrator package)
 * Using any for now since orchestrator is not a direct dependency
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Orchestrator = any;

/**
 * Factory class for creating OrchestratorClient instances
 */
export class OrchestratorClientFactory {
	/**
	 * Create an OrchestratorClient based on configuration
	 *
	 * @param config - Client configuration (library or remote mode)
	 * @param orchestratorInstance - Required for library mode, ignored for remote mode
	 * @returns Configured OrchestratorClient instance
	 */
	static async create(
		config: OrchestratorClientConfig,
		orchestratorInstance?: Orchestrator
	): Promise<OrchestratorClient> {
		if (isLibraryMode(config)) {
			// Library mode: direct access to orchestrator instance
			if (!orchestratorInstance) {
				throw new Error(
					'Library mode requires orchestratorInstance parameter. ' +
						'Please provide an Orchestrator instance when creating the client.'
				);
			}

			// Import LibraryAdapter dynamically to avoid circular dependencies
			const { LibraryOrchestratorAdapter } = await import('./adapters/LibraryAdapter.js');
			return new LibraryOrchestratorAdapter(orchestratorInstance);
		} else if (isRemoteMode(config)) {
			// Remote mode: network communication
			// Import RemoteAdapter dynamically
			const { RemoteOrchestratorAdapter } = await import('./adapters/RemoteAdapter.js');
			return new RemoteOrchestratorAdapter(config);
		} else {
			throw new Error(`Unknown orchestrator client mode: ${(config as any).mode}`);
		}
	}
}
