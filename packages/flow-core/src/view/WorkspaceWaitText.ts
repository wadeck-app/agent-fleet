import type { ExecutionState } from '../execution/ExecutionState.js';
import { formatDuration, formatStartedUtc } from '../history/ExecutionFormat.js';
import { WAITING_FOR_WORKSPACE_LABEL, WAITING_FOR_WORKSPACE_TAG } from './WorkspaceWaitLabels.js';

export { WAITING_FOR_WORKSPACE_LABEL, WAITING_FOR_WORKSPACE_TAG };

/**
 * A run that waits for a workspace is stored as `queued` plus `ExecutionState.workspaceWait` (no new status value).
 * Every place that prints a status words it the same way through here, so it is never read as an ordinary queued run.
 */

type WaitFields = Pick<ExecutionState, 'status' | 'workspaceWait'>;

/** True for a `queued` run that carries `workspaceWait` (the field is removed when the run starts, fails or is cancelled). */
export function isWaitingForWorkspace(record: WaitFields): boolean {
	return record.status === 'queued' && record.workspaceWait !== undefined;
}

/** The stored status, or {@link WAITING_FOR_WORKSPACE_LABEL} for a run that waits for a workspace. */
export function statusLabelOf(record: WaitFields): string {
	return isWaitingForWorkspace(record) ? WAITING_FOR_WORKSPACE_LABEL : record.status;
}

/**
 * Detail lines of the wait (`Waiting:` since, `Reason:` message), indented to line up under the `Status:` value.
 * Empty when the run does not wait.
 */
export function workspaceWaitLines(record: WaitFields): string[] {
	const wait = record.workspaceWait;
	if (wait === undefined || !isWaitingForWorkspace(record)) {
		return [];
	}
	return [`Waiting:   since ${formatStartedUtc(wait.since)}`, `Reason:    ${wait.message}`];
}

/**
 * The duration of a run: `waiting` while it waits for a workspace (it has not started, so it is not "running"), otherwise
 * from its start to its end. The time a run waited is not part of it: the start of a run that waited is when it got its workspace.
 */
export function runDurationOf(record: WaitFields & { startedAt: string; completedAt: string | null }): string {
	return isWaitingForWorkspace(record) ? 'waiting' : formatDuration(record.startedAt, record.completedAt);
}
