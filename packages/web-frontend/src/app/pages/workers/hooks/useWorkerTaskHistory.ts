import { useCallback, useMemo } from 'react';

import { useCacheControl2 } from '@framework/hooks2/data/useCacheControl2';
import { usePagination2 } from '@framework/hooks2/data/usePagination2';
import { useSorting2 } from '@framework/hooks2/data/useSorting2';
import type { MutationContract } from '@framework/types/MutationContract';
import type { ComposedQuery } from '@framework/utils2/buildQuery';
import type { Task } from '@shared/api/tasks.contract';

import { tasksApi } from '@/app/pages/tasks/tasks.api';

interface UseWorkerTaskHistoryProps {
	workerId: string;
}

/**
 * Hook for fetching task history for a specific worker
 * Returns Data2-compatible state for use with Table2
 */
export function useWorkerTaskHistory({ workerId }: UseWorkerTaskHistoryProps) {
	const storageId = `worker-tasks-${workerId}`;

	// Headless features
	const pagination = usePagination2({
		pageSize: 10,
		storageId,
		initialPage: 1,
	});

	const sorting = useSorting2({
		storageId,
		defaultSort: [{ key: 'createdAt', direction: 'desc' }],
	});

	const cache = useCacheControl2({ enabled: true });

	// Mutation contract for direct cache updates
	const mutation: MutationContract<Task> = useMemo(
		() => ({
			keyExtractor: (task: Task) => task.id,
		}),
		[]
	);

	// Fetch function
	const fetchTasks = useCallback(
		async (query: ComposedQuery) => {
			const response = await tasksApi.getTasksList({
				page: query.page,
				pageSize: query.pageSize,
				sortBy: query.sortBy,
				sortOrder: query.sortOrder as 'asc' | 'desc' | undefined,
				workerId, // Filter by worker
			});

			return {
				items: response.items,
				pagination: response.pagination,
			};
		},
		[workerId]
	);

	return {
		pagination,
		sorting,
		cache,
		mutation,
		fetchTasks,
	};
}
