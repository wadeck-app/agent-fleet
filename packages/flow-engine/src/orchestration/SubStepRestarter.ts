import type { SchedulerState } from './SchedulerState';
import type { SchedulerContext, SubStepRecord } from './SchedulerTypes';
import { buildSubStepFeedback } from './SubStepFeedback';

/**
 * Restarts a parent whose sub-steps failed: records what failed for its next run, resets its
 * static sub-steps to a clean slate and puts the parent back in the pending set.
 */
export class SubStepRestarter {
	constructor(
		private readonly state: SchedulerState,
		private readonly context: SchedulerContext
	) {}

	/**
	 * Commits the restart of `parentId` as its `iterations`-th re-run. The caller has already checked the
	 * iteration budget and settled what the restart supersedes; it collects the ready items afterwards.
	 */
	restart(parentId: string, errors: string[], iterations: number): void {
		const state = this.state;

		// Record errors so the parent's next execution can reference them via
		// ${{ context.lastSubStepError }} in its prompt template
		const subStepErrors = this.ensureSubStepErrors();
		const accumulated = subStepErrors.get(parentId) ?? [];
		for (const e of errors) {
			accumulated.push(e);
		}
		subStepErrors.set(parentId, accumulated);

		// Remove the deferred outcome -- parent will re-run
		state.deferredOutcomes.delete(parentId);
		state.subStepLoopIterations.set(parentId, iterations);
		// Reset per-run failure tracking for the next parent run
		const failedChildrenSnapshot = state.subStepFailedChildren.get(parentId) ?? new Map<string, string>();
		const failedOutputsSnapshot =
			state.subStepFailedOutputs.get(parentId) ?? new Map<string, Record<string, unknown>>();
		state.subStepFailedChildren.delete(parentId);
		state.subStepFailedOutputs.delete(parentId);

		// Populate context.subSteps so the parent prompt can reference sub-step data
		const subStepsMap = new Map<string, SubStepRecord>();
		for (const [childId, childError] of failedChildrenSnapshot) {
			subStepsMap.set(childId, {
				outputs: failedOutputsSnapshot.get(childId) ?? {},
				status: 'failed',
				error: childError,
			});
		}
		this.context.subSteps = subStepsMap;
		state.subStepRelaunchFeedback.set(parentId, buildSubStepFeedback(subStepsMap));

		// Re-queue static children for the next run so they validate the fresh parent
		// output. Dynamic (inject()-based) children are re-injected by the caller.
		this.requeueChildrenForParent(parentId);

		// Clear parent's previous outputs -- it must re-execute to produce new ones
		state.outputs.delete(parentId);
		this.context.stepOutputs.delete(parentId);

		// Re-queue the parent: restore to pendingDeps with no remaining deps (all its
		// original deps were already met when it was first dispatched)
		state.pendingDeps.set(parentId, new Set());
	}

	private ensureSubStepErrors(): Map<string, string[]> {
		if (!this.context.subStepErrors) {
			this.context.subStepErrors = new Map();
		}
		return this.context.subStepErrors;
	}

	/**
	 * Re-queue static children (declared at start()) for the next run of a restarted parent, and the
	 * static sub-steps nested under them: they validate the output of a step that runs again, so they
	 * must run again too (including a nested sub-step that exhausted its budget and is marked failed).
	 * Two-phase: first clear all of them from terminal sets, then rebuild their pendingDeps (always
	 * waiting for their own parent, plus any sibling deps that haven't completed yet). Dynamic children
	 * (inject()-based) are not touched -- callers re-inject them after each parent run as needed.
	 */
	private requeueChildrenForParent(parentId: string): void {
		const state = this.state;
		const staticIds = state.staticDescendantsOf(parentId);
		state.waves.reset(parentId);

		// Phase 1: remove all static descendants from terminal sets so they can re-run
		for (const childId of staticIds) {
			state.supersededSteps.delete(childId);
			state.completedSteps.delete(childId);
			state.failedSteps.delete(childId);
			state.inFlightSteps.delete(childId);
			state.outputs.delete(childId);
			this.context.stepOutputs.delete(childId);
			// A nested parent starts a fresh run: no deferred outcome, no spent budget, no stale failures
			state.deferredOutcomes.delete(childId);
			state.subStepLoopIterations.delete(childId);
			state.subStepRelaunchFeedback.delete(childId);
			state.subStepFailedChildren.delete(childId);
			state.subStepFailedOutputs.delete(childId);
			state.requeuedSteps.add(childId);
		}

		// Phase 2: rebuild pendingDeps after all children are cleared (order-independent)
		for (const childId of staticIds) {
			const ownParent = state.childToParent.get(childId);
			const origDeps = state.originalDeps.get(childId) ?? new Set<string>();
			const pendingForChild = new Set<string>();
			for (const dep of origDeps) {
				// Always wait for the parent (being re-run); keep other unmet deps
				if (dep === ownParent || !state.completedSteps.has(dep)) {
					pendingForChild.add(dep);
				}
			}
			state.pendingDeps.set(childId, pendingForChild);
			// A waves parent starts over from its first wave: every wave is held again
			state.waves.holdChild(childId);
		}

		// Reset parentToChildren: static children only (dynamic will be re-injected by caller)
		for (const restartedId of [parentId, ...staticIds]) {
			const own = state.staticChildren.get(restartedId);
			if (restartedId === parentId || own !== undefined) {
				state.parentToChildren.set(restartedId, new Set(own ?? []));
			}
		}
	}
}
