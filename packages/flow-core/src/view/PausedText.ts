import type { ExecutionState } from '../execution/ExecutionState.js';
import { formatStartedUtc } from '../history/ExecutionFormat.js';

/**
 * A paused run is stored as `running` plus `ExecutionState.paused` (no new status value, like `workspaceWait`): every
 * consumer of the status keeps its meaning, and the places that print a status word it through here.
 */

type PausedFields = Pick<ExecutionState, 'executionId' | 'status' | 'paused'>;

export { PAUSED_LABEL } from './PausedLabels.js';

/** True for a `running` (or still `queued`: accepted, nothing dispatched yet) run that carries `paused` (the field is removed on resume and when the run ends). */
export function isPaused(record: Pick<ExecutionState, 'status' | 'paused'>): boolean {
	return (record.status === 'running' || record.status === 'queued') && record.paused !== undefined;
}

/** Detail lines (`Paused:` since, `Reason:`), indented to line up under the `Status:` value. Empty when the run is not paused. */
export function pausedLines(record: PausedFields): string[] {
	const paused = record.paused;
	if (paused === undefined || !isPaused(record)) {
		return [];
	}
	return [
		`Paused:    since ${formatStartedUtc(paused.since)} (no new step starts; running steps finish; resume with: flow unpause ${record.executionId})`,
		...(paused.reason === undefined ? [] : [`Reason:    ${paused.reason}`]),
	];
}
