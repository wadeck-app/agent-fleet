import type { SubStepStrategy, SubStepStrategyContext } from './FlowScheduler.subStepStrategies';
import type { SchedulerState } from './SchedulerState';
import type { ReadyItem, StepOutcome } from './SchedulerTypes';
import type { SubStepRestarter } from './SubStepRestarter';
import type { SubStepSettler } from './SubStepSettler';

/** The scheduler operations the coordinator re-enters (a failed parent goes through the normal completion path). */
export interface SubStepCoordinatorHooks {
	complete(stepId: string, outcome: StepOutcome): ReadyItem[];
	collectReady(): ReadyItem[];
}

const DEFAULT_SUB_STEP_STRATEGY = 'restart-on-first-failure';
const DEFAULT_MAX_SUB_STEP_ITERATIONS = 3;

/**
 * Applies the parent's sub-step strategy: decides, when a sub-step fails or when all sub-steps are
 * terminal, whether the deferred parent completes, waits, is restarted (within its iteration budget)
 * or is failed terminally.
 */
export class SubStepCoordinator {
	constructor(
		private readonly state: SchedulerState,
		private readonly strategies: Map<string, SubStepStrategy>,
		private readonly settler: SubStepSettler,
		private readonly restarter: SubStepRestarter,
		private readonly hooks: SubStepCoordinatorHooks
	) {}

	/**
	 * A sub-step of the deferred parent `parentId` failed with its own result: delegate to the parent's
	 * strategy to decide whether to restart the parent, wait for more children, or fail the parent terminally.
	 * IMPORTANT: runs before the sub-step is added to failedSteps so hasFailed() stays false during re-run cycles.
	 */
	onChildFailure(stepId: string, parentId: string, outcome: Extract<StepOutcome, { type: 'failed' }>): ReadyItem[] {
		const state = this.state;
		const parentStep = state.steps.get(parentId);
		const strategyName = parentStep?.subStepStrategy ?? DEFAULT_SUB_STEP_STRATEGY;
		const strategy = this.strategies.get(strategyName);
		if (!strategy) {
			throw new Error(`FlowScheduler: unknown sub-step strategy "${strategyName}" on step "${parentId}"`);
		}

		// Track this failure for strategy context (persists until parent restarts)
		const failedChildren = state.subStepFailedChildren.get(parentId) ?? new Map<string, string>();
		failedChildren.set(stepId, outcome.error);
		state.subStepFailedChildren.set(parentId, failedChildren);

		const failedOutputs = state.subStepFailedOutputs.get(parentId) ?? new Map<string, Record<string, unknown>>();
		failedOutputs.set(stepId, outcome.outputs ?? {});
		state.subStepFailedOutputs.set(parentId, failedOutputs);

		const allChildren = state.parentToChildren.get(parentId) ?? new Set<string>();
		// A waves parent reasons about the running wave only: later waves are held, not pending
		const children = state.waves.scope(parentId, allChildren);
		// pendingChildren: not yet terminal, excluding the current failing child
		const pendingChildren = new Set<string>([...children].filter(c => c !== stepId && !state.isSettled(c)));
		const completedChildren = new Set<string>([...children].filter(c => state.completedSteps.has(c)));

		const ctx: SubStepStrategyContext = {
			parentId,
			failedChildId: stepId,
			error: outcome.error,
			pendingChildren,
			failedChildren,
			completedChildren,
			waves: state.waves.strategyState(parentId, allChildren),
		};

		const action = strategy.onChildFailure(ctx);
		if (action.type === 'release-wave') {
			throw new Error(
				`FlowScheduler: sub-step strategy "${strategyName}" returned release-wave from onChildFailure; only onAllChildrenTerminal may start a wave`
			);
		}

		if (action.type === 'wait') {
			// Strategy wants to wait for remaining children before acting
			state.supersededSteps.add(stepId);
			// Siblings that depend on this child can never start: settle them now, otherwise
			// they stay pending forever and the deferred parent never fires.
			this.settler.settleDependentsOfUnsuccessfulChild(stepId, parentId);
			return this.tryFireDeferredParent(parentId);
		}

		if (action.type === 'fail-parent') {
			state.failedSteps.add(stepId);
			state.deferredOutcomes.delete(parentId);
			return this.hooks.complete(parentId, { type: 'failed', error: action.error });
		}

		// action.type === 'restart-parent': check iteration budget before committing
		const iterations = (state.subStepLoopIterations.get(parentId) ?? 0) + 1;
		const maxIterations = parentStep?.maxSubStepIterations ?? DEFAULT_MAX_SUB_STEP_ITERATIONS;

		if (iterations > maxIterations) {
			// Budget exhausted -- fail child and parent terminally
			state.failedSteps.add(stepId);
			state.deferredOutcomes.delete(parentId);
			const message = `Sub-step '${stepId}' failed${state.waves.failedWaveLabel(parentId)} after ${maxIterations} re-run(s): ${outcome.error}`;
			this.recordWavesBudgetExhaustion(parentId, message);
			return this.hooks.complete(parentId, { type: 'failed', error: message });
		}

		// Mark child as superseded (not a terminal flow failure -- parent will address it)
		state.supersededSteps.add(stepId);
		this.settler.settleLaterWaves(parentId);
		this.restarter.restart(parentId, action.errors, iterations);
		return this.hooks.collectReady();
	}

	/**
	 * Fire the deferred completion for a parent step if all its current-run children have settled.
	 * Delegates to the configured sub-step strategy's onAllChildrenTerminal() to decide whether to
	 * proceed with normal completion, restart the parent, or fail it terminally.
	 * Returns newly ready items, or [] if not all children are terminal yet.
	 */
	tryFireDeferredParent(parentId: string): ReadyItem[] {
		const state = this.state;
		if (!state.deferredOutcomes.has(parentId)) {
			return [];
		}
		const allChildren = state.parentToChildren.get(parentId) ?? new Set<string>();
		// A waves parent is settled wave by wave: held later-wave children are legitimately pending
		const children = state.waves.scope(parentId, allChildren);
		const allTerminal = [...children].every(c => state.isSettled(c));
		if (!allTerminal) {
			return [];
		}

		const parentStep = state.steps.get(parentId);
		const strategyName = parentStep?.subStepStrategy ?? DEFAULT_SUB_STEP_STRATEGY;
		const strategy = this.strategies.get(strategyName);
		if (!strategy) {
			throw new Error(`FlowScheduler: unknown sub-step strategy "${strategyName}" on step "${parentId}"`);
		}

		const failedChildren = state.subStepFailedChildren.get(parentId) ?? new Map<string, string>();
		const completedChildren = new Set<string>([...children].filter(c => state.completedSteps.has(c)));

		const ctx: Omit<SubStepStrategyContext, 'failedChildId' | 'error'> = {
			parentId,
			// All children are terminal at this point
			pendingChildren: new Set(),
			failedChildren,
			completedChildren,
			waves: state.waves.strategyState(parentId, allChildren),
		};

		const action = strategy.onAllChildrenTerminal(ctx);

		if (action.type === 'release-wave') {
			state.waves.release(parentId, action.wave, allChildren);
			// The released wave may hold only steps skipped by `when`, which settle without a completion event
			const ready = this.hooks.collectReady();
			return [...ready, ...this.tryFireDeferredParent(parentId)];
		}

		if (action.type === 'wait') {
			// Proceed with normal deferred completion
			const outcome = state.deferredOutcomes.get(parentId)!;
			// Delete before recursing to prevent infinite loop
			state.deferredOutcomes.delete(parentId);
			return this.hooks.complete(parentId, outcome);
		}

		if (action.type === 'fail-parent') {
			state.deferredOutcomes.delete(parentId);
			return this.hooks.complete(parentId, { type: 'failed', error: action.error });
		}

		// action.type === 'restart-parent': check iteration budget
		const iterations = (state.subStepLoopIterations.get(parentId) ?? 0) + 1;
		const maxIterations = parentStep?.maxSubStepIterations ?? DEFAULT_MAX_SUB_STEP_ITERATIONS;

		if (iterations > maxIterations) {
			state.deferredOutcomes.delete(parentId);
			const message = `Sub-steps of '${parentId}' failed${state.waves.failedWaveLabel(parentId)} after ${maxIterations} re-run(s): ${action.errors.join(', ')}`;
			this.recordWavesBudgetExhaustion(parentId, message);
			return this.hooks.complete(parentId, { type: 'failed', error: message });
		}

		this.settler.settleLaterWaves(parentId);
		this.restarter.restart(parentId, action.errors, iterations);
		return this.hooks.collectReady();
	}

	/** A waves parent that gave up after maxSubStepIterations: name the wave where the user looks. */
	private recordWavesBudgetExhaustion(parentId: string, message: string): void {
		if (this.state.waves.isWavesParent(parentId)) {
			this.state.parentFailureMessages.set(parentId, message);
		}
	}
}
