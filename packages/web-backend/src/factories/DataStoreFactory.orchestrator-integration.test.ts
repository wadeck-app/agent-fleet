import { Orchestrator } from 'orchestrator';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DataStoreFactory } from './DataStoreFactory';

/**
 * ===========================================================================================
 * DATA STORE FACTORY - ORCHESTRATOR INTEGRATION TESTS
 * ===========================================================================================
 *
 * Test Strategy:
 * - Test that BackendEventBridge is properly connected to OrchestratorEventHandler
 * - Test that events from orchestrator are routed to the handler
 * - Mock the orchestrator and verify handler is called
 *
 * ===========================================================================================
 */

describe('DataStoreFactory - Orchestrator Integration', () => {
	let factory: DataStoreFactory;
	let mockOrchestrator: Orchestrator;

	beforeEach(() => {
		// Create a mock orchestrator with minimal setup
		mockOrchestrator = new Orchestrator({
			wsPort: 9999,
			projectRoot: process.cwd(),
			libraryMode: true,
		});

		factory = new DataStoreFactory('memory', mockOrchestrator);
	});

	describe('getOrchestratorEventHandler', () => {
		it('should create OrchestratorEventHandler with required services', () => {
			const handler = factory.getOrchestratorEventHandler();

			expect(handler).toBeDefined();
		});

		it('should return same instance on multiple calls (singleton)', () => {
			const handler1 = factory.getOrchestratorEventHandler();
			const handler2 = factory.getOrchestratorEventHandler();

			expect(handler1).toBe(handler2);
		});
	});

	describe('initializeOrchestratorIntegration', () => {
		it('should register handler with BackendEventBridge', () => {
			// Get the BackendEventBridge from orchestrator
			const backendEventBridge = mockOrchestrator.getBackendEventBridge();

			// Verify no handlers initially
			expect(backendEventBridge.getHandlerCount()).toBe(0);

			// Initialize integration
			factory.initializeOrchestratorIntegration();

			// Verify handler was registered
			expect(backendEventBridge.getHandlerCount()).toBe(1);
		});

		it('should route events from BackendEventBridge to OrchestratorEventHandler', async () => {
			// Initialize integration
			factory.initializeOrchestratorIntegration();

			// Get handler and spy on its method
			const handler = factory.getOrchestratorEventHandler();
			const handleEventSpy = vi.spyOn(handler, 'handleOrchestratorEvent');

			// Get BackendEventBridge and send test event
			const backendEventBridge = mockOrchestrator.getBackendEventBridge();
			await backendEventBridge.sendToBackend('test_event', { test: 'data' });

			// Verify handler was called
			expect(handleEventSpy).toHaveBeenCalledWith('test_event', { test: 'data' });
		});

		it('should not fail if handler throws error', async () => {
			// Initialize integration
			factory.initializeOrchestratorIntegration();

			// Get handler and mock it to throw error
			const handler = factory.getOrchestratorEventHandler();
			vi.spyOn(handler, 'handleOrchestratorEvent').mockRejectedValue(new Error('Handler error'));

			// Get BackendEventBridge and send test event
			const backendEventBridge = mockOrchestrator.getBackendEventBridge();

			// Should not throw (BackendEventBridge catches errors)
			await expect(backendEventBridge.sendToBackend('test_event', { test: 'data' })).resolves.toBeUndefined();
		});
	});
});
