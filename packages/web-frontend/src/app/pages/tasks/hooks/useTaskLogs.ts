import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { LogEntry, LogLevel, PaginatedLogsResponse } from '@shared/api/tasks.contract';

import { tasksApi } from '../tasks.api';
import { LogBuffer } from './LogBuffer';

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
 * Uses LogBuffer for efficient timestamp-based ordering and deduplication
 */
export function useTaskLogs({ taskId, level, search, limit = 100 }: UseTaskLogsOptions): UseTaskLogsResult {
	// Use LogBuffer for efficient log management
	const logBuffer = useMemo(() => new LogBuffer(), []);

	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [isRunning, setIsRunning] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [nextCursor, setNextCursor] = useState<number | null>(null);
	const [refreshTrigger, setRefreshTrigger] = useState(0);

	// Track previous taskId with ref (not state) to avoid infinite loops
	const prevTaskIdRef = useRef(taskId);

	// Fetch initial logs or when filters change
	useEffect(() => {
		const abortController = new AbortController();

		const taskChanged = prevTaskIdRef.current !== taskId;
		prevTaskIdRef.current = taskId;

		// Only show loading spinner for initial load or task change (not filter changes)
		if (taskChanged || logs.length === 0) {
			setIsLoading(true);
		}

		// Only clear buffer when task changes or manual refresh
		if (taskChanged) {
			logBuffer.clear();
			setLogs([]);
			setNextCursor(null);
		}

		setError(null);

		(async () => {
			try {
				const response: PaginatedLogsResponse = await tasksApi.getTaskLogs(taskId, {
					cursor: undefined,
					limit,
					level,
					search,
				});

				if (!abortController.signal.aborted) {
					// Replace buffer with new filtered data
					logBuffer.clear();
					logBuffer.addLogs(response.logs);
					setLogs(logBuffer.getLogs());
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
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [taskId, level, search, limit, refreshTrigger, logBuffer]);

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

			// Add logs to buffer (handles deduplication and ordering)
			const wasAdded = logBuffer.addLogs(response.logs);
			if (wasAdded) {
				setLogs(logBuffer.getLogs());
			}
			setTotal(response.total);
			setIsRunning(response.isRunning);
			setNextCursor(response.nextCursor);
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Failed to load more logs'));
		} finally {
			setIsLoadingMore(false);
		}
	}, [taskId, nextCursor, limit, level, search, isLoadingMore, logBuffer]);

	// Append new logs incrementally (for real-time updates)
	// LogBuffer handles out-of-order arrivals and deduplication automatically via timestamp sorting
	const appendNewLogs = useCallback(async () => {
		try {
			// Fetch with overlap window to catch late-arriving steps
			// LogBuffer will handle deduplication and correct ordering by timestamp
			let fetchFromStep = 0;
			if (logBuffer.getCount() > 0) {
				const latestTimestamp = logBuffer.getLatestTimestamp();
				if (latestTimestamp !== null) {
					// Fetch from slightly before latest to catch out-of-order arrivals
					// Use cursor to approximate step position (backend uses step-based cursor)
					fetchFromStep = Math.max(0, Math.floor(logBuffer.getCount() / 4) - 5);
				}
			}

			console.log(
				`[useTaskLogs] appendNewLogs: fetching from step ${fetchFromStep} (current count: ${logBuffer.getCount()})`
			);

			const response: PaginatedLogsResponse = await tasksApi.getTaskLogs(taskId, {
				cursor: fetchFromStep,
				limit: limit + 50, // Larger limit to cover overlap + new steps
				level,
				search,
			});

			// LogBuffer handles deduplication and insertion at correct position
			if (response.logs.length > 0) {
				const wasAdded = logBuffer.addLogs(response.logs);
				if (wasAdded) {
					setLogs(logBuffer.getLogs());
				}
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
	}, [taskId, logBuffer, limit, level, search]);

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
