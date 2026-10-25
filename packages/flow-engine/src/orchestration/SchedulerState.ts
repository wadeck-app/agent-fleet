import type { SchedulerStep } from './SchedulerTypes';
import { SubStepWaves } from './SubStepWaves';

/**
 * The mutable bookkeeping of one FlowScheduler run, shared by the collaborators that each own one
 * responsibility (readiness, goto loops, sub-step settling, restart, strategy routing). It holds data
 * and read-only graph queries only; every transition is decided by the collaborator that owns it.
 */
export class SchedulerState {
	readonly steps = new Map<string, SchedulerStep>();
	/** Original dep set per step -- used when rebuilding after loop invalidation */
	readonly originalDeps = new Map<string, Set<string>>();
	/** stepId -> set of stepIds that depend on it */
	readonly reverseDeps = new Map<string, Set<string>>();
	/** Remaining unmet deps per step. Entry removed when step is dispatched (all deps met). */
	readonly pendingDeps = new Map<string, Set<string>>();
	readonly completedSteps = new Set<string>();
	readonly failedSteps = new Set<string>();
	/** Steps that have been acknowledged (dispatched) but not yet completed. */
	readonly inFlightSteps = new Set<string>();
	readonly retryCount = new Map<string, number>();
	readonly loopIterations = new Map<string, number>();
	readonly outputs = new Map<string, Record<string, unknown>>();
	started = false;

	/** parentId -> set of child stepIds (current-run children only, reset when parent is re-queued) */
	readonly parentToChildren = new Map<string, Set<string>>();
	/** childId -> parentId */
	readonly childToParent = new Map<string, string>();
	/** Stores outcome for parent steps whose completion is deferred waiting for children to settle. */
	readonly deferredOutcomes = new Map<string, { type: 'completed'; outputs: Record<string, unknown> }>();
	/** Number of times a parent step has been re-queued due to child failure. */
	readonly subStepLoopIterations = new Map<string, number>();
	/**
	 * Child steps that failed but were superseded by a parent re-run.
	 * They are neither in completedSteps (didn't succeed) nor in failedSteps (not a terminal flow failure).
	 * Counted alongside completedSteps for isTerminal() purposes.
	 */
	readonly supersededSteps = new Set<string>();
	/**
	 * Per-parent tracking of children that failed during the current run.
	 * Reset whenever the parent is restarted. Used to build SubStepStrategyContext.failedChildren.
	 */
	readonly subStepFailedChildren = new Map<string, Map<string, string>>();
	/**
	 * Per-parent tracking of outputs from failed children during the current run.
	 * Parallel to subStepFailedChildren. Reset whenever the parent is restarted.
	 * Used to populate context.subSteps for the next parent execution.
	 */
	readonly subStepFailedOutputs = new Map<string, Map<string, Record<string, unknown>>>();
	/**
	 * Static children declared at flow start (via start()). On parent restart these are
	 * re-queued automatically so the sub-step validates the fresh parent output.
	 * Dynamic children (injected via inject()) are NOT tracked here -- callers re-inject
	 * them after each parent run as needed (e.g., MCP provideSteps pattern).
	 */
	readonly staticChildren = new Map<string, Set<string>>();
	/**
	 * Per-parent feedback of the sub-steps that failed in the run that just ended, set when the
	 * parent is re-queued because of them and kept until the relaunched parent completes (so a
	 * retry or a re-dispatch of the same launch still carries it). Its presence is what tells a
	 * consumer "this launch of the parent is a sub-step relaunch": it must resume the parent's
	 * session with this text instead of re-rendering the original prompt.
	 */
	readonly subStepRelaunchFeedback = new Map<string, string>();
	/** Sub-steps settled without running (their dependency failed), awaiting takeSkippedSteps. */
	readonly skippedReasons = new Map<string, string>();
	/**
	 * Why a parent was failed because of a sub-step: an engine-origin failure of the sub-step, or a waves
	 * parent that exhausted its maxSubStepIterations (the wave is named).
	 */
	readonly parentFailureMessages = new Map<string, string>();
	/** Sub-steps reset to a clean slate by a parent restart, awaiting takeRequeuedSteps. */
	readonly requeuedSteps = new Set<string>();
	/** Wave state of the parents using `subStepStrategy: waves`. */
	readonly waves = new SubStepWaves(this.steps, this.pendingDeps);

	/** True when the step reached a state that will not change in this run (completed, failed or superseded). */
	isSettled(stepId: string): boolean {
		return this.completedSteps.has(stepId) || this.failedSteps.has(stepId) || this.supersededSteps.has(stepId);
	}

	/** Every step nested, at any depth, under `rootId` through `parent:`. */
	descendantsOf(rootId: string): Set<string> {
		const found = new Set<string>();
		const worklist = [rootId];
		while (worklist.length > 0) {
			for (const child of this.parentToChildren.get(worklist.shift()!) ?? new Set<string>()) {
				if (!found.has(child)) {
					found.add(child);
					worklist.push(child);
				}
			}
		}
		return found;
	}

	/** Static sub-steps (declared at start()) nested, at any depth, under `rootId`. */
	staticDescendantsOf(rootId: string): Set<string> {
		const found = new Set<string>();
		const worklist = [rootId];
		while (worklist.length > 0) {
			for (const childId of this.staticChildren.get(worklist.shift()!) ?? new Set<string>()) {
				if (!found.has(childId)) {
					found.add(childId);
					worklist.push(childId);
				}
			}
		}
		return found;
	}
}
