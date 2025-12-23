/**
 * ===========================================================================================
 * ORCHESTRATOR EVENT BRIDGE - UNIT TESTS
 * ===========================================================================================
 *
 * Test coverage:
 * - initialize() subscribes to O2B worker lifecycle events
 * - worker.connected event: transforms O2B data to B2F Worker format and broadcasts
 * - worker.disconnected event: transforms O2B data to B2F Worker format and broadcasts
 * - Invalid data: handles missing required fields gracefully (logs warning, skips event)
 * - Broadcast failures: doesn't crash, logs error
 * - dispose(): unsubscribes from all events
 * - After disposal: no longer handles events
 *
 * ===========================================================================================
 */
import { MockOrchestratorClient } from 'orchestrator-adapters/__mocks__/MockOrchestratorClient';
import type { O2BEventData } from 'shared-orch-worker/index.js';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Worker } from '@app/shared';
import { B2F_WORKER_CONNECTED, B2F_WORKER_DISCONNECTED } from '@app/shared';

import type { EventBroadcaster } from './EventBroadcaster';
import { OrchestratorEventBridge } from './OrchestratorEventBridge';

describe('OrchestratorEventBridge', () => {
	let mockOrchClient: MockOrchestratorClient;
	let mockBroadcaster: EventBroadcaster;
	let bridge: OrchestratorEventBridge;

	beforeEach(() => {
		// Create mock orchestrator client
		mockOrchClient = new MockOrchestratorClient();

		// Create mock event broadcaster
		mockBroadcaster = {
			broadcast: vi.fn(),
			sendToClient: vi.fn(),
			sendToUser: vi.fn(),
			getConnectedClientsCount: vi.fn(() => 0),
			getConnectedClients: vi.fn(() => []),
		} as unknown as EventBroadcaster;

		// Create bridge with mocks
		bridge = new OrchestratorEventBridge(mockOrchClient, mockBroadcaster);
	});

	describe('initialize', () => {
		it('should subscribe to worker lifecycle events', () => {
			// Act
			bridge.initialize();

			// Assert: verify on() was called for both events
			const onCalls = mockOrchClient.getCallsFor('on');
			expect(onCalls).toHaveLength(2);

			const eventTypes = onCalls.map(call => call.args[0]);
			expect(eventTypes).toContain('worker.connected');
			expect(eventTypes).toContain('worker.disconnected');
		});
	});

	describe('worker.connected event', () => {
		beforeEach(() => {
			bridge.initialize();
		});

		it('should transform and broadcast worker connected event', () => {
			// Arrange
			const o2bData: O2BEventData<'worker.connected'> = {
				workerId: 'worker-123',
				workerType: 'test-worker',
				connectedAt: '2025-12-23T17:00:00Z',
				timestamp: '2025-12-23T17:00:00Z',
			};

			const expectedWorker: Worker = {
				workerId: 'worker-123',
				type: 'test-worker',
				connected: true,
				state: 'idle',
				taskId: undefined,
				uptime: undefined,
				lastHeartbeat: undefined,
				tasksCompleted: undefined,
				successRate: undefined,
			};

			// Act: emit O2B event
			mockOrchClient.emitEvent('worker.connected', o2bData);

			// Assert: verify B2F event was broadcasted
			expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(B2F_WORKER_CONNECTED, expectedWorker);
			expect(mockBroadcaster.broadcast).toHaveBeenCalledTimes(1);
		});

		it('should handle missing workerId gracefully', () => {
			// Arrange: invalid data (missing workerId)
			const invalidData = {
				workerType: 'test-worker',
				connectedAt: '2025-12-23T17:00:00Z',
				timestamp: '2025-12-23T17:00:00Z',
			} as O2BEventData<'worker.connected'>;

			// Act: emit invalid O2B event
			mockOrchClient.emitEvent('worker.connected', invalidData);

			// Assert: no broadcast should occur
			expect(mockBroadcaster.broadcast).not.toHaveBeenCalled();
		});

		it('should handle missing workerType gracefully', () => {
			// Arrange: invalid data (missing workerType)
			const invalidData = {
				workerId: 'worker-123',
				connectedAt: '2025-12-23T17:00:00Z',
				timestamp: '2025-12-23T17:00:00Z',
			} as O2BEventData<'worker.connected'>;

			// Act: emit invalid O2B event
			mockOrchClient.emitEvent('worker.connected', invalidData);

			// Assert: no broadcast should occur
			expect(mockBroadcaster.broadcast).not.toHaveBeenCalled();
		});

		it('should not crash if broadcast fails', () => {
			// Arrange: make broadcast throw error
			vi.mocked(mockBroadcaster.broadcast).mockImplementation(() => {
				throw new Error('Broadcast failed');
			});

			const o2bData: O2BEventData<'worker.connected'> = {
				workerId: 'worker-123',
				workerType: 'test-worker',
				connectedAt: '2025-12-23T17:00:00Z',
				timestamp: '2025-12-23T17:00:00Z',
			};

			// Act & Assert: should not throw
			expect(() => {
				mockOrchClient.emitEvent('worker.connected', o2bData);
			}).not.toThrow();

			// Verify broadcast was attempted
			expect(mockBroadcaster.broadcast).toHaveBeenCalledTimes(1);
		});
	});

	describe('worker.disconnected event', () => {
		beforeEach(() => {
			bridge.initialize();
		});

		it('should transform and broadcast worker disconnected event', () => {
			// Arrange
			const o2bData: O2BEventData<'worker.disconnected'> = {
				workerId: 'worker-123',
				reason: 'Connection lost',
				timestamp: '2025-12-23T17:00:00Z',
			};

			const expectedWorker: Worker = {
				workerId: 'worker-123',
				type: '<unknown>', // Not available in disconnect event
				connected: false,
				state: 'idle',
				taskId: undefined,
				uptime: undefined,
				lastHeartbeat: undefined,
				tasksCompleted: undefined,
				successRate: undefined,
			};

			// Act: emit O2B event
			mockOrchClient.emitEvent('worker.disconnected', o2bData);

			// Assert: verify B2F event was broadcasted
			expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(B2F_WORKER_DISCONNECTED, expectedWorker);
			expect(mockBroadcaster.broadcast).toHaveBeenCalledTimes(1);
		});

		it('should handle disconnect event without reason', () => {
			// Arrange: disconnect without reason
			const o2bData: O2BEventData<'worker.disconnected'> = {
				workerId: 'worker-456',
				timestamp: '2025-12-23T17:00:00Z',
			};

			const expectedWorker: Worker = {
				workerId: 'worker-456',
				type: '<unknown>',
				connected: false,
				state: 'idle',
				taskId: undefined,
				uptime: undefined,
				lastHeartbeat: undefined,
				tasksCompleted: undefined,
				successRate: undefined,
			};

			// Act: emit O2B event
			mockOrchClient.emitEvent('worker.disconnected', o2bData);

			// Assert: verify B2F event was broadcasted
			expect(mockBroadcaster.broadcast).toHaveBeenCalledWith(B2F_WORKER_DISCONNECTED, expectedWorker);
		});

		it('should handle missing workerId gracefully', () => {
			// Arrange: invalid data (missing workerId)
			const invalidData = {
				reason: 'Connection lost',
				timestamp: '2025-12-23T17:00:00Z',
			} as O2BEventData<'worker.disconnected'>;

			// Act: emit invalid O2B event
			mockOrchClient.emitEvent('worker.disconnected', invalidData);

			// Assert: no broadcast should occur
			expect(mockBroadcaster.broadcast).not.toHaveBeenCalled();
		});

		it('should not crash if broadcast fails', () => {
			// Arrange: make broadcast throw error
			vi.mocked(mockBroadcaster.broadcast).mockImplementation(() => {
				throw new Error('Broadcast failed');
			});

			const o2bData: O2BEventData<'worker.disconnected'> = {
				workerId: 'worker-123',
				timestamp: '2025-12-23T17:00:00Z',
			};

			// Act & Assert: should not throw
			expect(() => {
				mockOrchClient.emitEvent('worker.disconnected', o2bData);
			}).not.toThrow();

			// Verify broadcast was attempted
			expect(mockBroadcaster.broadcast).toHaveBeenCalledTimes(1);
		});
	});

	describe('dispose', () => {
		beforeEach(() => {
			bridge.initialize();
		});

		it('should unsubscribe from all events', () => {
			// Act
			bridge.dispose();

			// Assert: verify off() was called for both events
			const offCalls = mockOrchClient.getCallsFor('off');
			expect(offCalls).toHaveLength(2);

			const eventTypes = offCalls.map(call => call.args[0]);
			expect(eventTypes).toContain('worker.connected');
			expect(eventTypes).toContain('worker.disconnected');
		});

		it('should not handle events after disposal', () => {
			// Act: dispose bridge
			bridge.dispose();

			// Emit events after disposal
			const o2bData: O2BEventData<'worker.connected'> = {
				workerId: 'worker-123',
				workerType: 'test-worker',
				connectedAt: '2025-12-23T17:00:00Z',
				timestamp: '2025-12-23T17:00:00Z',
			};

			mockOrchClient.emitEvent('worker.connected', o2bData);

			// Assert: no broadcast should occur
			expect(mockBroadcaster.broadcast).not.toHaveBeenCalled();
		});
	});

	describe('multiple events', () => {
		beforeEach(() => {
			bridge.initialize();
		});

		it('should handle multiple worker connections', () => {
			// Arrange
			const worker1Data: O2BEventData<'worker.connected'> = {
				workerId: 'worker-1',
				workerType: 'type-a',
				connectedAt: '2025-12-23T17:00:00Z',
				timestamp: '2025-12-23T17:00:00Z',
			};

			const worker2Data: O2BEventData<'worker.connected'> = {
				workerId: 'worker-2',
				workerType: 'type-b',
				connectedAt: '2025-12-23T17:00:01Z',
				timestamp: '2025-12-23T17:00:01Z',
			};

			// Act: emit multiple events
			mockOrchClient.emitEvent('worker.connected', worker1Data);
			mockOrchClient.emitEvent('worker.connected', worker2Data);

			// Assert: verify both were broadcasted
			expect(mockBroadcaster.broadcast).toHaveBeenCalledTimes(2);

			const firstCall = vi.mocked(mockBroadcaster.broadcast).mock.calls[0];
			const secondCall = vi.mocked(mockBroadcaster.broadcast).mock.calls[1];

			expect(firstCall[0]).toBe(B2F_WORKER_CONNECTED);
			expect((firstCall[1] as Worker).workerId).toBe('worker-1');
			expect((firstCall[1] as Worker).type).toBe('type-a');

			expect(secondCall[0]).toBe(B2F_WORKER_CONNECTED);
			expect((secondCall[1] as Worker).workerId).toBe('worker-2');
			expect((secondCall[1] as Worker).type).toBe('type-b');
		});

		it('should handle mixed connect and disconnect events', () => {
			// Arrange
			const connectData: O2BEventData<'worker.connected'> = {
				workerId: 'worker-1',
				workerType: 'test-worker',
				connectedAt: '2025-12-23T17:00:00Z',
				timestamp: '2025-12-23T17:00:00Z',
			};

			const disconnectData: O2BEventData<'worker.disconnected'> = {
				workerId: 'worker-1',
				timestamp: '2025-12-23T17:00:10Z',
			};

			// Act: emit connect then disconnect
			mockOrchClient.emitEvent('worker.connected', connectData);
			mockOrchClient.emitEvent('worker.disconnected', disconnectData);

			// Assert: verify both were broadcasted
			expect(mockBroadcaster.broadcast).toHaveBeenCalledTimes(2);

			const firstCall = vi.mocked(mockBroadcaster.broadcast).mock.calls[0];
			const secondCall = vi.mocked(mockBroadcaster.broadcast).mock.calls[1];

			expect(firstCall[0]).toBe(B2F_WORKER_CONNECTED);
			expect((firstCall[1] as Worker).connected).toBe(true);

			expect(secondCall[0]).toBe(B2F_WORKER_DISCONNECTED);
			expect((secondCall[1] as Worker).connected).toBe(false);
		});
	});
});
