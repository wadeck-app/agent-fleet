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

// Main client interface
export type { OrchestratorClient } from './OrchestratorClient.js';
export type {
	OrchestratorClientConfig,
	LibraryOrchestratorClientConfig,
	TestOrchestratorClientConfig,
} from './OrchestratorClientConfig.js';
export { OrchestratorClientFactory } from './OrchestratorClientFactory.js';

// Testing utilities
export { MockOrchestratorClient } from './__mocks__/MockOrchestratorClient.js';
export { createMockOrchestrator, createMockTask, createMockWorker } from './__mocks__/MockOrchestrator.js';
export type { MockOrchestratorOptions } from './__mocks__/MockOrchestrator.js';
