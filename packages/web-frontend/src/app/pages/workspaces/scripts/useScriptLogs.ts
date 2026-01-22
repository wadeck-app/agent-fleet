import { useCallback, useEffect, useMemo, useState } from 'react';

import type { PaginatedScriptLogsResponse, ScriptLogEntry } from '@shared/api/workspaceScripts.contract';
import { B2F_SCRIPT_PROCESS_LOG_UPDATED } from '@shared/transport/B2FEventConstants';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { ScriptLogBuffer } from './ScriptLogBuffer';
import { workspaceScriptsApi } from './workspaceScripts.api';

type ScriptLogLevel = 'stdout' | 'stderr' | 'info' | 'error';

interface UseScriptLogsOptions {
	workspaceId: string;
	scriptId: string;
	level?: ScriptLogLevel;
	search?: string;
	limit?: number;
	enabled?: boolean;
}

interface UseScriptLogsResult {
	logs: ScriptLogEntry[];
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
 * Hook for paginated script logs with infinite scroll support
 * Uses cursor-based pagination for efficient loading of large log files
 * Uses ScriptLogBuffer for efficient timestamp-based ordering and deduplication
 *
 * Adapted from useTaskLogs for script process logs
 */
export function useScriptLogs({
	workspaceId,
	scriptId,
	level,
	search,
	limit = 100,
	enabled = true,
}: UseScriptLogsOptions): UseScriptLogsResult {
	// Use ScriptLogBuffer for efficient log management
	const logBuffer = useMemo(() => new ScriptLogBuffer(), []);

	const [logs, setLogs] = useState<ScriptLogEntry[]>([]);
	const [total, setTotal] = useState(0);
	const [isRunning, setIsRunning] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [nextCursor, setNextCursor] = useState<number | null>(null);
	const [refreshTrigger, setRefreshTrigger] = useState(0);

	// Fetch initial logs or when filters change
	useEffect(() => {
		if (!enabled) {
			setIsLoading(false);
			return;
		}

		const abortController = new AbortController();

		(async () => {
			try {
				setIsLoading(true);
				setError(null);

				// Clear buffer and logs
				logBuffer.clear();
				setLogs([]);
				setNextCursor(null);

				const response: PaginatedScriptLogsResponse = await workspaceScriptsApi.getScriptLogs(
					workspaceId,
					scriptId,
					{
						cursor: undefined,
						limit,
						level,
						search,
					}
				);

				if (!abortController.signal.aborted) {
					// Initialize buffer with logs (already sorted by backend)
					logBuffer.addLogs(response.logs);
					setLogs(logBuffer.getLogs());
					setTotal(response.total);
					setIsRunning(response.isRunning);
					setNextCursor(response.nextCursor);
				}
			} catch (err) {
				if (!abortController.signal.aborted) {
					setError(err instanceof Error ? err : new Error('Failed to fetch script logs'));
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
	}, [workspaceId, scriptId, level, search, limit, refreshTrigger, enabled, logBuffer]);

	// Load more logs (for infinite scroll)
	const loadMore = useCallback(async () => {
		if (!nextCursor || isLoadingMore) return;

		try {
			setIsLoadingMore(true);
			setError(null);

			const response: PaginatedScriptLogsResponse = await workspaceScriptsApi.getScriptLogs(
				workspaceId,
				scriptId,
				{
					cursor: nextCursor,
					limit,
					level,
					search,
				}
			);

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
	}, [workspaceId, scriptId, nextCursor, limit, level, search, isLoadingMore, logBuffer]);

	// Append new logs incrementally (for real-time updates)
	// LogBuffer handles out-of-order arrivals and deduplication automatically via timestamp sorting
	const appendNewLogs = useCallback(async () => {
		try {
			// Fetch with overlap window to catch late-arriving logs
			// LogBuffer will handle deduplication and correct ordering by timestamp
			let fetchFromCursor = 0;
			if (logBuffer.getCount() > 0) {
				const latestTimestamp = logBuffer.getLatestTimestamp();
				if (latestTimestamp !== null) {
					// Fetch from slightly before latest to catch out-of-order arrivals
					fetchFromCursor = Math.max(0, Math.floor(logBuffer.getCount() / 4) - 5);
				}
			}

			console.log(
				`[useScriptLogs] appendNewLogs: fetching from cursor ${fetchFromCursor} (current count: ${logBuffer.getCount()})`
			);

			const response: PaginatedScriptLogsResponse = await workspaceScriptsApi.getScriptLogs(
				workspaceId,
				scriptId,
				{
					cursor: fetchFromCursor,
					limit: limit + 50, // Larger limit to cover overlap + new logs
					level,
					search,
				}
			);

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
			console.error('[useScriptLogs] Failed to append new logs:', err);
		}
	}, [workspaceId, scriptId, logBuffer, limit, level, search]);

	// Manual refetch
	const refetch = useCallback(() => {
		setRefreshTrigger(prev => prev + 1);
	}, []);

	// Subscribe to real-time log updates
	useRealtimeRefresh({
		events: [B2F_SCRIPT_PROCESS_LOG_UPDATED],
		onEvent: appendNewLogs,
		filters: { scriptId },
		enabled: enabled && isRunning,
		logPrefix: 'useScriptLogs',
	});

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
