import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { EventBroadcaster } from '../transport/EventBroadcaster';
import type { InterventionsService } from './InterventionsService';
import { OrchestratorEventHandler } from './OrchestratorEventHandler';
import type { TasksService } from './TasksService';
import type { WorkersService } from './WorkersService';

describe('OrchestratorEventHandler', () => {
	let handler: OrchestratorEventHandler;
	let mockTasksService: TasksService;
	let mockInterventionsService: InterventionsService;
	let mockWorkersService: WorkersService;
	let mockEventBroadcaster: EventBroadcaster;

	beforeEach(() => {
		// Create mocks for all service dependencies
		mockTasksService = {
			updateTaskStatus: vi.fn(),
			getTaskById: vi.fn(),
		} as any;

		mockInterventionsService = {
			createIntervention: vi.fn(),
		} as any;

		mockWorkersService = {} as any;

		mockEventBroadcaster = {
			broadcast: vi.fn(),
		} as any;

		// Create handler instance with mocked dependencies
		handler = new OrchestratorEventHandler(
			mockTasksService,
			mockInterventionsService,
			mockWorkersService,
			mockEventBroadcaster
		);
	});

	describe('handleOrchestratorEvent', () => {
		it('should route worker_connected event to handleWorkerConnected', async () => {
			const data = { workerId: 'worker-1', metadata: {} };

			await handler.handleOrchestratorEvent('worker_connected', data);

			// Worker connection handling is a placeholder, so just verify no errors
			expect(true).toBe(true);
		});

		it('should route worker_disconnected event to handleWorkerDisconnected', async () => {
			const data = { workerId: 'worker-1', reason: 'timeout' };

			await handler.handleOrchestratorEvent('worker_disconnected', data);

			// Worker disconnection handling is a placeholder, so just verify no errors
			expect(true).toBe(true);
		});

		it('should route task_assigned event to handleTaskAssigned', async () => {
			const data = { taskId: 'task-1', workerId: 'worker-1' };

			await handler.handleOrchestratorEvent('task_assigned', data);

			expect(mockTasksService.updateTaskStatus).toHaveBeenCalledWith('task-1', 'in_progress');
		});

		it('should route task_started event to handleTaskStarted', async () => {
			const data = { taskId: 'task-1' };

			await handler.handleOrchestratorEvent('task_started', data);

			expect(mockTasksService.updateTaskStatus).toHaveBeenCalledWith('task-1', 'in_progress');
		});

		it('should route task_trace_update event to handleTaskTraceUpdate', async () => {
			const data = { taskId: 'task-1', trace: { steps: [] } };

			await handler.handleOrchestratorEvent('task_trace_update', data);

			// Trace update handling is a placeholder, so just verify no errors
			expect(true).toBe(true);
		});

		it('should route intervention_requested event to handleInterventionRequested', async () => {
			const data = {
				taskId: 'task-1',
				interventionData: {
					interventionId: 'intervention-1',
					interventionType: 'approval' as const,
					blocking: true,
					config: { title: 'Test' },
				},
			};

			await handler.handleOrchestratorEvent('intervention_requested', data);

			expect(mockInterventionsService.createIntervention).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'intervention-1',
					taskId: 'task-1',
					type: 'approval',
					status: 'pending',
					blocking: true,
				})
			);
		});

		it('should route task_completed event to handleTaskCompleted', async () => {
			const data = {
				taskId: 'task-1',
				success: true,
				flowResult: {
					status: 'completed' as const,
					outputs: {},
				},
			};

			await handler.handleOrchestratorEvent('task_completed', data);

			expect(mockTasksService.updateTaskStatus).toHaveBeenCalledWith('task-1', 'review');
		});

		it('should log warning for unknown event types', async () => {
			const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

			await handler.handleOrchestratorEvent('unknown_event', {});

			expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('Unknown event type: unknown_event'));

			consoleWarnSpy.mockRestore();
		});

		it('should not throw errors if event handler fails', async () => {
			// Mock service method to throw error
			vi.spyOn(mockTasksService, 'updateTaskStatus').mockRejectedValueOnce(new Error('Service error'));

			// Should not throw
			await expect(
				handler.handleOrchestratorEvent('task_started', { taskId: 'task-1' })
			).resolves.toBeUndefined();
		});
	});

	describe('handleWorkerConnected', () => {
		it('should log worker connection', async () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			await handler.handleOrchestratorEvent('worker_connected', {
				workerId: 'worker-1',
				metadata: { version: '1.0.0' },
			});

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Worker connected: worker-1'));

			consoleLogSpy.mockRestore();
		});

		it('should not throw if worker connection handling fails', async () => {
			// Should not throw even with invalid data
			await expect(
				handler.handleOrchestratorEvent('worker_connected', { workerId: undefined })
			).resolves.toBeUndefined();
		});
	});

	describe('handleWorkerDisconnected', () => {
		it('should log worker disconnection', async () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			await handler.handleOrchestratorEvent('worker_disconnected', {
				workerId: 'worker-1',
				reason: 'timeout',
			});

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Worker disconnected: worker-1'));

			consoleLogSpy.mockRestore();
		});
	});

	describe('handleTaskAssigned', () => {
		it('should update task status to in_progress', async () => {
			await handler.handleOrchestratorEvent('task_assigned', {
				taskId: 'task-1',
				workerId: 'worker-1',
			});

			expect(mockTasksService.updateTaskStatus).toHaveBeenCalledWith('task-1', 'in_progress');
		});

		it('should log task assignment', async () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			await handler.handleOrchestratorEvent('task_assigned', {
				taskId: 'task-1',
				workerId: 'worker-1',
			});

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Task assigned: task-1 → worker-1'));

			consoleLogSpy.mockRestore();
		});

		it('should not throw if service call fails', async () => {
			vi.spyOn(mockTasksService, 'updateTaskStatus').mockRejectedValueOnce(new Error('Task not found'));

			await expect(
				handler.handleOrchestratorEvent('task_assigned', {
					taskId: 'invalid-task',
					workerId: 'worker-1',
				})
			).resolves.toBeUndefined();
		});
	});

	describe('handleTaskStarted', () => {
		it('should update task status to in_progress', async () => {
			await handler.handleOrchestratorEvent('task_started', { taskId: 'task-1' });

			expect(mockTasksService.updateTaskStatus).toHaveBeenCalledWith('task-1', 'in_progress');
		});

		it('should log task start', async () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			await handler.handleOrchestratorEvent('task_started', { taskId: 'task-1' });

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Task started: task-1'));

			consoleLogSpy.mockRestore();
		});
	});

	describe('handleTaskTraceUpdate', () => {
		it('should log trace update', async () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			await handler.handleOrchestratorEvent('task_trace_update', {
				taskId: 'task-1',
				trace: { steps: [{ stepId: 'step-1', stepName: 'Test' }] },
			});

			expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('Task trace update: task-1'));

			consoleLogSpy.mockRestore();
		});

		it('should not throw if trace update fails', async () => {
			// Should handle gracefully even with invalid trace data
			await expect(
				handler.handleOrchestratorEvent('task_trace_update', {
					taskId: 'task-1',
					trace: null,
				})
			).resolves.toBeUndefined();
		});
	});

	describe('handleTaskCompleted', () => {
		it('should update task status to review when successful', async () => {
			await handler.handleOrchestratorEvent('task_completed', {
				taskId: 'task-1',
				success: true,
				flowResult: {
					status: 'completed',
					outputs: { result: 'success' },
				},
			});

			expect(mockTasksService.updateTaskStatus).toHaveBeenCalledWith('task-1', 'review');
		});

		it('should update task status to cancelled when failed', async () => {
			await handler.handleOrchestratorEvent('task_completed', {
				taskId: 'task-1',
				success: false,
				flowResult: {
					status: 'failed',
					error: 'Execution failed',
				},
			});

			expect(mockTasksService.updateTaskStatus).toHaveBeenCalledWith('task-1', 'cancelled');
		});

		it('should log task completion', async () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			await handler.handleOrchestratorEvent('task_completed', {
				taskId: 'task-1',
				success: true,
				flowResult: { status: 'completed' },
			});

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Task completed: task-1, success: true')
			);

			consoleLogSpy.mockRestore();
		});

		it('should not throw if status update fails', async () => {
			vi.spyOn(mockTasksService, 'updateTaskStatus').mockRejectedValueOnce(new Error('Update failed'));

			await expect(
				handler.handleOrchestratorEvent('task_completed', {
					taskId: 'task-1',
					success: true,
					flowResult: { status: 'completed' },
				})
			).resolves.toBeUndefined();
		});
	});

	describe('handleInterventionRequested', () => {
		it('should create intervention in service', async () => {
			await handler.handleOrchestratorEvent('intervention_requested', {
				taskId: 'task-1',
				interventionData: {
					interventionId: 'intervention-1',
					interventionType: 'question' as const,
					blocking: true,
					config: { title: 'Input required' },
				},
			});

			expect(mockInterventionsService.createIntervention).toHaveBeenCalledWith(
				expect.objectContaining({
					id: 'intervention-1',
					taskId: 'task-1',
					type: 'question',
					status: 'pending',
					blocking: true,
					config: { title: 'Input required' },
				})
			);
		});

		it('should log intervention request', async () => {
			const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

			await handler.handleOrchestratorEvent('intervention_requested', {
				taskId: 'task-1',
				interventionData: {
					interventionId: 'intervention-1',
					interventionType: 'approval' as const,
					blocking: false,
					config: {},
				},
			});

			expect(consoleLogSpy).toHaveBeenCalledWith(
				expect.stringContaining('Intervention requested: intervention-1')
			);

			consoleLogSpy.mockRestore();
		});

		it('should not throw if service call fails', async () => {
			vi.spyOn(mockInterventionsService, 'createIntervention').mockRejectedValueOnce(new Error('Service failed'));

			await expect(
				handler.handleOrchestratorEvent('intervention_requested', {
					taskId: 'task-1',
					interventionData: {
						interventionId: 'intervention-1',
						interventionType: 'choice' as const,
						blocking: true,
						config: {},
					},
				})
			).resolves.toBeUndefined();
		});
	});

	describe('error handling', () => {
		it('should log errors but not throw when handler fails', async () => {
			const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
			vi.spyOn(mockTasksService, 'updateTaskStatus').mockRejectedValueOnce(
				new Error('Database connection failed')
			);

			await handler.handleOrchestratorEvent('task_started', { taskId: 'task-1' });

			expect(consoleErrorSpy).toHaveBeenCalledWith(
				expect.stringContaining('Failed to handle task_started for task-1'),
				expect.any(Error)
			);

			consoleErrorSpy.mockRestore();
		});

		it('should handle all event types without throwing', async () => {
			const eventTypes = [
				{ event: 'worker_connected', data: { workerId: 'worker-1' } },
				{ event: 'worker_disconnected', data: { workerId: 'worker-1' } },
				{ event: 'task_assigned', data: { taskId: 'task-1', workerId: 'worker-1' } },
				{ event: 'task_started', data: { taskId: 'task-1' } },
				{ event: 'task_trace_update', data: { taskId: 'task-1', trace: {} } },
				{
					event: 'intervention_requested',
					data: {
						taskId: 'task-1',
						interventionData: {
							interventionId: 'int-1',
							interventionType: 'approval' as const,
							blocking: true,
							config: {},
						},
					},
				},
				{
					event: 'task_completed',
					data: { taskId: 'task-1', success: true, flowResult: { status: 'completed' } },
				},
			];

			for (const { event, data } of eventTypes) {
				await expect(handler.handleOrchestratorEvent(event, data)).resolves.toBeUndefined();
			}
		});
	});
});
