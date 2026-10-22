import type { ExecutionState, ExecutionStatus } from '../execution/ExecutionState.js';

export interface FlowSummary {
	flowId: string;
	executionCount: number;
	failedCount: number;
	/** Runs that are not finished (queued, running or re-queued). */
	runningCount: number;
	/** Start time of the most recent execution of this flow. */
	lastStartedAt: string;
	/** Id of the most recently started execution of this flow. */
	lastExecutionId: string;
	/** Status of that execution. */
	lastStatus: ExecutionStatus;
}

/** One row per distinct flowId, most recently started first: what a "filter by flow" picker needs. */
export function summarizeFlows(execs: readonly ExecutionState[]): FlowSummary[] {
	const byFlow = new Map<string, FlowSummary>();
	for (const exec of execs) {
		const summary = byFlow.get(exec.flowId) ?? {
			flowId: exec.flowId,
			executionCount: 0,
			failedCount: 0,
			runningCount: 0,
			lastStartedAt: exec.startedAt,
			lastExecutionId: exec.executionId,
			lastStatus: exec.status,
		};
		summary.executionCount += 1;
		if (exec.status === 'failed') {
			summary.failedCount += 1;
		}
		if (exec.status === 'queued' || exec.status === 'running' || exec.status === 're-queued') {
			summary.runningCount += 1;
		}
		if (new Date(exec.startedAt).getTime() > new Date(summary.lastStartedAt).getTime()) {
			summary.lastStartedAt = exec.startedAt;
			summary.lastExecutionId = exec.executionId;
			summary.lastStatus = exec.status;
		}
		byFlow.set(exec.flowId, summary);
	}
	return [...byFlow.values()].sort(
		(a, b) => new Date(b.lastStartedAt).getTime() - new Date(a.lastStartedAt).getTime()
	);
}
