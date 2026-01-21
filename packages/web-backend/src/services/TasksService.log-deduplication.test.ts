import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { PaginatedLogsQuery, PaginatedLogsResponse } from '@shared/api/tasks.contract';

import { TasksService } from './TasksService';

describe('TasksService - Deterministic Log IDs and Sequences', () => {
	let service: TasksService;
	let mockStorage: any;
	let mockRepository: any;

	beforeEach(() => {
		// Mock TraceChunkStorage
		mockStorage = {
			readLogsPaginated: vi.fn(),
			writeTraceIncremental: vi.fn(),
			loadMetadata: vi.fn(),
		};

		// Mock TasksRepository
		mockRepository = {
			findById: vi.fn(),
			find: vi.fn(),
			save: vi.fn(),
			update: vi.fn(),
			delete: vi.fn(),
			bulkDelete: vi.fn(),
		};

		// Create service with mocked dependencies
		service = new TasksService(mockRepository as any, mockStorage);
	});

	describe('unique ID generation', () => {
		it('should generate unique IDs for repeated stepIds', async () => {
			const taskId = 'task-1';
			const steps = [
				{ stepId: 'test', startTime: 100, stepName: 'Test', stepType: 'script' },
				{ stepId: 'implement', startTime: 200, stepName: 'Implement', stepType: 'script' },
				{ stepId: 'test', startTime: 300, stepName: 'Test', stepType: 'script' }, // Same stepId!
			];

			// Mock task retrieval
			mockRepository.findById.mockResolvedValue({
				id: taskId,
				status: 'in_progress',
			});

			mockStorage.readLogsPaginated.mockResolvedValue({
				logs: steps,
				nextCursor: null,
				total: 3,
			});

			const result = await service.getTaskLogs(taskId, { cursor: 0, limit: 100 });

			// All IDs must be unique
			const ids = result.logs.map(l => l.id);
			const uniqueIds = new Set(ids);
			expect(uniqueIds.size).toBe(ids.length);

			// IDs should follow pattern: taskId-sequence
			expect(ids[0]).toBe('task-1-0');
			expect(ids[1]).toBe('task-1-10');
			expect(ids[2]).toBe('task-1-20');

			// Sequences should be 0, 10, 20 (spaced by 10)
			expect(result.logs.map(l => l.sequence)).toEqual([0, 10, 20]);
		});

		it('should generate unique IDs for sub-entries', async () => {
			const taskId = 'task-1';
			const steps = [
				{
					stepId: 'model',
					startTime: 100,
					endTime: 150,
					stepName: 'Model',
					stepType: 'model',
					prompt: 'Test prompt',
					response: 'Test response',
					stdout: 'Test output',
				},
			];

			mockRepository.findById.mockResolvedValue({
				id: taskId,
				status: 'in_progress',
			});

			mockStorage.readLogsPaginated.mockResolvedValue({
				logs: steps,
				nextCursor: null,
				total: 1,
			});

			const result = await service.getTaskLogs(taskId, { cursor: 0, limit: 100 });

			// Expect: 1 main + 1 prompt + 1 response + 1 stdout = 4 logs
			expect(result.logs).toHaveLength(4);

			// All IDs unique
			const ids = result.logs.map(l => l.id);
			expect(new Set(ids).size).toBe(4);

			// IDs should be: task-1-0, task-1-1, task-1-2, task-1-3
			expect(ids).toEqual(['task-1-0', 'task-1-1', 'task-1-2', 'task-1-3']);

			// Sequences should be 0, 1, 2, 3 (consecutive)
			expect(result.logs.map(l => l.sequence)).toEqual([0, 1, 2, 3]);
		});
	});

	describe('sequence generation with pagination', () => {
		it('should generate correct sequences across pages', async () => {
			const taskId = 'task-1';

			mockRepository.findById.mockResolvedValue({
				id: taskId,
				status: 'in_progress',
			});

			// First page: steps 0, 1, 2 (cursor=0)
			mockStorage.readLogsPaginated.mockResolvedValueOnce({
				logs: [
					{ stepId: 's0', startTime: 100, stepName: 'S0', stepType: 'script' },
					{ stepId: 's1', startTime: 200, stepName: 'S1', stepType: 'script' },
					{ stepId: 's2', startTime: 300, stepName: 'S2', stepType: 'script' },
				],
				nextCursor: 3,
				total: 6,
			});

			const page1 = await service.getTaskLogs(taskId, { cursor: 0, limit: 3 });

			// Sequences for page 1: 0, 10, 20
			expect(page1.logs.map(l => l.sequence)).toEqual([0, 10, 20]);
			expect(page1.minSequence).toBe(0);
			expect(page1.maxSequence).toBe(20);

			// Second page: steps 3, 4, 5 (cursor=3)
			mockStorage.readLogsPaginated.mockResolvedValueOnce({
				logs: [
					{ stepId: 's3', startTime: 400, stepName: 'S3', stepType: 'script' },
					{ stepId: 's4', startTime: 500, stepName: 'S4', stepType: 'script' },
					{ stepId: 's5', startTime: 600, stepName: 'S5', stepType: 'script' },
				],
				nextCursor: null,
				total: 6,
			});

			const page2 = await service.getTaskLogs(taskId, { cursor: 3, limit: 3 });

			// Sequences for page 2: 30, 40, 50 (continuation from page 1)
			expect(page2.logs.map(l => l.sequence)).toEqual([30, 40, 50]);
			expect(page2.minSequence).toBe(30);
			expect(page2.maxSequence).toBe(50);
		});

		it('should handle sub-entries spanning sequence space correctly', async () => {
			const taskId = 'task-1';

			mockRepository.findById.mockResolvedValue({
				id: taskId,
				status: 'in_progress',
			});

			// Step with multiple sub-entries
			mockStorage.readLogsPaginated.mockResolvedValue({
				logs: [
					{
						stepId: 's0',
						startTime: 100,
						endTime: 150,
						stepName: 'S0',
						stepType: 'model',
						prompt: 'prompt text',
						response: 'response text',
						stdout: 'output text',
						stderr: 'error text',
					},
					{
						stepId: 's1',
						startTime: 200,
						stepName: 'S1',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 2,
			});

			const result = await service.getTaskLogs(taskId, { cursor: 0, limit: 100 });

			// Step 0: sequences 0-4 (main + prompt + response + stdout + stderr)
			// Step 1: sequence 10
			const sequences = result.logs.map(l => l.sequence);

			expect(sequences).toEqual([0, 1, 2, 3, 4, 10]);

			// Verify minSequence and maxSequence
			expect(result.minSequence).toBe(0);
			expect(result.maxSequence).toBe(10);

			// Verify all belong to correct steps
			expect(result.logs.slice(0, 5).every(l => l.stepId === 's0')).toBe(true);
			expect(result.logs[5].stepId).toBe('s1');
		});
	});

	describe('minSequence and maxSequence calculation', () => {
		it('should return correct min/max for single step', async () => {
			const taskId = 'task-1';

			mockRepository.findById.mockResolvedValue({
				id: taskId,
				status: 'in_progress',
			});

			mockStorage.readLogsPaginated.mockResolvedValue({
				logs: [{ stepId: 's0', startTime: 100, stepName: 'S0', stepType: 'script' }],
				nextCursor: null,
				total: 1,
			});

			const result = await service.getTaskLogs(taskId, { cursor: 0, limit: 100 });

			expect(result.minSequence).toBe(0);
			expect(result.maxSequence).toBe(0);
		});

		it('should return 0 for both when no logs', async () => {
			const taskId = 'task-1';

			mockRepository.findById.mockResolvedValue({
				id: taskId,
				status: 'in_progress',
			});

			mockStorage.readLogsPaginated.mockResolvedValue({
				logs: [],
				nextCursor: null,
				total: 0,
			});

			const result = await service.getTaskLogs(taskId, { cursor: 0, limit: 100 });

			expect(result.minSequence).toBe(0);
			expect(result.maxSequence).toBe(0);
			expect(result.logs).toHaveLength(0);
		});

		it('should calculate correct min/max with sub-entries', async () => {
			const taskId = 'task-1';

			mockRepository.findById.mockResolvedValue({
				id: taskId,
				status: 'in_progress',
			});

			mockStorage.readLogsPaginated.mockResolvedValue({
				logs: [
					{
						stepId: 's0',
						startTime: 100,
						endTime: 150,
						stepName: 'S0',
						stepType: 'model',
						prompt: 'test',
						response: 'test',
					},
				],
				nextCursor: null,
				total: 1,
			});

			const result = await service.getTaskLogs(taskId, { cursor: 0, limit: 100 });

			// Step 0 creates sequences: 0 (main), 1 (prompt), 2 (response)
			expect(result.minSequence).toBe(0);
			expect(result.maxSequence).toBe(2);
		});
	});

	describe('ID determinism', () => {
		it('should generate same IDs for same inputs', async () => {
			const taskId = 'task-1';
			const steps = [
				{ stepId: 's0', startTime: 100, stepName: 'S0', stepType: 'script' },
				{ stepId: 's1', startTime: 200, stepName: 'S1', stepType: 'script' },
			];

			mockRepository.findById.mockResolvedValue({
				id: taskId,
				status: 'in_progress',
			});

			mockStorage.readLogsPaginated.mockResolvedValue({
				logs: steps,
				nextCursor: null,
				total: 2,
			});

			const result1 = await service.getTaskLogs(taskId, { cursor: 0, limit: 100 });

			// Reset mock to simulate second call
			mockStorage.readLogsPaginated.mockResolvedValue({
				logs: steps,
				nextCursor: null,
				total: 2,
			});

			const result2 = await service.getTaskLogs(taskId, { cursor: 0, limit: 100 });

			// Should generate identical IDs
			expect(result1.logs.map(l => l.id)).toEqual(result2.logs.map(l => l.id));
			expect(result1.logs.map(l => l.sequence)).toEqual(result2.logs.map(l => l.sequence));
		});
	});
});
