import type { SchedulerState } from './SchedulerState';

/**
 * Settles, as superseded and "not run", the steps that can no longer start in this run because a
 * sub-step they rely on will not succeed. Each reason is recorded in `state.skippedReasons`.
 */
export class SubStepSettler {
	constructor(private readonly state: SchedulerState) {}

	/**
	 * Settles, as superseded, every not-yet-started step under `parentId` that can no longer run because
	 * `childId` will not succeed in this run. The closure follows both relations until nothing new is
	 * reached: a step that depends on a settled step, and a sub-step (`parent:`) of a settled step. Only
	 * descendants of `parentId` are touched and a step is settled at most once, so cycles terminate.
	 */
	settleDependentsOfUnsuccessfulChild(childId: string, parentId: string): void {
		const { pendingDeps, supersededSteps, skippedReasons, parentToChildren, reverseDeps } = this.state;
		const scope = this.state.descendantsOf(parentId);
		const worklist = [childId];
		const settle = (stepId: string, reason: string): void => {
			if (!scope.has(stepId) || !pendingDeps.has(stepId) || supersededSteps.has(stepId)) {
				return;
			}
			pendingDeps.delete(stepId);
			supersededSteps.add(stepId);
			skippedReasons.set(stepId, reason);
			worklist.push(stepId);
		};
		while (worklist.length > 0) {
			const current = worklist.shift()!;
			// Nested sub-steps first: they also depend implicitly on their parent, and "its parent was not run" is the accurate reason.
			for (const nested of parentToChildren.get(current) ?? new Set<string>()) {
				settle(nested, `not run: its parent '${current}' was not run`);
			}
			for (const dependent of reverseDeps.get(current) ?? new Set<string>()) {
				settle(
					dependent,
					`not run: sub-step '${current}' it depends on did not succeed, so '${dependent}' could not start`
				);
			}
		}
	}

	/**
	 * A wave failed and its waves parent is about to restart: the held later waves (and everything nested
	 * in them) are settled as not run, with the wave in the reason, through the same channel as a sibling
	 * dependency. They are reset by the restart; the reason is what `flow show` keeps.
	 */
	settleLaterWaves(parentId: string): void {
		const { waves, pendingDeps, supersededSteps, skippedReasons, parentToChildren } = this.state;
		if (!waves.isWavesParent(parentId)) {
			return;
		}
		const failedWave = waves.currentWaveOf(parentId);
		const later = waves.laterWaveChildren(parentId, parentToChildren.get(parentId) ?? new Set<string>());
		// All roots first, so that each keeps its wave reason instead of a "depends on" one
		for (const { id, wave } of later) {
			if (!pendingDeps.has(id) || supersededSteps.has(id)) {
				continue;
			}
			pendingDeps.delete(id);
			supersededSteps.add(id);
			skippedReasons.set(id, `not run: wave ${failedWave} failed, wave ${wave} was not started`);
		}
		for (const { id } of later) {
			this.settleDependentsOfUnsuccessfulChild(id, parentId);
		}
	}
}
