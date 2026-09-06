/**
 * Pluggable sub-step failure strategies for FlowScheduler.
 *
 * A strategy decides what to do when a child sub-step fails or when all children reach
 * a terminal state. Two built-in strategies are provided; custom strategies can be
 * injected via FlowSchedulerOptions.extraStrategies.
 */

export interface SubStepStrategyContext {
	parentId: string;
	failedChildId: string;
	error: string;
	/** Children not yet in terminal state (excludes the current failing child). */
	pendingChildren: Set<string>;
	/** All children that have failed in this parent run, including the current one. */
	failedChildren: Map<string, string>;
	completedChildren: Set<string>;
}

export type SubStepAction =
	{ type: 'restart-parent'; errors: string[] } | { type: 'wait' } | { type: 'fail-parent'; error: string };

export interface SubStepStrategy {
	name: string;
	/** Called when a child sub-step fails. */
	onChildFailure(ctx: SubStepStrategyContext): SubStepAction;
	/**
	 * Called when all children are terminal (last one just completed or failed via a
	 * preceding onChildFailure→wait cycle). A `wait` result means: proceed with the
	 * normal deferred parent completion. A `restart-parent` result triggers a re-run.
	 */
	onAllChildrenTerminal(ctx: Omit<SubStepStrategyContext, 'failedChildId' | 'error'>): SubStepAction;
}

/**
 * Re-runs the parent immediately when the first child fails.
 * This is the default strategy and preserves the pre-strategy behaviour.
 */
export const RestartOnFirstFailure: SubStepStrategy = {
	name: 'restart-on-first-failure',
	onChildFailure(ctx): SubStepAction {
		return { type: 'restart-parent', errors: [ctx.error] };
	},
	onAllChildrenTerminal(_ctx): SubStepAction {
		// Reached only when all children of the current run passed — fire normal completion.
		return { type: 'wait' };
	},
};

/**
 * Waits for ALL children to reach a terminal state before acting.
 * - If any failed → re-run the parent with ALL accumulated errors.
 * - If all passed → fire normal deferred parent completion.
 */
export const WaitAll: SubStepStrategy = {
	name: 'wait-all',
	onChildFailure(ctx): SubStepAction {
		if (ctx.pendingChildren.size > 0) {
			// More children still in-flight — accumulate and wait.
			return { type: 'wait' };
		}
		// All children are now terminal and at least one failed.
		return { type: 'restart-parent', errors: [...ctx.failedChildren.values()] };
	},
	onAllChildrenTerminal(ctx): SubStepAction {
		if (ctx.failedChildren.size > 0) {
			return { type: 'restart-parent', errors: [...ctx.failedChildren.values()] };
		}
		// All children passed — proceed with normal deferred completion.
		return { type: 'wait' };
	},
};
