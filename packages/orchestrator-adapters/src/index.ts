/**
 * ===========================================================================================
 * ORCHESTRATOR ADAPTERS PACKAGE
 * ===========================================================================================
 *
 * This package provides adapters for communicating with the Orchestrator in both:
 * - Library mode: Direct in-process access (LibraryAdapter)
 * - Remote mode: Network communication via transport layer (RemoteAdapter)
 *
 * The package has orchestrator as an **optional peer dependency**, allowing:
 * - Library mode: orchestrator must be installed
 * - Remote mode: orchestrator not needed (just transport client)
 *
 * ===========================================================================================
 */

// Main client interface
export type { OrchestratorClient } from './OrchestratorClient.js';
export type {
	OrchestratorClientConfig,
	LibraryOrchestratorClientConfig,
	RemoteOrchestratorClientConfig,
	TestOrchestratorClientConfig,
} from './OrchestratorClientConfig.js';
export { OrchestratorClientFactory } from './OrchestratorClientFactory.js';

// Adapters (exports will be added as we implement them)
// export { LibraryOrchestratorAdapter } from './adapters/LibraryAdapter.js';
// export { RemoteOrchestratorAdapter } from './adapters/RemoteAdapter.js';

// Transport layer (exports will be added as we implement them)
// export type { OrchestratorTransport } from './transport/OrchestratorTransport.js';
// export { TransportFactory } from './transport/TransportFactory.js';

// Testing utilities
export { MockOrchestratorClient } from './__mocks__/MockOrchestratorClient.js';
export { createMockOrchestrator, createMockTask, createMockWorker } from './__mocks__/MockOrchestrator.js';
export type { MockOrchestratorOptions } from './__mocks__/MockOrchestrator.js';
export { ControllableTimeService } from './transport/TimeService.js';
export type { TimeService } from './transport/TimeService.js';

// WebSocket transport and reconnection event types
export type { ReconnectingEvent, ReconnectedEvent, ReconnectFailedEvent } from './transport/WebSocketTransport.js';
