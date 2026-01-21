import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BackendEventBridge } from './BackendEventBridge';
import type { BackendEventHandler } from './BackendEventBridge';

describe('BackendEventBridge', () => {
	let bridge: BackendEventBridge;
	let consoleErrorSpy: any;

	beforeEach(() => {
		bridge = new BackendEventBridge();
		// @formatter:off
		consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		// @formatter:on
	});

	afterEach(() => {
		consoleErrorSpy.mockRestore();
	});

	describe('registerHandler', () => {
		it('should register a handler successfully', () => {
			const handler: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			bridge.registerHandler(handler);

			expect(bridge.getHandlerCount()).toBe(1);
		});

		it('should register multiple handlers', () => {
			const handler1: BackendEventHandler = vi.fn().mockResolvedValue(undefined);
			const handler2: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			bridge.registerHandler(handler1);
			bridge.registerHandler(handler2);

			expect(bridge.getHandlerCount()).toBe(2);
		});
	});

	describe('unregisterHandler', () => {
		it('should unregister a handler successfully', () => {
			const handler: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			bridge.registerHandler(handler);
			expect(bridge.getHandlerCount()).toBe(1);

			bridge.unregisterHandler(handler);
			expect(bridge.getHandlerCount()).toBe(0);
		});

		it('should only remove the specified handler', () => {
			const handler1: BackendEventHandler = vi.fn().mockResolvedValue(undefined);
			const handler2: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			bridge.registerHandler(handler1);
			bridge.registerHandler(handler2);
			expect(bridge.getHandlerCount()).toBe(2);

			bridge.unregisterHandler(handler1);
			expect(bridge.getHandlerCount()).toBe(1);
		});

		it('should do nothing if handler is not registered', () => {
			const handler1: BackendEventHandler = vi.fn().mockResolvedValue(undefined);
			const handler2: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			bridge.registerHandler(handler1);
			expect(bridge.getHandlerCount()).toBe(1);

			bridge.unregisterHandler(handler2);
			expect(bridge.getHandlerCount()).toBe(1);
		});
	});

	describe('sendToBackend', () => {
		it('should call all registered handlers with event and data', async () => {
			const handler1: BackendEventHandler = vi.fn().mockResolvedValue(undefined);
			const handler2: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			bridge.registerHandler(handler1);
			bridge.registerHandler(handler2);

			const eventData = { workerId: 'worker-1', connectedAt: '2024-01-01T00:00:00Z' };
			await bridge.sendToBackend('worker_connected', eventData);

			expect(handler1).toHaveBeenCalledWith('worker_connected', eventData);
			expect(handler2).toHaveBeenCalledWith('worker_connected', eventData);
		});

		it('should handle handlers that resolve successfully', async () => {
			const handler: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			bridge.registerHandler(handler);

			await expect(bridge.sendToBackend('task_started', { taskId: 'task-1' })).resolves.toBeUndefined();
			expect(handler).toHaveBeenCalledOnce();
		});

		it('should continue processing if a handler throws', async () => {
			const handler1: BackendEventHandler = vi.fn().mockRejectedValue(new Error('Handler 1 failed'));
			const handler2: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			bridge.registerHandler(handler1);
			bridge.registerHandler(handler2);

			await bridge.sendToBackend('task_completed', { taskId: 'task-1' });

			// Verify second handler was still called despite first handler failure
			expect(handler2).toHaveBeenCalledOnce();
		});

		it('should continue processing handlers even if multiple handlers fail', async () => {
			const handler1: BackendEventHandler = vi.fn().mockRejectedValue(new Error('Handler 1 failed'));
			const handler2: BackendEventHandler = vi.fn().mockRejectedValue(new Error('Handler 2 failed'));
			const handler3: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			bridge.registerHandler(handler1);
			bridge.registerHandler(handler2);
			bridge.registerHandler(handler3);

			await bridge.sendToBackend('intervention_requested', { taskId: 'task-1' });

			// Verify all handlers were called despite failures
			expect(handler1).toHaveBeenCalledOnce();
			expect(handler2).toHaveBeenCalledOnce();
			expect(handler3).toHaveBeenCalledOnce();
		});

		it('should work with no registered handlers', async () => {
			await expect(bridge.sendToBackend('task_started', { taskId: 'task-1' })).resolves.toBeUndefined();
		});

		it('should pass complex event data correctly', async () => {
			const handler: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			bridge.registerHandler(handler);

			const complexData = {
				taskId: 'task-1',
				flowResult: {
					status: 'completed' as const,
					outputs: { result: 'success', count: 42 },
					trace: { steps: [{ id: 'step-1', name: 'Test Step' }] },
				},
			};

			await bridge.sendToBackend('task_completed', complexData);

			expect(handler).toHaveBeenCalledWith('task_completed', complexData);
		});

		it('should handle worker_connected event', async () => {
			const handler: BackendEventHandler = vi.fn().mockResolvedValue(undefined);
			bridge.registerHandler(handler);

			const eventData = {
				workerId: 'worker-123',
				connectedAt: '2024-01-01T12:00:00Z',
				capabilities: { flows: ['flow-1', 'flow-2'] },
			};

			await bridge.sendToBackend('worker_connected', eventData);

			expect(handler).toHaveBeenCalledWith('worker_connected', eventData);
		});

		it('should handle worker_disconnected event', async () => {
			const handler: BackendEventHandler = vi.fn().mockResolvedValue(undefined);
			bridge.registerHandler(handler);

			const eventData = { workerId: 'worker-123' };

			await bridge.sendToBackend('worker_disconnected', eventData);

			expect(handler).toHaveBeenCalledWith('worker_disconnected', eventData);
		});

		it('should handle task_assigned event', async () => {
			const handler: BackendEventHandler = vi.fn().mockResolvedValue(undefined);
			bridge.registerHandler(handler);

			const eventData = { taskId: 'task-1', workerId: 'worker-123' };

			await bridge.sendToBackend('task_assigned', eventData);

			expect(handler).toHaveBeenCalledWith('task_assigned', eventData);
		});

		it('should handle task_trace_update event', async () => {
			const handler: BackendEventHandler = vi.fn().mockResolvedValue(undefined);
			bridge.registerHandler(handler);

			const eventData = {
				taskId: 'task-1',
				traceChunk: { stepId: 'step-1', output: 'Step completed' },
			};

			await bridge.sendToBackend('task_trace_update', eventData);

			expect(handler).toHaveBeenCalledWith('task_trace_update', eventData);
		});

		it('should handle intervention_requested event', async () => {
			const handler: BackendEventHandler = vi.fn().mockResolvedValue(undefined);
			bridge.registerHandler(handler);

			const eventData = {
				taskId: 'task-1',
				interventionData: { type: 'approval', message: 'Approve this action?' },
			};

			await bridge.sendToBackend('intervention_requested', eventData);

			expect(handler).toHaveBeenCalledWith('intervention_requested', eventData);
		});
	});

	describe('getHandlerCount', () => {
		it('should return 0 when no handlers are registered', () => {
			expect(bridge.getHandlerCount()).toBe(0);
		});

		it('should return correct count after registering handlers', () => {
			const handler1: BackendEventHandler = vi.fn().mockResolvedValue(undefined);
			const handler2: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			bridge.registerHandler(handler1);
			expect(bridge.getHandlerCount()).toBe(1);

			bridge.registerHandler(handler2);
			expect(bridge.getHandlerCount()).toBe(2);
		});

		it('should return correct count after unregistering handlers', () => {
			const handler1: BackendEventHandler = vi.fn().mockResolvedValue(undefined);
			const handler2: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			bridge.registerHandler(handler1);
			bridge.registerHandler(handler2);
			expect(bridge.getHandlerCount()).toBe(2);

			bridge.unregisterHandler(handler1);
			expect(bridge.getHandlerCount()).toBe(1);

			bridge.unregisterHandler(handler2);
			expect(bridge.getHandlerCount()).toBe(0);
		});
	});

	describe('integration scenarios', () => {
		it('should handle rapid sequential events', async () => {
			const handler: BackendEventHandler = vi.fn().mockResolvedValue(undefined);
			bridge.registerHandler(handler);

			await bridge.sendToBackend('worker_connected', { workerId: 'w1', connectedAt: '2024-01-01T00:00:00Z' });
			await bridge.sendToBackend('task_assigned', { taskId: 't1', workerId: 'w1' });
			await bridge.sendToBackend('task_started', { taskId: 't1' });
			await bridge.sendToBackend('task_completed', { taskId: 't1', flowResult: { status: 'completed' } });

			expect(handler).toHaveBeenCalledTimes(4);
		});

		it('should allow handler registration during event processing', async () => {
			const handler2: BackendEventHandler = vi.fn().mockResolvedValue(undefined);

			const handler1: BackendEventHandler = vi.fn().mockImplementation(async () => {
				// Handler 1 registers handler 2 during processing
				if (bridge.getHandlerCount() === 1) {
					bridge.registerHandler(handler2);
				}
			});

			bridge.registerHandler(handler1);

			await bridge.sendToBackend('worker_connected', { workerId: 'w1', connectedAt: '2024-01-01T00:00:00Z' });

			// Handler2 will be called during the same event because it's added to the handlers array
			// which is being iterated. This is expected behavior.
			expect(handler1).toHaveBeenCalledOnce();
			expect(handler2).toHaveBeenCalledOnce();

			// Both should be called for subsequent events
			await bridge.sendToBackend('task_started', { taskId: 't1' });

			expect(handler1).toHaveBeenCalledTimes(2);
			expect(handler2).toHaveBeenCalledTimes(2);
		});

		it('should support async handler with delays', async () => {
			const handler: BackendEventHandler = vi.fn().mockImplementation(async () => {
				await new Promise(resolve => setTimeout(resolve, 10));
			});

			bridge.registerHandler(handler);

			const startTime = Date.now();
			await bridge.sendToBackend('task_started', { taskId: 't1' });
			const duration = Date.now() - startTime;

			expect(handler).toHaveBeenCalledOnce();
			expect(duration).toBeGreaterThanOrEqual(10);
		});
	});
});
