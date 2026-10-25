import type { UpdateState } from '@wadeck-app/shared-updater';

/**
 * One-line, user-facing outcome for a terminal update state written by the current updater run.
 * Throws on a status it does not know: a new shared-updater status must be handled here explicitly.
 */
export function describeUpdateState(state: UpdateState): string {
	switch (state.status) {
		case 'success':
			return `updated to ${state.targetVersion}`;
		case 'deferred': {
			const retryInMinutes = Math.round(((state.retryAt ?? state.timestamp) - state.timestamp) / 60_000);
			return `deferred -- a flow execution is active on the daemon; will retry automatically in ${retryInMinutes} minute${retryInMinutes === 1 ? '' : 's'}`;
		}
		case 'failed':
			return `update failed -- ${state.error}`;
		case 'rolled-back':
			return `update rolled back to ${state.previousVersion} -- new version failed its self-check`;
		case 'applying':
			// The updater repairs a leftover 'applying' journal on every run; ending on it means the repair
			// could not complete (e.g. an orphan npm process could not be stopped).
			return (
				`interrupted install not repaired -- an earlier \`npm install -g\` was cut (updater pid ${state.pid ?? 'unknown'}, ` +
				`target ${state.targetVersion ?? 'unknown'}). Run \`flow cli update\` again; see the updater log for details.`
			);
		case 'update-available':
			// Only written by the 'with-daemon' strategy -- the flow updater always uses 'without-daemon'.
			throw new Error(`[flow-updater] unexpected state status for the without-daemon strategy: ${state.status}`);
		default:
			throw new Error(`[flow-updater] unrecognized state status: ${String(state.status)}`);
	}
}
