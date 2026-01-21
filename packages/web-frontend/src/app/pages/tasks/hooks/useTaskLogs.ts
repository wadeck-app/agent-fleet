import { useCallback, useEffect, useState } from 'react';

import type { LogEntry, LogLevel, PaginatedLogsResponse } from '@shared/api/tasks.contract';

import { tasksApi } from '../tasks.api';

interface UseTaskLogsOptions {
	taskId: string;
	level?: LogLevel;
	search?: string;
	limit?: number;
}

export interface SequenceGap {
	afterSequence: number;
	beforeSequence: number;
	missingCount: number;
}

interface UseTaskLogsResult {
	logs: LogEntry[];
	gaps: SequenceGap[];
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
	fetchGap: (gap: SequenceGap) => Promise<void>;
}

/**
 * Hook for paginated task logs with infinite scroll support
 * Uses cursor-based pagination for efficient loading of large log files
 */
export function useTaskLogs({ taskId, level, search, limit = 100 }: UseTaskLogsOptions): UseTaskLogsResult {
	const [logs, setLogs] = useState<LogEntry[]>([]);
	const [gaps, setGaps] = useState<SequenceGap[]>([]);
	const [total, setTotal] = useState(0);
	const [isRunning, setIsRunning] = useState(false);
	const [isLoading, setIsLoading] = useState(true);
	const [isLoadingMore, setIsLoadingMore] = useState(false);
	const [error, setError] = useState<Error | null>(null);
	const [nextCursor, setNextCursor] = useState<number | null>(null);
	const [refreshTrigger, setRefreshTrigger] = useState(0);

	// Helper to detect REAL sequence gaps (skipped steps, not sub-log spacing)
	const detectGaps = useCallback((currentLogs: LogEntry[]): SequenceGap[] => {
		if (currentLogs.length < 2) return [];

		const detectedGaps: SequenceGap[] = [];

		// Group logs by base sequence to find last sequence of each step
		const baseGroups = new Map<number, number[]>();
		currentLogs.forEach(log => {
			const base = Math.floor(log.sequence / 10) * 10;
			if (!baseGroups.has(base)) {
				baseGroups.set(base, []);
			}
			baseGroups.get(base)!.push(log.sequence);
		});

		const sortedBases = Array.from(baseGroups.keys()).sort((a, b) => a - b);

		// Detect missing base sequences (= missing steps)
		for (let i = 1; i < sortedBases.length; i++) {
			const expectedNext = sortedBases[i - 1] + 10;
			if (sortedBases[i] > expectedNext) {
				// We skipped at least one step
				const missingBases = (sortedBases[i] - sortedBases[i - 1]) / 10 - 1;

				// Use the LAST sequence of the previous step, not the base
				const lastSeqOfPrevStep = Math.max(...baseGroups.get(sortedBases[i - 1])!);
				// Use the FIRST sequence of the next step
				const firstSeqOfNextStep = Math.min(...baseGroups.get(sortedBases[i])!);

				detectedGaps.push({
					afterSequence: lastSeqOfPrevStep, // After last sub-log of previous step
					beforeSequence: firstSeqOfNextStep, // Before first log of next step
					missingCount: missingBases,
				});
			}
		}

		return detectedGaps;
	}, []);

	// Helper to merge logs with deduplication and sequence-based sorting
	const mergeLogs = useCallback(
		(prevLogs: LogEntry[], newLogs: LogEntry[]): LogEntry[] => {
			// Build ID set from current logs (avoids stale closure issues)
			const prevIdSet = new Set(prevLogs.map(l => l.id));

			// Filter duplicates
			const uniqueNewLogs = newLogs.filter(log => !prevIdSet.has(log.id));

			if (uniqueNewLogs.length === 0) {
				return prevLogs;
			}

			// Merge and sort by sequence
			const merged = [...prevLogs, ...uniqueNewLogs];
			merged.sort((a, b) => a.sequence - b.sequence);

			// Update gaps
			setGaps(detectGaps(merged));

			return merged;
		},
		[detectGaps]
	);

	// Fetch initial logs or when filters change
	useEffect(() => {
		const abortController = new AbortController();

		(async () => {
			try {
				setIsLoading(true);
				setError(null);
				setLogs([]);
				setGaps([]);
				setNextCursor(null);

				const response: PaginatedLogsResponse = await tasksApi.getTaskLogs(taskId, {
					cursor: undefined,
					limit,
					level,
					search,
				});

				if (!abortController.signal.aborted) {
					setLogs(response.logs);
					setGaps(detectGaps(response.logs));
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
	}, [taskId, level, search, limit, refreshTrigger, detectGaps]);

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

			setLogs(prevLogs => mergeLogs(prevLogs, response.logs));
			setTotal(response.total);
			setIsRunning(response.isRunning);
			setNextCursor(response.nextCursor);
		} catch (err) {
			setError(err instanceof Error ? err : new Error('Failed to load more logs'));
		} finally {
			setIsLoadingMore(false);
		}
	}, [taskId, nextCursor, limit, level, search, isLoadingMore, mergeLogs]);

	// Append new logs incrementally (for real-time updates)
	// This fetches with overlap to handle out-of-order arrivals and parallel steps
	const appendNewLogs = useCallback(async () => {
		try {
			// Fetch with overlap window to catch late-arriving steps
			// This handles: out-of-order arrivals, parallel steps, network delays
			let fetchFromStep = 0;
			if (logs.length > 0) {
				const maxSequence = Math.max(...logs.map(l => l.sequence));
				const maxStep = Math.floor(maxSequence / 10);
				// Fetch from 5 steps before max to catch any late arrivals
				fetchFromStep = Math.max(0, maxStep - 5);
			}

			console.log(`[useTaskLogs] appendNewLogs: fetching from step ${fetchFromStep} (max current: ${logs.length > 0 ? Math.floor(Math.max(...logs.map(l => l.sequence)) / 10) : 'none'})`);

			const response: PaginatedLogsResponse = await tasksApi.getTaskLogs(taskId, {
				cursor: fetchFromStep,
				limit: limit + 50, // Larger limit to cover overlap + new steps
				level,
				search,
			});

			// mergeLogs handles deduplication automatically
			if (response.logs.length > 0) {
				setLogs(prevLogs => mergeLogs(prevLogs, response.logs));
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
	}, [taskId, logs, limit, level, search, mergeLogs]);

	// Fetch logs for a specific gap (localized fetching)
	const fetchGap = useCallback(
		async (gap: SequenceGap) => {
			try {
				console.log(
					`[useTaskLogs] Fetching gap between sequences ${gap.afterSequence} and ${gap.beforeSequence}`,
					gap
				);
				console.log(`[useTaskLogs] Current logs count: ${logs.length}`);

				const response: PaginatedLogsResponse = await tasksApi.getTaskLogs(taskId, {
					cursor: 0, // Cursor doesn't matter for sequence-based fetching
					limit: 1000, // Large limit to ensure we get all logs in the gap
					level,
					search,
					sequenceStart: gap.afterSequence,
					sequenceEnd: gap.beforeSequence,
				});

				console.log(
					`[useTaskLogs] Gap fetch response: ${response.logs.length} logs, minSeq=${response.minSequence}, maxSeq=${response.maxSequence}`
				);
				console.log('[useTaskLogs] Fetched log sequences:', response.logs.map(l => l.sequence));

				// Merge fetched logs with existing logs
				if (response.logs.length > 0) {
					setLogs(prevLogs => {
						const merged = mergeLogs(prevLogs, response.logs);
						console.log(`[useTaskLogs] After merge: ${merged.length} total logs`);
						return merged;
					});
				} else {
					console.log('[useTaskLogs] No logs found in gap range');
				}
			} catch (err) {
				console.error('[useTaskLogs] Failed to fetch gap logs:', err);
				setError(err instanceof Error ? err : new Error('Failed to fetch gap logs'));
			}
		},
		[taskId, level, search, mergeLogs, logs.length]
	);

	// Manual refetch
	const refetch = useCallback(() => {
		setRefreshTrigger(prev => prev + 1);
	}, []);

	return {
		logs,
		gaps,
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
		fetchGap,
	};
}
