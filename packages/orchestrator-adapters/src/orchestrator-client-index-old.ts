/**
 * Orchestrator Client module
 * Provides unified interface for Backend → Orchestrator communication
 */

export { type OrchestratorClient } from './OrchestratorClient.js';
export {
	type OrchestratorClientConfig,
	type LibraryOrchestratorClientConfig,
	type RemoteOrchestratorClientConfig,
	isLibraryMode,
	isRemoteMode,
} from './OrchestratorClientConfig.js';
export { OrchestratorClientFactory } from './OrchestratorClientFactory.js';
