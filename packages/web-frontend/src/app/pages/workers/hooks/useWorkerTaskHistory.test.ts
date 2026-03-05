import type { Task, TasksListResponse } from '@shared/api/tasks.contract';
import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { tasksApi } from '@/app/pages/tasks/tasks.api';

import { useWorkerTaskHistory } from './useWorkerTaskHistory';

// Mock dependencies
vi.mock('@/app/pages/tasks/tasks.api', () => ({
	tasksApi: {
		getTasksList: vi.fn(),
	},
}));

vi.mock('@framework/hooks2/data/usePagination2', () => ({
	usePagination2: vi.fn(() => ({
		page: 1,
		pageSize: 10,
		setPage: vi.fn(),
		setPageSize: vi.fn(),
		resetPage: vi.fn(),
	})),
}));

vi.mock('@framework/hooks2/data/useSorting2', () => ({
	useSorting2: vi.fn(() => ({
		sort: [{ key: 'createdAt', direction: 'desc' }],
		setSort: vi.fn(),
		resetSort: vi.fn(),
	})),
}));

vi.mock('@framework/hooks2/data/useCacheControl2', () => ({
	useCacheControl2: vi.fn(() => ({
		enabled: true,
		invalidate: vi.fn(),
	})),
}));

describe('useWorkerTaskHistory', () => {
	const workerId = 'worker-1';

	it('returns pagination, sorting, cache, mutation, and fetchTasks', () => {
		const { result } = renderHook(() => useWorkerTaskHistory({ workerId }));

		expect(result.current.pagination).toBeDefined();
		expect(result.current.sorting).toBeDefined();
		expect(result.current.cache).toBeDefined();
		expect(result.current.mutation).toBeDefined();
		expect(result.current.fetchTasks).toBeDefined();
	});

	it('fetchTasks calls tasksApi.getTasksList with workerId filter', async () => {
		const mockResponse = {
			items: [
				{
					id: 'task-1',
					workerId: 'worker-1',
					status: 'completed',
					createdAt: '2024-01-01T10:00:00Z',
				},
			],
			pagination: {
				page: 1,
				pageSize: 10,
				totalItems: 1,
				totalPages: 1,
			},
		};

		vi.mocked(tasksApi.getTasksList).mockResolvedValue(mockResponse as unknown as TasksListResponse);

		const { result } = renderHook(() => useWorkerTaskHistory({ workerId }));

		const query = {
			page: 1,
			pageSize: 10,
			sortBy: 'createdAt',
			sortOrder: 'desc' as const,
		};

		const response = await result.current.fetchTasks(query);

		expect(tasksApi.getTasksList).toHaveBeenCalledWith({
			page: 1,
			pageSize: 10,
			sortBy: 'createdAt',
			sortOrder: 'desc',
			workerId: 'worker-1',
		});

		expect(response).toEqual({
			items: mockResponse.items,
			pagination: mockResponse.pagination,
		});
	});

	it('mutation contains keyExtractor function', () => {
		const { result } = renderHook(() => useWorkerTaskHistory({ workerId }));

		const mockTask = { id: 'task-1' } as unknown as Task;

		expect(result.current.mutation.keyExtractor(mockTask)).toBe('task-1');
	});
});
