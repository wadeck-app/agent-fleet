import { useCallback, useEffect, useState } from 'react';

import type { LogEntry, LogLevel, PaginatedLogsResponse } from '@shared/api/tasks.contract';

import { tasksApi } from '../tasks.api';

interface UseTaskLogsOptions {
	taskId: string;
	level?: LogLevel;
	search?: string;
	limit?: number;
}

interface UseTaskLogsResult {
	logs: LogEntry[];
	total: number;
	isRunning: boolean;
	isLoading: boolean;
	isError: boolean;
	error: Error | null;
	loadMore: () => void;
	hasMore: boolean;
	isLoadingMore: boolean;
	refetch: () => void;
	appendNewLogs: () => Promise<void>;
}

/**
 * Hook for paginated task logs with infinite scroll support
 * Uses cursor-based pagination for efficient loading of large log files
 */
export function useTaskLogs({ taskId, level, search, limit = 100 }: UseTaskLogsOptions): UseTaskLogsResult {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [isRunning, setIsRunning] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [nextCursor, setNextCursor] = useState<number | null>(null);
	const [refreshTrigger, setRefreshTrigger] = useState(0);

	// Fetch initial logs or when filters change
	useEffect(() => {
		const abortController = new AbortController();

		(async () => {
			try {
				setIsLoading(true);
				setError(null);
				setLogs([]);
				setNextCursor(null);

				const response: PaginatedLogsResponse = await tasksApi.getTaskLogs(taskId, {
					cursor: undefined,
					limit,
					level,
					search,
				});

				if (!abortController.signal.aborted) {
					setLogs(response.logs);
					setTotal(response.total);
					setIsRunning(response.isRunning);
					setNextCursor(response.nextCursor);
				}
			} catch (err) {
				if (!abortController.signal.aborted) {
					setError(err instanceof Error ? err : new Error('Failed to fetch logs'));
				}
			} finally {
				if (!abortController.signal.aborted) {
					setIsLoading(false);
				}
			}
		})();

		return () => {
			abortController.abort();
		};
	}, [taskId, level, search, limit, refreshTrigger]);

	// Load more logs (for infinite scroll)
	const loadMore = useCallback(async () => {
		if (!nextCursor || isLoadingMore) return;

		try {
			setIsLoadingMore(true);
			setError(null);

			const response: PaginatedLogsResponse = await tasksApi.getTaskLogs(taskId, {
				cursor: nextCursor,
				limit,
				level,
				search,
			});

			setLogs(prevLogs => [...prevLogs, ...response.logs]);
			setTotal(response.total);
			setIsRunning(response.isRunning);
			setNextCursor(response.nextCursor);
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Failed to load more logs'));
		} finally {
			setIsLoadingMore(false);
		}
	}, [taskId, nextCursor, limit, level, search, isLoadingMore]);

	// Append new logs incrementally (for real-time updates)
	// This fetches only new logs without clearing existing ones or showing loading
	const appendNewLogs = useCallback(async () => {
		try {
			// Use current logs count as cursor to fetch only new logs
			const currentCursor = logs.length;

			const response: PaginatedLogsResponse = await tasksApi.getTaskLogs(taskId, {
				cursor: currentCursor,
				limit,
				level,
				search,
			});

			// Only append if we got new logs
			if (response.logs.length > 0) {
				setLogs(prevLogs => [...prevLogs, ...response.logs]);
				setTotal(response.total);
				setIsRunning(response.isRunning);
				setNextCursor(response.nextCursor);
			} else {
				// No new logs, but update isRunning status
				setIsRunning(response.isRunning);
			}
		} catch (err) {
			// Silently fail for real-time updates to avoid disrupting user experience
			console.error('Failed to append new logs:', err);
		}
	}, [taskId, logs.length, limit, level, search]);

	// Manual refetch
	const refetch = useCallback(() => {
		setRefreshTrigger(prev => prev + 1);
	}, []);

	return {
		logs,
		total,
		isRunning,
		isLoading,
		isError: error !== null,
		error,
		loadMore,
		hasMore: nextCursor !== null,
		isLoadingMore,
		refetch,
		appendNewLogs,
	};
}
