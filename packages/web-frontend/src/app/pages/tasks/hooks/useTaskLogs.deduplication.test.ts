import type { PaginatedLogsResponse } from '@shared/api/tasks.contract';
import { renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMockTasksApi } from '@/test/utils/asyncUtils';

import * as tasksApiModule from '../tasks.api';
import { useTaskLogs } from './useTaskLogs';

// Mock the tasks API module
vi.mock('../tasks.api', () => ({
	tasksApi: {
		getTaskLogs: vi.fn(),
	},
}));

describe('useTaskLogs - Deduplication Tests', () => {
	let mockApi: ReturnType<typeof createMockTasksApi>;

	beforeEach(() => {
		vi.clearAllMocks();
		mockApi = createMockTasksApi();
		// Replace the mocked getTaskLogs with our controlled version
		vi.mocked(tasksApiModule.tasksApi.getTaskLogs).mockImplementation(mockApi.getTaskLogs as any);
	});

	describe('double event scenario (root cause #1)', () => {
		it('should deduplicate when appendNewLogs is called twice rapidly', async () => {
			const { result } = renderHook(() => useTaskLogs({ taskId: 'task-1', limit: 100 }));

			// Initial load
			await waitFor(() => expect(mockApi.getTaskLogs).toHaveBeenCalledTimes(1));
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-0',
						sequence: 0,
						message: 'Log 0',
						timestamp: 100,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 1,
				isRunning: true,
				minSequence: 0,
				maxSequence: 0,
			});

			await waitFor(() => expect(result.current.logs).toHaveLength(1));

			// Simulate double event: B2F_TASK_TRACE_UPDATED + B2F_TASK_UPDATED
			const append1 = result.current.appendNewLogs();
			const append2 = result.current.appendNewLogs();

			// Both fetch in parallel
			await waitFor(() => expect(mockApi.getPendingCount()).toBe(2));

			// Both return SAME logs (simulating duplicate fetch)
			const duplicateLogs: PaginatedLogsResponse = {
				logs: [
					{
						id: 'task-1-10',
						sequence: 10,
						message: 'Log 10',
						timestamp: 200,
						level: 'info',
						stepId: 's2',
						stepName: 'S2',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 2,
				isRunning: true,
				minSequence: 10,
				maxSequence: 10,
			};

			mockApi.resolveNext(duplicateLogs);
			mockApi.resolveNext(duplicateLogs);

			await Promise.all([append1, append2]);

			// Should have 2 unique logs, NOT 3
			await waitFor(() => {
				expect(result.current.logs).toHaveLength(2);
				expect(result.current.logs.map(l => l.id)).toEqual(['task-1-0', 'task-1-10']);
			});
		});

		it('should handle triple concurrent appendNewLogs calls', async () => {
			const { result } = renderHook(() => useTaskLogs({ taskId: 'task-1', limit: 100 }));

			// Initial load
			await waitFor(() => expect(mockApi.getTaskLogs).toHaveBeenCalledTimes(1));
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-0',
						sequence: 0,
						message: 'Log 0',
						timestamp: 100,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 1,
				isRunning: true,
				minSequence: 0,
				maxSequence: 0,
			});

			await waitFor(() => expect(result.current.logs).toHaveLength(1));

			// Triple concurrent calls
			const promises = [
				result.current.appendNewLogs(),
				result.current.appendNewLogs(),
				result.current.appendNewLogs(),
			];

			await waitFor(() => expect(mockApi.getPendingCount()).toBe(3));

			// All return the same log
			const sameLog: PaginatedLogsResponse = {
				logs: [
					{
						id: 'task-1-10',
						sequence: 10,
						message: 'Log 10',
						timestamp: 200,
						level: 'info',
						stepId: 's2',
						stepName: 'S2',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 2,
				isRunning: true,
				minSequence: 10,
				maxSequence: 10,
			};

			mockApi.resolveNext(sameLog);
			mockApi.resolveNext(sameLog);
			mockApi.resolveNext(sameLog);

			await Promise.all(promises);

			// Should still have 2 unique logs
			await waitFor(() => {
				expect(result.current.logs).toHaveLength(2);
				expect(result.current.logs.map(l => l.id)).toEqual(['task-1-0', 'task-1-10']);
			});
		});
	});

	describe('out-of-order arrival', () => {
		it('should insert late logs in correct sequence position', async () => {
			const { result } = renderHook(() => useTaskLogs({ taskId: 'task-1', limit: 100 }));

			// Load with gap: sequences 0, 10, 30 (missing 20)
			await waitFor(() => expect(mockApi.getTaskLogs).toHaveBeenCalled());
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-0',
						sequence: 0,
						message: 'Log 0',
						timestamp: 100,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
					{
						id: 'task-1-10',
						sequence: 10,
						message: 'Log 10',
						timestamp: 200,
						level: 'info',
						stepId: 's2',
						stepName: 'S2',
						stepType: 'script',
					},
					{
						id: 'task-1-30',
						sequence: 30,
						message: 'Log 30',
						timestamp: 400,
						level: 'info',
						stepId: 's4',
						stepName: 'S4',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 3,
				isRunning: true,
				minSequence: 0,
				maxSequence: 30,
			});

			await waitFor(() => expect(result.current.logs).toHaveLength(3));

			// Late arrival: sequence 20
			result.current.appendNewLogs();
			await waitFor(() => expect(mockApi.getPendingCount()).toBe(1));

			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-20',
						sequence: 20,
						message: 'Log 20',
						timestamp: 300,
						level: 'info',
						stepId: 's3',
						stepName: 'S3',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 4,
				isRunning: true,
				minSequence: 20,
				maxSequence: 20,
			});

			// Should be inserted between 10 and 30
			await waitFor(() => {
				expect(result.current.logs).toHaveLength(4);
				expect(result.current.logs.map(l => l.sequence)).toEqual([0, 10, 20, 30]);
				expect(result.current.logs[2].message).toBe('Log 20');
			});
		});

		it('should handle multiple out-of-order logs arriving together', async () => {
			const { result } = renderHook(() => useTaskLogs({ taskId: 'task-1', limit: 100 }));

			// Initial: sequences 0, 40
			await waitFor(() => expect(mockApi.getTaskLogs).toHaveBeenCalled());
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-0',
						sequence: 0,
						message: 'Log 0',
						timestamp: 100,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
					{
						id: 'task-1-40',
						sequence: 40,
						message: 'Log 40',
						timestamp: 500,
						level: 'info',
						stepId: 's5',
						stepName: 'S5',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 2,
				isRunning: true,
				minSequence: 0,
				maxSequence: 40,
			});

			await waitFor(() => expect(result.current.logs).toHaveLength(2));

			// Late arrival: sequences 10, 20, 30 all at once
			result.current.appendNewLogs();
			await waitFor(() => expect(mockApi.getPendingCount()).toBe(1));

			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-10',
						sequence: 10,
						message: 'Log 10',
						timestamp: 200,
						level: 'info',
						stepId: 's2',
						stepName: 'S2',
						stepType: 'script',
					},
					{
						id: 'task-1-20',
						sequence: 20,
						message: 'Log 20',
						timestamp: 300,
						level: 'info',
						stepId: 's3',
						stepName: 'S3',
						stepType: 'script',
					},
					{
						id: 'task-1-30',
						sequence: 30,
						message: 'Log 30',
						timestamp: 400,
						level: 'info',
						stepId: 's4',
						stepName: 'S4',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 5,
				isRunning: true,
				minSequence: 10,
				maxSequence: 30,
			});

			// Should all be inserted in correct order
			await waitFor(() => {
				expect(result.current.logs).toHaveLength(5);
				expect(result.current.logs.map(l => l.sequence)).toEqual([0, 10, 20, 30, 40]);
			});
		});
	});

	describe('concurrent calls with overlapping data', () => {
		it('should handle 3 concurrent appendNewLogs without duplicates', async () => {
			const { result } = renderHook(() => useTaskLogs({ taskId: 'task-1', limit: 100 }));

			// Initial
			await waitFor(() => expect(mockApi.getTaskLogs).toHaveBeenCalled());
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-0',
						sequence: 0,
						message: 'Log 0',
						timestamp: 100,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 1,
				isRunning: true,
				minSequence: 0,
				maxSequence: 0,
			});

			await waitFor(() => expect(result.current.logs).toHaveLength(1));

			// 3 concurrent calls
			const promises = [
				result.current.appendNewLogs(),
				result.current.appendNewLogs(),
				result.current.appendNewLogs(),
			];

			await waitFor(() => expect(mockApi.getPendingCount()).toBe(3));

			// Resolve with overlapping data
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-10',
						sequence: 10,
						message: 'Log 10',
						timestamp: 200,
						level: 'info',
						stepId: 's2',
						stepName: 'S2',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 2,
				isRunning: true,
				minSequence: 10,
				maxSequence: 10,
			});

			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-10',
						sequence: 10,
						message: 'Log 10',
						timestamp: 200,
						level: 'info',
						stepId: 's2',
						stepName: 'S2',
						stepType: 'script',
					},
					{
						id: 'task-1-20',
						sequence: 20,
						message: 'Log 20',
						timestamp: 300,
						level: 'info',
						stepId: 's3',
						stepName: 'S3',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 3,
				isRunning: true,
				minSequence: 10,
				maxSequence: 20,
			});

			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-20',
						sequence: 20,
						message: 'Log 20',
						timestamp: 300,
						level: 'info',
						stepId: 's3',
						stepName: 'S3',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 3,
				isRunning: true,
				minSequence: 20,
				maxSequence: 20,
			});

			await Promise.all(promises);

			// Should deduplicate: 0, 10, 20 (not 0, 10, 10, 20, 20)
			await waitFor(() => {
				expect(result.current.logs).toHaveLength(3);
				expect(result.current.logs.map(l => l.id)).toEqual(['task-1-0', 'task-1-10', 'task-1-20']);
			});
		});
	});

	describe('sequence gap detection', () => {
		it('should detect sequence gaps and add them to gaps array', async () => {
			const { result } = renderHook(() => useTaskLogs({ taskId: 'task-1', limit: 100 }));

			// Load with large gap: sequences 0, 50 (missing steps 10, 20, 30, 40)
			await waitFor(() => expect(mockApi.getTaskLogs).toHaveBeenCalled());
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-0',
						sequence: 0,
						message: 'Log 0',
						timestamp: 100,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
					{
						id: 'task-1-50',
						sequence: 50,
						message: 'Log 50',
						timestamp: 600,
						level: 'info',
						stepId: 's6',
						stepName: 'S6',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 2,
				isRunning: true,
				minSequence: 0,
				maxSequence: 50,
			});

			await waitFor(() => {
				expect(result.current.logs).toHaveLength(2);
				// Should have detected a gap with 4 missing steps (10, 20, 30, 40)
				expect(result.current.gaps).toHaveLength(1);
				expect(result.current.gaps[0]).toEqual({
					afterSequence: 0,
					beforeSequence: 50,
					missingCount: 4,
				});
			});
		});

		it('should not detect gaps on consecutive sequences within a step', async () => {
			const { result } = renderHook(() => useTaskLogs({ taskId: 'task-1', limit: 100 }));

			// Load with consecutive sequences: 0, 1, 2 (all from same step, so no gap)
			await waitFor(() => expect(mockApi.getTaskLogs).toHaveBeenCalled());
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-0',
						sequence: 0,
						message: 'Log 0',
						timestamp: 100,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
					{
						id: 'task-1-1',
						sequence: 1,
						message: 'Log 1',
						timestamp: 101,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
					{
						id: 'task-1-2',
						sequence: 2,
						message: 'Log 2',
						timestamp: 102,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 3,
				isRunning: true,
				minSequence: 0,
				maxSequence: 2,
			});

			await waitFor(() => {
				expect(result.current.logs).toHaveLength(3);
				// Should NOT have detected any gaps (sequences 0, 1, 2 are all from same step base 0)
				expect(result.current.gaps).toHaveLength(0);
			});
		});
	});

	describe('edge cases', () => {
		it('should handle empty response without errors', async () => {
			const { result } = renderHook(() => useTaskLogs({ taskId: 'task-1', limit: 100 }));

			await waitFor(() => expect(mockApi.getTaskLogs).toHaveBeenCalled());
			mockApi.resolveNext({
				logs: [],
				nextCursor: null,
				total: 0,
				isRunning: false,
				minSequence: 0,
				maxSequence: 0,
			});

			await waitFor(() => {
				expect(result.current.logs).toHaveLength(0);
				expect(result.current.isLoading).toBe(false);
			});
		});

		it('should handle single log without gaps', async () => {
			const { result } = renderHook(() => useTaskLogs({ taskId: 'task-1', limit: 100 }));

			await waitFor(() => expect(mockApi.getTaskLogs).toHaveBeenCalled());
			mockApi.resolveNext({
				logs: [
					{
						id: 'task-1-0',
						sequence: 0,
						message: 'Single log',
						timestamp: 100,
						level: 'info',
						stepId: 's1',
						stepName: 'S1',
						stepType: 'script',
					},
				],
				nextCursor: null,
				total: 1,
				isRunning: false,
				minSequence: 0,
				maxSequence: 0,
			});

			await waitFor(() => {
				expect(result.current.logs).toHaveLength(1);
				expect(result.current.logs[0].sequence).toBe(0);
			});
		});
	});
});
