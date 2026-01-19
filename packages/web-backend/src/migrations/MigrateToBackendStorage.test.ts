import { describe, expect, it } from 'vitest';

import type { Task as BackendTask } from '@app/shared/api/tasks.contract';

import { transformTask, validateTask } from './MigrateToBackendStorage';

/**
 * ===========================================================================================
 * MIGRATION TESTS
 * ===========================================================================================
 *
 * Tests for the orchestrator to backend storage migration script.
 *
 * Coverage:
 * - transformTask(): Validates task transformation logic
 * - validateTask(): Validates task validation logic
 *
 * ===========================================================================================
 */

describe('MigrateToBackendStorage', () => {
	describe('transformTask', () => {
		it('should transform basic orchestrator task to backend format', () => {
			const orchestratorTask = {
				id: 'task-1',
				description: 'Test task',
				status: 'in_progress',
				priority: 'high' as const,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedTo: {
					workerId: 'worker-1',
				},
				comments: [],
				metadata: {},
				history: [],
			};

			const backendTask = transformTask(orchestratorTask);

			expect(backendTask).toEqual({
				id: 'task-1',
				description: 'Test task',
				status: 'in_progress',
				priority: 'high',
				version: 1,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedWorker: {
					workerId: 'worker-1',
				},
				projectId: undefined,
				workspaceId: undefined,
				flowId: undefined,
				flowResult: undefined,
			});
		});

		it('should extract projectId from metadata', () => {
			const orchestratorTask = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo',
				priority: 'medium' as const,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedTo: null,
				metadata: {
					projectId: 'project-123',
				},
			};

			const backendTask = transformTask(orchestratorTask);

			expect(backendTask.projectId).toBe('project-123');
		});

		it('should extract workspaceId from metadata', () => {
			const orchestratorTask = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo',
				priority: 'low' as const,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedTo: null,
				metadata: {
					workspaceId: 'workspace-456',
				},
			};

			const backendTask = transformTask(orchestratorTask);

			expect(backendTask.workspaceId).toBe('workspace-456');
		});

		it('should extract both projectId and workspaceId from metadata', () => {
			const orchestratorTask = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo',
				priority: 'urgent' as const,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedTo: null,
				metadata: {
					projectId: 'project-123',
					workspaceId: 'workspace-456',
					customField: 'custom-value',
				},
			};

			const backendTask = transformTask(orchestratorTask);

			expect(backendTask.projectId).toBe('project-123');
			expect(backendTask.workspaceId).toBe('workspace-456');
		});

		it('should preserve flowId and flowResult', () => {
			const orchestratorTask = {
				id: 'task-1',
				description: 'Test task',
				status: 'review',
				priority: 'high' as const,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedTo: {
					workerId: 'worker-1',
				},
				flowId: 'flow-123',
				flowResult: {
					status: 'completed' as const,
					outputs: { result: 'success' },
					trace: { steps: [] },
				},
			};

			const backendTask = transformTask(orchestratorTask);

			expect(backendTask.flowId).toBe('flow-123');
			expect(backendTask.flowResult).toEqual({
				status: 'completed',
				outputs: { result: 'success' },
				trace: { steps: [] },
			});
		});

		it('should handle null assignedTo', () => {
			const orchestratorTask = {
				id: 'task-1',
				description: 'Test task',
				status: 'backlog',
				priority: 'low' as const,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedTo: null,
			};

			const backendTask = transformTask(orchestratorTask);

			expect(backendTask.assignedWorker).toBeNull();
		});

		it('should set version to 1', () => {
			const orchestratorTask = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo',
				priority: 'medium' as const,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedTo: null,
			};

			const backendTask = transformTask(orchestratorTask);

			expect(backendTask.version).toBe(1);
		});

		it('should not include orchestrator-specific fields', () => {
			const orchestratorTask = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo',
				priority: 'medium' as const,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedTo: null,
				comments: [
					{
						timestamp: '2026-01-01T00:00:00.000Z',
						author: 'worker-1',
						content: 'Test comment',
					},
				],
				history: [
					{
						timestamp: '2026-01-01T00:00:00.000Z',
						event: 'created',
					},
				],
				activeInterventionId: 'intervention-123',
				interventionHistory: ['intervention-123'],
			};

			const backendTask = transformTask(orchestratorTask);

			expect(backendTask).not.toHaveProperty('comments');
			expect(backendTask).not.toHaveProperty('history');
			expect(backendTask).not.toHaveProperty('metadata');
			expect(backendTask).not.toHaveProperty('activeInterventionId');
			expect(backendTask).not.toHaveProperty('interventionHistory');
		});
	});

	describe('validateTask', () => {
		it('should validate a valid task', () => {
			const task: BackendTask = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo',
				priority: 'medium',
				version: 1,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedWorker: null,
			};

			expect(() => validateTask(task)).not.toThrow();
			expect(validateTask(task)).toBe(true);
		});

		it('should throw error for missing id', () => {
			const task = {
				description: 'Test task',
				status: 'todo',
				priority: 'medium',
				version: 1,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedWorker: null,
			} as any;

			expect(() => validateTask(task)).toThrow('Missing or invalid task.id');
		});

		it('should throw error for missing description', () => {
			const task = {
				id: 'task-1',
				status: 'todo',
				priority: 'medium',
				version: 1,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedWorker: null,
			} as any;

			expect(() => validateTask(task)).toThrow('Missing or invalid task.description');
		});

		it('should throw error for missing status', () => {
			const task = {
				id: 'task-1',
				description: 'Test task',
				priority: 'medium',
				version: 1,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedWorker: null,
			} as any;

			expect(() => validateTask(task)).toThrow('Missing or invalid task.status');
		});

		it('should throw error for missing priority', () => {
			const task = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo',
				version: 1,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedWorker: null,
			} as any;

			expect(() => validateTask(task)).toThrow('Missing or invalid task.priority');
		});

		it('should throw error for missing version', () => {
			const task = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo',
				priority: 'medium',
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedWorker: null,
			} as any;

			expect(() => validateTask(task)).toThrow('Missing or invalid task.version');
		});

		it('should throw error for missing createdAt', () => {
			const task = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo',
				priority: 'medium',
				version: 1,
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedWorker: null,
			} as any;

			expect(() => validateTask(task)).toThrow('Missing or invalid task.createdAt');
		});

		it('should throw error for missing updatedAt', () => {
			const task = {
				id: 'task-1',
				description: 'Test task',
				status: 'todo',
				priority: 'medium',
				version: 1,
				createdAt: '2026-01-01T00:00:00.000Z',
				assignedWorker: null,
			} as any;

			expect(() => validateTask(task)).toThrow('Missing or invalid task.updatedAt');
		});

		it('should validate task with optional fields', () => {
			const task: BackendTask = {
				id: 'task-1',
				description: 'Test task',
				status: 'in_progress',
				priority: 'high',
				version: 1,
				createdAt: '2026-01-01T00:00:00.000Z',
				updatedAt: '2026-01-01T00:00:00.000Z',
				assignedWorker: {
					workerId: 'worker-1',
				},
				projectId: 'project-123',
				workspaceId: 'workspace-456',
				flowId: 'flow-123',
				flowResult: {
					status: 'completed',
					outputs: { result: 'success' },
				},
			};

			expect(() => validateTask(task)).not.toThrow();
			expect(validateTask(task)).toBe(true);
		});
	});
});
