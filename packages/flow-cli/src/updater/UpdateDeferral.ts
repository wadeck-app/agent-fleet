// Must NOT import any flow runtime modules: bundled into flow-updater.cjs.

export const UPDATE_RETRY_MS = 2 * 60_000;

/**
 * Applies the update unless restarting the daemon would lose work. An unreachable daemon has none.
 * A health body without `work_in_flight` comes from a daemon older than this check: it cannot be
 * judged, so the update waits instead of guessing.
 */
export function decideUpdate(health: Record<string, unknown> | null): 'apply-now' | { defer: true; retryIn: number } {
	if (health === null) return 'apply-now';
	if (health['work_in_flight'] === false) return 'apply-now';
	return { defer: true, retryIn: UPDATE_RETRY_MS };
}
