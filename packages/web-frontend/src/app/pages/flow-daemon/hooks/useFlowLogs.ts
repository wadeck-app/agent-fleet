import { useCallback, useState } from 'react';

import type { FlowLogsResponse } from '@shared/api/flow-daemon.contract';

import { flowDaemonService } from '../FlowDaemonService';
import { toUtcDay } from '../flowDaemonFormat';
import { useFlowDaemonResource } from './useFlowDaemonResource';

export const LINES_OPTIONS = [100, 200, 500, 1000];
export const DEFAULT_LOG_LINES = 200;

export interface UseFlowLogsResult {
	/** UTC day `YYYY-MM-DD`; empty means "today" for the backend. */
	date: string;
	lines: number;
	setDate: (date: string) => void;
	setLines: (lines: number) => void;
	logs: FlowLogsResponse | null;
	loading: boolean;
	error: string | null;
	refresh: () => void;
}

/** Daemon log viewer state: day + number of trailing lines (always human-formatted). */
export function useFlowLogs(now: () => Date = () => new Date()): UseFlowLogsResult {
	const [date, setDate] = useState(() => toUtcDay(now()));
	const [lines, setLines] = useState(DEFAULT_LOG_LINES);

	const fetchLogs = useCallback(() => flowDaemonService.getLogs({ date, lines }), [date, lines]);
	const resource = useFlowDaemonResource(fetchLogs);

	return {
		date,
		lines,
		setDate,
		setLines,
		logs: resource.data,
		loading: resource.loading,
		error: resource.error,
		refresh: resource.refresh,
	};
}
