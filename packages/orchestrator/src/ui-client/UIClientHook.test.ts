/**
 * UIClientHook Tests
 */
import { logger } from 'shared-common/logger';
import { StateEvent, StateManager } from 'shared-orch-worker/StateManager';
import { Task, TaskStatus } from 'shared-orch-worker/domain-types';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { UIClientHook } from './UIClientHook';

// Mock dependencies
vi.mock('shared-common/StateManager');
vi.mock('shared-common/logger');

describe('UIClientHook', () => {
	let hook: UIClientHook;
	let mockStateManager: StateManager;

	const mockTask: Task = {
		id: 'task-1',
		description: 'Test task',
		status: TaskStatus.IN_PROGRESS,
		priority: 'high',
		createdAt: '2024-01-01T00:00:00.000Z',
		updatedAt: '2024-01-01T00:00:00.000Z',
		assignedTo: { workerId: 'worker-1' },
		comments: [],
		metadata: {},
		history: [],
	};

	beforeEach(() => {
		vi.clearAllMocks();

		// Create a real EventEmitter for StateManager
		const EventEmitter = require('events');
		mockStateManager = new EventEmitter() as any;

		// Mock Logger
		vi.mocked(logger.debug).mockImplementation(() => {});
		vi.mocked(logger.info).mockImplementation(() => {});
		vi.mocked(logger.warn).mockImplementation(() => {});
		vi.mocked(logger.error).mockImplementation(() => {});

		hook = new UIClientHook(mockStateManager);
	});

	describe('enable', () => {
		it('should enable the hook', () => {
			hook.enable();

			expect(hook.isActive()).toBe(true);
		});

		it('should subscribe to all state events', () => {
			hook.enable();

			// Verify subscription by emitting an event and checking relay
			const stateUpdateListener = vi.fn();
			hook.on('state_update', stateUpdateListener);

			mockStateManager.emit(StateEvent.TASK_CREATED, { task: mockTask });

			expect(stateUpdateListener).toHaveBeenCalledWith(
				expect.objectContaining({
					event: StateEvent.TASK_CREATED,
					data: { task: mockTask },
					timestamp: expect.any(String),
				})
			);
		});

		it('should not enable twice', () => {
			hook.enable();
			hook.enable();

			expect(logger.warn).toHaveBeenCalledWith('UIClientHook', expect.stringContaining('Already enabled'));
		});

		it('should log when enabled', () => {
			hook.enable();

			expect(logger.info).toHaveBeenCalledWith('UIClientHook', expect.stringContaining('Enabled'));
		});
	});

	describe('disable', () => {
		it('should disable the hook', () => {
			hook.enable();
			hook.disable();

			expect(hook.isActive()).toBe(false);
		});

		it('should stop relaying events after disable', () => {
			hook.enable();

			const stateUpdateListener = vi.fn();
			hook.on('state_update', stateUpdateListener);

			hook.disable();

			mockStateManager.emit(StateEvent.TASK_CREATED, { task: mockTask });

			expect(stateUpdateListener).not.toHaveBeenCalled();
		});

		it('should handle disable when not enabled', () => {
			expect(() => hook.disable()).not.toThrow();
		});

		it('should log when disabled', () => {
			hook.enable();
			hook.disable();

			expect(logger.info).toHaveBeenCalledWith('UIClientHook', 'Disabled');
		});
	});

	describe('event relaying', () => {
		beforeEach(() => {
			hook.enable();
		});

		it('should relay TASK_CREATED events', () => {
			const listener = vi.fn();
			hook.on('state_update', listener);

			mockStateManager.emit(StateEvent.TASK_CREATED, { task: mockTask });

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					event: StateEvent.TASK_CREATED,
					data: { task: mockTask },
					timestamp: expect.any(String),
				})
			);
		});

		it('should relay TASK_UPDATED events', () => {
			const listener = vi.fn();
			hook.on('state_update', listener);

			mockStateManager.emit(StateEvent.TASK_UPDATED, { task: mockTask });

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					event: StateEvent.TASK_UPDATED,
				})
			);
		});

		it('should relay WORKER_CONNECTED events', () => {
			const workerData = { worker: { id: 'worker-1' } };
			const listener = vi.fn();
			hook.on('state_update', listener);

			mockStateManager.emit(StateEvent.WORKER_CONNECTED, workerData);

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					event: StateEvent.WORKER_CONNECTED,
					data: workerData,
				})
			);
		});

		it('should relay METRICS_UPDATED events', () => {
			const metricsData = {
				metrics: {
					taskThroughput: { total: 10, completed: 5, failed: 2, inProgress: 3 },
					workerUtilization: { idle: 1, busy: 2, total: 3 },
					averageTaskDuration: 60000,
					timestamp: '2024-01-01T00:00:00.000Z',
				},
			};
			const listener = vi.fn();
			hook.on('state_update', listener);

			mockStateManager.emit(StateEvent.METRICS_UPDATED, metricsData);

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					event: StateEvent.METRICS_UPDATED,
					data: metricsData,
				})
			);
		});

		it('should not relay events when disabled', () => {
			const listener = vi.fn();
			hook.on('state_update', listener);

			hook.disable();

			mockStateManager.emit(StateEvent.TASK_CREATED, { task: mockTask });

			expect(listener).not.toHaveBeenCalled();
		});

		it('should relay all StateEvent types', () => {
			const listener = vi.fn();
			hook.on('state_update', listener);

			// Emit all event types
			Object.values(StateEvent).forEach(event => {
				mockStateManager.emit(event, { test: 'data' });
			});

			expect(listener).toHaveBeenCalledTimes(Object.values(StateEvent).length);
		});
	});

	describe('sendCommandResult', () => {
		beforeEach(() => {
			hook.enable();
		});

		it('should emit command result event', () => {
			const listener = vi.fn();
			hook.on('command_result', listener);

			hook.sendCommandResult('req-123', true, { taskId: 'task-1' });

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					requestId: 'req-123',
					success: true,
					data: { taskId: 'task-1' },
					timestamp: expect.any(String),
				})
			);
		});

		it('should emit command error', () => {
			const listener = vi.fn();
			hook.on('command_result', listener);

			hook.sendCommandResult('req-456', false, undefined, 'Task not found');

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					requestId: 'req-456',
					success: false,
					error: 'Task not found',
				})
			);
		});

		it('should not emit when disabled', () => {
			hook.disable();

			const listener = vi.fn();
			hook.on('command_result', listener);

			hook.sendCommandResult('req-123', true);

			expect(listener).not.toHaveBeenCalled();
		});

		it('should log command result', () => {
			hook.sendCommandResult('req-123', true);

			expect(logger.debug).toHaveBeenCalledWith(
				'UIClientHook',
				expect.stringContaining('Command result sent'),
				expect.objectContaining({ requestId: 'req-123', success: true })
			);
		});
	});

	describe('broadcastError', () => {
		beforeEach(() => {
			hook.enable();
		});

		it('should emit error event', () => {
			const listener = vi.fn();
			hook.on('error', listener);

			hook.broadcastError('Connection failed', { code: 500 });

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					error: 'Connection failed',
					details: { code: 500 },
					timestamp: expect.any(String),
				})
			);
		});

		it('should emit error without details', () => {
			const listener = vi.fn();
			hook.on('error', listener);

			hook.broadcastError('Unknown error');

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					error: 'Unknown error',
					timestamp: expect.any(String),
				})
			);
		});

		it('should not emit when disabled', () => {
			hook.disable();

			const listener = vi.fn();
			hook.on('error', listener);

			hook.broadcastError('Error message');

			expect(listener).not.toHaveBeenCalled();
		});

		it('should log error broadcast', () => {
			// Add a listener to prevent "unhandled error" exception
			hook.on('error', () => {});

			hook.broadcastError('Test error');

			expect(logger.error).toHaveBeenCalledWith(
				'UIClientHook',
				expect.stringContaining('Error broadcasted'),
				expect.any(Object)
			);
		});
	});

	describe('sendSnapshot', () => {
		beforeEach(() => {
			hook.enable();
		});

		it('should emit snapshot event', () => {
			const snapshot = {
				timestamp: '2024-01-01T00:00:00.000Z',
				orchestrator: { status: 'ready', uptime: 1000, version: '1.0.0' },
				tasks: { all: [], total: 0, byStatus: {} },
				workers: { all: [], connected: 0, idle: 0, busy: 0 },
				metrics: {
					taskThroughput: { total: 0, completed: 0, failed: 0, inProgress: 0 },
					workerUtilization: { idle: 0, busy: 0, total: 0 },
					averageTaskDuration: 0,
					timestamp: '2024-01-01T00:00:00.000Z',
				},
			};
			const listener = vi.fn();
			hook.on('snapshot', listener);

			hook.sendSnapshot(snapshot, 'req-123');

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					snapshot,
					requestId: 'req-123',
					timestamp: expect.any(String),
				})
			);
		});

		it('should emit snapshot without requestId', () => {
			const snapshot = { test: 'data' };
			const listener = vi.fn();
			hook.on('snapshot', listener);

			hook.sendSnapshot(snapshot);

			expect(listener).toHaveBeenCalledWith(
				expect.objectContaining({
					snapshot,
					timestamp: expect.any(String),
				})
			);
			expect(listener.mock.calls[0][0].requestId).toBeUndefined();
		});

		it('should not emit when disabled', () => {
			hook.disable();

			const listener = vi.fn();
			hook.on('snapshot', listener);

			hook.sendSnapshot({ test: 'data' });

			expect(listener).not.toHaveBeenCalled();
		});

		it('should log snapshot sent', () => {
			hook.sendSnapshot({ test: 'data' }, 'req-123');

			expect(logger.debug).toHaveBeenCalledWith(
				'UIClientHook',
				'Snapshot sent',
				expect.objectContaining({ requestId: 'req-123' })
			);
		});
	});

	describe('isActive', () => {
		it('should return false initially', () => {
			expect(hook.isActive()).toBe(false);
		});

		it('should return true after enable', () => {
			hook.enable();
			expect(hook.isActive()).toBe(true);
		});

		it('should return false after disable', () => {
			hook.enable();
			hook.disable();
			expect(hook.isActive()).toBe(false);
		});
	});

	describe('getListenerCount', () => {
		it('should return 0 initially', () => {
			hook.enable();
			expect(hook.getListenerCount()).toBe(0);
		});

		it('should return correct count after adding listeners', () => {
			hook.enable();

			const listener1 = vi.fn();
			const listener2 = vi.fn();

			hook.on('state_update', listener1);
			hook.on('state_update', listener2);

			expect(hook.getListenerCount()).toBe(2);
		});

		it('should decrease count after removing listeners', () => {
			hook.enable();

			const listener = vi.fn();
			hook.on('state_update', listener);
			expect(hook.getListenerCount()).toBe(1);

			hook.removeListener('state_update', listener);
			expect(hook.getListenerCount()).toBe(0);
		});
	});

	describe('multiple UI clients', () => {
		it('should relay events to multiple listeners', () => {
			hook.enable();

			const listener1 = vi.fn();
			const listener2 = vi.fn();
			const listener3 = vi.fn();

			hook.on('state_update', listener1);
			hook.on('state_update', listener2);
			hook.on('state_update', listener3);

			mockStateManager.emit(StateEvent.TASK_CREATED, { task: mockTask });

			expect(listener1).toHaveBeenCalled();
			expect(listener2).toHaveBeenCalled();
			expect(listener3).toHaveBeenCalled();
		});

		it('should send command results to all listeners', () => {
			hook.enable();

			const listener1 = vi.fn();
			const listener2 = vi.fn();

			hook.on('command_result', listener1);
			hook.on('command_result', listener2);

			hook.sendCommandResult('req-123', true);

			expect(listener1).toHaveBeenCalled();
			expect(listener2).toHaveBeenCalled();
		});
	});
});
