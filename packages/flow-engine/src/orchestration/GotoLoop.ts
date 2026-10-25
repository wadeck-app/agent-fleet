import type { FailureConfig } from '../types';
import type { SchedulerState } from './SchedulerState';
import type { SchedulerContext } from './SchedulerTypes';

/** The `onFailure.goto` loop: re-runs a target step and everything downstream of it, within an iteration budget. */
export class GotoLoop {
	constructor(
		private readonly state: SchedulerState,
		private readonly context: SchedulerContext
	) {}

	/**
	 * Loops back to `onFailure.goto` for the failed step. Returns false, with the step marked failed
	 * terminally, when its iteration budget is spent; true once the target and its descendants are
	 * invalidated (the failed step itself is NOT marked failed). The caller collects the ready items.
	 */
	trigger(failedStepId: string, onFailure: FailureConfig): boolean {
		const state = this.state;
		const targetStepId = onFailure.goto!;
		const maxIterations = onFailure.maxIterations ?? 3;
		const current = state.loopIterations.get(failedStepId) ?? 0;

		if (current >= maxIterations) {
			state.failedSteps.add(failedStepId);
			return false;
		}

		state.loopIterations.set(failedStepId, current + 1);

		// Collect all descendants of the target step (BFS via reverseDeps)
		const toInvalidate = new Set<string>([targetStepId]);
		const bfsQueue = [targetStepId];
		while (bfsQueue.length > 0) {
			const id = bfsQueue.shift()!;
			for (const dep of state.reverseDeps.get(id) ?? new Set()) {
				if (!toInvalidate.has(dep)) {
					toInvalidate.add(dep);
					bfsQueue.push(dep);
				}
			}
		}

		// A waves parent re-run by the loop starts over from its first wave (all parents first, then the
		// children below, whose hold token depends on the running wave)
		for (const invId of toInvalidate) {
			state.waves.reset(invId);
		}

		// Restore invalidated steps (except skipOnLoop ones)
		for (const invId of toInvalidate) {
			const step = state.steps.get(invId);
			if (!step) {
				throw new Error(`FlowScheduler: unknown stepId "${invId}" in handleLoop()`);
			}
			if ((step as { skipOnLoop?: boolean }).skipOnLoop) {
				continue;
			}

			state.completedSteps.delete(invId);
			state.inFlightSteps.delete(invId);
			state.outputs.delete(invId);
			this.context.stepOutputs.delete(invId);
			// Clear any deferred, sub-step, or superseded state for invalidated steps
			state.deferredOutcomes.delete(invId);
			state.subStepLoopIterations.delete(invId);
			// A loop re-runs the step from scratch, so it is not a sub-step relaunch any more
			state.subStepRelaunchFeedback.delete(invId);
			state.supersededSteps.delete(invId);
			state.subStepFailedChildren.delete(invId);

			// Rebuild pending deps: original deps minus currently completed
			const origDeps = state.originalDeps.get(invId) ?? new Set();
			const remaining = new Set<string>();
			for (const dep of origDeps) {
				if (!state.completedSteps.has(dep)) {
					remaining.add(dep);
				}
			}
			state.pendingDeps.set(invId, remaining);
			state.waves.holdChild(invId);
		}

		return true;
	}

	/** A step that reached its goto target successfully gets its loop budget back when `resetOnSuccess` is set. */
	resetBudgetsTargeting(completedStepId: string): void {
		for (const [stepId, step] of this.state.steps) {
			const onFailure = (step as { onFailure?: FailureConfig }).onFailure;
			if (onFailure?.goto === completedStepId && onFailure.resetOnSuccess) {
				this.state.loopIterations.delete(stepId);
			}
		}
	}
}
