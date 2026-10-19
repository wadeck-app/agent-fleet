import { InvalidQueryError } from '../errors.js';
import type { ExecutionState } from '../execution/ExecutionState.js';

export interface ExecutionFilterOptions {
	/** Max page size (default 20). Ignored when `id` is set. */
	limit?: number;
	/** Rows skipped before the page (default 0). Ignored when `id` is set. */
	offset?: number;
	status?: string;
	flow?: string;
	/** Execution id prefix. A lookup, not a page: pagination is not applied. */
	id?: string;
}

export interface FilteredExecutions {
	items: ExecutionState[];
	/** Matches before pagination. */
	total: number;
}

export const DEFAULT_HISTORY_LIMIT = 20;

function assertNonNegativeInteger(name: string, value: number): void {
	if (!Number.isInteger(value) || value < 0) {
		throw new InvalidQueryError(`Invalid ${name} '${String(value)}': expected a non-negative integer.`);
	}
}

/**
 * The one place that decides which executions a history query returns, for the table and the
 * JSON output alike. `execs` must already be in display order (see loadExecutions).
 */
export function filterExecutions(execs: ExecutionState[], opts: ExecutionFilterOptions): FilteredExecutions {
	const limit = opts.limit ?? DEFAULT_HISTORY_LIMIT;
	const offset = opts.offset ?? 0;
	assertNonNegativeInteger('limit', limit);
	assertNonNegativeInteger('offset', offset);

	let filtered = execs;
	if (opts.status) filtered = filtered.filter(e => e.status === opts.status);
	if (opts.flow) filtered = filtered.filter(e => e.flowId === opts.flow);
	if (opts.id) {
		// Prefix matching: "6u84" matches "6u84r8gf" -- lenient like task ID resolution
		const prefix = opts.id;
		filtered = filtered.filter(e => e.executionId.startsWith(prefix));
		return { items: filtered, total: filtered.length };
	}
	return { items: filtered.slice(offset, offset + limit), total: filtered.length };
}
