import type { TasksData } from '@shared';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { tasksService } from './TasksService';
import { useTasks } from './useTasks';

// Mock the service layer
vi.mock('./TasksService', () => ({
	tasksService: {
		getTasks: vi.fn(),
	},
}));

// Mock the WebSocket hook
vi.mock('../../hooks/useOrchestratorWebSocket', () => ({
	useOrchestratorWebSocket: vi.fn(() => ({
		status: 'disconnected',
		isConnected: false,
		lastMessage: null,
		connect: vi.fn(),
		disconnect: vi.fn(),
		send: vi.fn(),
	})),
}));

describe('useTasks', () => {
	const mockTasksData: TasksData = {
		timestamp: '2025-12-21T10:00:00Z',
		summary: {
			total: 15,
			byStatus: {
				todo: 3,
				in_progress: 4,
				testing: 1,
				review: 2,
				approved: 3,
				merged: 1,
				blocked: 1,
			},
			byPriority: {
				low: 3,
				medium: 6,
				high: 4,
				urgent: 2,
			},
		},
		tasks: [
			{
				id: 'task-1',
				description: 'Implement authentication',
				status: 'in_progress',
				priority: 'high',
				createdAt: '2025-12-21T08:00:00Z',
				updatedAt: '2025-12-21T09:30:00Z',
				assignedWorker: {
					workerId: 'worker-1',
					workerType: 'dev',
				},
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.clearAllTimers();
	});

	describe('initial load', () => {
		it('should load tasks data on mount', async () => {
			vi.mocked(tasksService.getTasks).mockResolvedValue(mockTasksData);

			const { result } = renderHook(() => useTasks());

			// Initially loading
			expect(result.current.loading).toBe(true);
			expect(result.current.data).toBeNull();

			// Wait for data to load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.data).toEqual(mockTasksData);
			expect(result.current.error).toBeNull();
			expect(tasksService.getTasks).toHaveBeenCalled();
		});

		it('should handle load errors', async () => {
			const error = new Error('Failed to load tasks');
			vi.mocked(tasksService.getTasks).mockRejectedValue(error);

			const { result } = renderHook(() => useTasks());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.error).toBe('Failed to load tasks');
			expect(result.current.data).toBeNull();
		});

		it('should not load data when enabled is false', async () => {
			vi.mocked(tasksService.getTasks).mockResolvedValue(mockTasksData);

			const { result } = renderHook(() => useTasks({ enabled: false }));

			// Wait a bit to ensure no load is triggered
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 100));
			});

			expect(result.current.loading).toBe(false); // Should not be loading
			expect(result.current.data).toBeNull();
			expect(tasksService.getTasks).not.toHaveBeenCalled();
		});

		it('should load tasks with filters', async () => {
			vi.mocked(tasksService.getTasks).mockResolvedValue(mockTasksData);

			const filters = {
				status: 'in_progress' as const,
				priority: 'high' as const,
				workerId: 'worker-1',
			};

			const { result } = renderHook(() => useTasks({ filters }));

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.data).toEqual(mockTasksData);
			expect(tasksService.getTasks).toHaveBeenCalledWith(filters);
		});
	});

	describe('manual refresh', () => {
		it('should refresh data manually', async () => {
			vi.mocked(tasksService.getTasks).mockResolvedValue(mockTasksData);

			const { result } = renderHook(() => useTasks());

			// Wait for initial load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Update mock data
			const updatedData: TasksData = {
				...mockTasksData,
				summary: {
					...mockTasksData.summary,
					total: 20,
				},
			};
			vi.mocked(tasksService.getTasks).mockResolvedValue(updatedData);

			// Manual refresh
			await act(async () => {
				await result.current.refresh();
			});

			expect(result.current.data).toEqual(updatedData);
			expect(tasksService.getTasks).toHaveBeenCalled();
		});

		it('should handle refresh errors', async () => {
			vi.mocked(tasksService.getTasks).mockResolvedValue(mockTasksData);

			const { result } = renderHook(() => useTasks());

			// Wait for initial load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Mock error on refresh
			const error = new Error('Refresh failed');
			vi.mocked(tasksService.getTasks).mockRejectedValue(error);

			// Manual refresh
			await act(async () => {
				await result.current.refresh();
			});

			expect(result.current.error).toBe('Refresh failed');
			expect(result.current.data).toEqual(mockTasksData); // Data should remain from initial load
		});
	});

	describe('error handling', () => {
		it('should clear error', async () => {
			const error = new Error('Failed to load tasks');
			vi.mocked(tasksService.getTasks).mockRejectedValue(error);

			const { result } = renderHook(() => useTasks());

			await waitFor(() => {
				expect(result.current.error).toBe('Failed to load tasks');
			});

			// Clear error
			act(() => {
				result.current.clearError();
			});

			expect(result.current.error).toBeNull();
		});
	});

	describe('polling', () => {
		it('should enable polling with specified interval', async () => {
			vi.mocked(tasksService.getTasks).mockResolvedValue(mockTasksData);

			const { result } = renderHook(() => useTasks({ pollInterval: 100 }));

			// Wait for initial load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			const initialCallCount = vi.mocked(tasksService.getTasks).mock.calls.length;

			// Wait for at least one poll cycle
			await act(async () => {
				await new Promise(resolve => setTimeout(resolve, 150));
			});

			// Should have polled at least once more
			await waitFor(() => {
				expect(vi.mocked(tasksService.getTasks).mock.calls.length).toBeGreaterThan(initialCallCount);
			});
		});

		it('should not show loading state after initial load', async () => {
			vi.mocked(tasksService.getTasks).mockResolvedValue(mockTasksData);

			const { result } = renderHook(() => useTasks({ pollInterval: 100 }));

			// Wait for initial load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Verify data was loaded
			expect(result.current.data).toEqual(mockTasksData);

			// Loading should remain false
			expect(result.current.loading).toBe(false);
		});
	});

	describe('filter changes', () => {
		it('should refetch data when filters change', async () => {
			vi.mocked(tasksService.getTasks).mockResolvedValue(mockTasksData);

			const filters1 = { status: 'in_progress' as const };
			const filters2 = { status: 'review' as const };

			const { result, rerender } = renderHook(({ filters }) => useTasks({ filters }), {
				initialProps: { filters: filters1 },
			});

			// Wait for initial load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(tasksService.getTasks).toHaveBeenCalledWith(filters1);

			// Change filters
			rerender({ filters: filters2 as any });

			// Wait for refetch
			await waitFor(() => {
				expect(tasksService.getTasks).toHaveBeenCalledWith(filters2);
			});
		});
	});
});
