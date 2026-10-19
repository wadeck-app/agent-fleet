import type { ExecutionState } from '../execution/ExecutionState.js';

export interface FlowSummary {
	flowId: string;
	executionCount: number;
	failedCount: number;
	/** Start time of the most recent execution of this flow. */
	lastStartedAt: string;
}

/** One row per distinct flowId, most recently started first: what a "filter by flow" picker needs. */
export function summarizeFlows(execs: readonly ExecutionState[]): FlowSummary[] {
	const byFlow = new Map<string, FlowSummary>();
	for (const exec of execs) {
		const summary = byFlow.get(exec.flowId) ?? {
			flowId: exec.flowId,
			executionCount: 0,
			failedCount: 0,
			lastStartedAt: exec.startedAt,
		};
		summary.executionCount += 1;
		if (exec.status === 'failed') {
			summary.failedCount += 1;
		}
		if (new Date(exec.startedAt).getTime() > new Date(summary.lastStartedAt).getTime()) {
			summary.lastStartedAt = exec.startedAt;
		}
		byFlow.set(exec.flowId, summary);
	}
	return [...byFlow.values()].sort(
		(a, b) => new Date(b.lastStartedAt).getTime() - new Date(a.lastStartedAt).getTime()
	);
}
