import type { ExecutionState, ExecutionStatus } from '../execution/ExecutionState.js';

export type StatusCounts = Record<ExecutionStatus, number> & { total: number };

// Typed against ExecutionStatus so a status added to the model fails the build here instead of being miscounted.
const STATUSES = [
	'queued',
	'running',
	'completed',
	'failed',
	're-queued',
] as const satisfies readonly ExecutionStatus[];

/**
 * Number of executions per status (zero included) and in total: what a status filter shows next to each choice.
 * With `flow`, only that flow's executions count, like `filterExecutions({ flow })`.
 */
export function countByStatus(execs: readonly ExecutionState[], flow?: string): StatusCounts {
	const counts: StatusCounts = { total: 0, queued: 0, running: 0, completed: 0, failed: 0, 're-queued': 0 };
	for (const exec of execs) {
		if (flow !== undefined && exec.flowId !== flow) {
			continue;
		}
		if (!(STATUSES as readonly string[]).includes(exec.status)) {
			throw new Error(
				`Cannot count execution ${exec.executionId}: unknown status '${String(exec.status)}' (known: ${STATUSES.join(', ')}). Corrupt execution file?`
			);
		}
		counts[exec.status] += 1;
		counts.total += 1;
	}
	return counts;
}
