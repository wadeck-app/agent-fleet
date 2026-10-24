import type { ExecutionState } from '../execution/ExecutionState.js';
import { requireTimestamp, statusTag } from '../view/CellText.js';

export interface LatestRunRow {
	executionId: string;
	/** The full flow name: the table column truncates it to the room it has. */
	flowId: string;
	statusLabel: string;
	startedAt: string;
}

/** The `limit` newest runs (`runs` are newest first) as table rows: short status word, ISO start time. */
export function latestRuns(runs: readonly ExecutionState[], limit: number): LatestRunRow[] {
	return runs.slice(0, limit).map(run => ({
		executionId: run.executionId,
		flowId: run.flowId,
		statusLabel: statusTag(run.status),
		startedAt: requireTimestamp(run.startedAt),
	}));
}
