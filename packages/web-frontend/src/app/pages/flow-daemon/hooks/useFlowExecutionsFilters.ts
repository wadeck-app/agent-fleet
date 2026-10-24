import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

import { type FlowExecutionStatus, isFlowExecutionStatus } from '../flowDaemonFormat';

/**
 * ===========================================================================================
 * USE FLOW EXECUTIONS FILTERS
 * ===========================================================================================
 *
 * Filters + pagination of the executions list, stored in the URL query string so that
 * "row click -> detail -> browser back" returns to the same filtered page.
 *
 * - `page` is zero-based (same as the backend `page` param)
 * - Changing a filter or the page size resets the page to 0
 * - Unrecognized URL values (e.g. `?status=bogus`, `?page=-3`) fall back to the defaults
 *
 * ===========================================================================================
 */

export const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];
export const DEFAULT_PAGE_SIZE = 20;

const STATUS_PARAM = 'status';
const FLOW_PARAM = 'flow';
const PAGE_PARAM = 'page';
const LIMIT_PARAM = 'limit';

export interface FlowExecutionsFilters {
	status: FlowExecutionStatus | undefined;
	flow: string | undefined;
	page: number;
	limit: number;
}

export interface UseFlowExecutionsFiltersResult {
	filters: FlowExecutionsFilters;
	setStatus: (status: FlowExecutionStatus | undefined) => void;
	setFlow: (flow: string | undefined) => void;
	setPage: (page: number) => void;
	setLimit: (limit: number) => void;
}

function parseStatus(raw: string | null): FlowExecutionStatus | undefined {
	return raw !== null && isFlowExecutionStatus(raw) ? raw : undefined;
}

function parsePage(raw: string | null): number {
	if (raw === null || !/^\d+$/.test(raw)) {
		return 0;
	}
	return Number(raw);
}

function parseLimit(raw: string | null): number {
	if (raw === null || !/^\d+$/.test(raw)) {
		return DEFAULT_PAGE_SIZE;
	}
	const limit = Number(raw);
	return PAGE_SIZE_OPTIONS.includes(limit) ? limit : DEFAULT_PAGE_SIZE;
}

function setOrDelete(params: URLSearchParams, key: string, value: string | undefined): void {
	if (value === undefined || value === '') {
		params.delete(key);
	} else {
		params.set(key, value);
	}
}

export function useFlowExecutionsFilters(): UseFlowExecutionsFiltersResult {
	const [searchParams, setSearchParams] = useSearchParams();

	const status = parseStatus(searchParams.get(STATUS_PARAM));
	const flow = searchParams.get(FLOW_PARAM) ?? undefined;
	const page = parsePage(searchParams.get(PAGE_PARAM));
	const limit = parseLimit(searchParams.get(LIMIT_PARAM));

	const filters = useMemo<FlowExecutionsFilters>(
		() => ({ status, flow: flow === '' ? undefined : flow, page, limit }),
		[status, flow, page, limit]
	);

	// One atomic URL update per user action (several setSearchParams calls in a row would overwrite each other)
	const update = useCallback(
		(change: (params: URLSearchParams) => void) => {
			setSearchParams(
				previous => {
					const next = new URLSearchParams(previous);
					change(next);
					return next;
				},
				{ replace: true }
			);
		},
		[setSearchParams]
	);

	const setStatus = useCallback(
		(newStatus: FlowExecutionStatus | undefined) => {
			update(params => {
				setOrDelete(params, STATUS_PARAM, newStatus);
				params.delete(PAGE_PARAM);
			});
		},
		[update]
	);

	const setFlow = useCallback(
		(newFlow: string | undefined) => {
			update(params => {
				setOrDelete(params, FLOW_PARAM, newFlow);
				params.delete(PAGE_PARAM);
			});
		},
		[update]
	);

	const setPage = useCallback(
		(newPage: number) => {
			update(params => {
				setOrDelete(params, PAGE_PARAM, newPage > 0 ? String(newPage) : undefined);
			});
		},
		[update]
	);

	const setLimit = useCallback(
		(newLimit: number) => {
			update(params => {
				setOrDelete(params, LIMIT_PARAM, newLimit === DEFAULT_PAGE_SIZE ? undefined : String(newLimit));
				params.delete(PAGE_PARAM);
			});
		},
		[update]
	);

	return { filters, setStatus, setFlow, setPage, setLimit };
}
