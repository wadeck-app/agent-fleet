/**
 * ===========================================================================================
 * ORCHESTRATOR ADAPTERS PACKAGE
 * ===========================================================================================
 *
 * This package provides adapters for communicating with the Orchestrator:
 * - Library mode: Direct in-process access (embedded orchestrator)
 * - Test mode: Mock orchestrator for unit tests
 *
 * The package has orchestrator as a **peer dependency** for library mode.
 *
 * ===========================================================================================
 */

//FIXME remove me

// Main client interface
export type { OrchestratorClient } from './OrchestratorClient';
export type {
	OrchestratorClientConfig,
	LibraryOrchestratorClientConfig,
	TestOrchestratorClientConfig,
} from './OrchestratorClientConfig';
export { OrchestratorClientFactory } from './OrchestratorClientFactory';

// Testing utilities
// export { MockOrchestratorClient } from './__mocks__/MockOrchestratorClient';
// export { createMockOrchestrator, createMockTask, createMockWorker } from './__mocks__/MockOrchestrator';
// export type { MockOrchestratorOptions } from './__mocks__/MockOrchestrator';
