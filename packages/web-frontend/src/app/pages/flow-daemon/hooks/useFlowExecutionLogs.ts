import { useCallback, useState } from 'react';

import { useDebounce } from '@framework/hooks2/utility/useDebounce';
import { DEFAULT_EXECUTION_LOG_LIMIT } from '@shared/api/flow-daemon.contract';
import type { FlowExecutionLogsResponse } from '@shared/api/flow-daemon.contract';

import { flowDaemonService } from '../FlowDaemonService';
import { useFlowDaemonResource } from './useFlowDaemonResource';

/**
 * ===========================================================================================
 * USE FLOW EXECUTION LOGS
 * ===========================================================================================
 *
 * Daemon log lines of one execution with step / level / text filters and paging.
 * - `page` is zero-based and counted from the END (0 is the tail, "newer" is page - 1)
 * - Changing a filter goes back to the tail; the text filter is debounced before it is sent
 * - The page is bound to the filters it was chosen for, so a filter change never requests
 *   "old page + new filter" for a moment
 *
 * ===========================================================================================
 */

export const EXECUTION_LOGS_SEARCH_DEBOUNCE_MS = 300;

export interface UseFlowExecutionLogsResult {
	step: string | undefined;
	level: string | undefined;
	/** What the user typed (immediate); the request uses its debounced value. */
	searchText: string;
	page: number;
	limit: number;
	/** True when a step, level or (debounced) text filter is applied. */
	hasActiveFilter: boolean;
	setStep: (step: string | undefined) => void;
	setLevel: (level: string | undefined) => void;
	setSearchText: (text: string) => void;
	setPage: (page: number) => void;
	logs: FlowExecutionLogsResponse | null;
	loading: boolean;
	error: string | null;
	refresh: () => void;
}

interface PageSelection {
	/** Filters the page was chosen for. */
	filterKey: string;
	page: number;
}

export function useFlowExecutionLogs(executionId: string, initialStep?: string): UseFlowExecutionLogsResult {
	const [step, setStep] = useState<string | undefined>(initialStep);
	const [level, setLevel] = useState<string | undefined>(undefined);
	const [searchText, setSearchText] = useState('');
	const [selection, setSelection] = useState<PageSelection>({ filterKey: '', page: 0 });
	const q = useDebounce(searchText, EXECUTION_LOGS_SEARCH_DEBOUNCE_MS);

	// JSON keeps the parts unambiguous whatever characters the text filter contains
	const filterKey = JSON.stringify([step ?? null, level ?? null, q]);
	const page = selection.filterKey === filterKey ? selection.page : 0;
	const limit = DEFAULT_EXECUTION_LOG_LIMIT;

	const setPage = useCallback((newPage: number) => setSelection({ filterKey, page: newPage }), [filterKey]);

	const fetchLogs = useCallback(
		() => flowDaemonService.getExecutionLogs({ executionId, step, level, q, page, limit }),
		[executionId, step, level, q, page, limit]
	);
	const resource = useFlowDaemonResource(fetchLogs);

	return {
		step,
		level,
		searchText,
		page,
		limit,
		hasActiveFilter: step !== undefined || level !== undefined || q !== '',
		setStep,
		setLevel,
		setSearchText,
		setPage,
		logs: resource.data,
		loading: resource.loading,
		error: resource.error,
		refresh: resource.refresh,
	};
}
