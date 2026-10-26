import { RestartOnFirstFailure, WaitAll, Waves } from './FlowScheduler.subStepStrategies';
import type { SubStepAction, SubStepStrategy, SubStepStrategyContext } from './FlowScheduler.subStepStrategies';
import { GotoLoop } from './GotoLoop';
import { ReadyStepCollector } from './ReadyStepCollector';
import { SchedulerState } from './SchedulerState';
import type {
	FailureOrigin,
	FlowSchedulerOptions,
	ReadyItem,
	SchedulerContext,
	SchedulerStep,
	StepOutcome,
	SubStepRecord,
} from './SchedulerTypes';
import { SubStepCoordinator } from './SubStepCoordinator';
import { buildSubStepFeedback } from './SubStepFeedback';
import { SubStepRestarter } from './SubStepRestarter';
import { SubStepSettler } from './SubStepSettler';
import { WhenConditionEvaluator } from './WhenConditionEvaluator';

export type { SubStepAction, SubStepStrategy, SubStepStrategyContext };
export type {
	FailureOrigin,
	FlowSchedulerOptions,
	ReadyItem,
	SchedulerContext,
	SchedulerStep,
	StepOutcome,
	SubStepRecord,
};
export { buildSubStepFeedback };

/**
 * Dependency-ordered dispatch of flow steps: tells the consumer which steps are ready and what a
 * step outcome changes (retry, `onFailure.goto` loops, parent/sub-step deferral and restart).
 * The bookkeeping lives in {@link SchedulerState}; each responsibility has its own collaborator.
 */
export class FlowScheduler {
	private readonly state = new SchedulerState();
	private readonly readyStepCollector: ReadyStepCollector;
	private readonly gotoLoop: GotoLoop;
	private readonly coordinator: SubStepCoordinator;

	constructor(
		private readonly context: SchedulerContext,
		options?: FlowSchedulerOptions
	) {
		const strategies = new Map<string, SubStepStrategy>([
			[RestartOnFirstFailure.name, RestartOnFirstFailure],
			[WaitAll.name, WaitAll],
			[Waves.name, Waves],
		]);
		for (const s of options?.extraStrategies ?? []) {
			strategies.set(s.name, s);
		}
		this.readyStepCollector = new ReadyStepCollector(
			this.state,
			new WhenConditionEvaluator(this.state.originalDeps, this.state.outputs, context)
		);
		this.gotoLoop = new GotoLoop(this.state, context);
		this.coordinator = new SubStepCoordinator(
			this.state,
			strategies,
			new SubStepSettler(this.state),
			new SubStepRestarter(this.state, context),
			{
				complete: (stepId, outcome) => this.complete(stepId, outcome),
				collectReady: () => this.collectReady(),
			}
		);
	}

	/**
	 * Load all steps. Returns initially ready items.
	 * Call sequence: start() -> acknowledge(stepId) -> dispatch -> complete(stepId, outcome)
	 */
	start(steps: SchedulerStep[], depends: Map<string, string[]>): ReadyItem[] {
		const state = this.state;
		state.started = true;
		for (const step of steps) {
			state.steps.set(step.id, step);
			const deps = depends.get(step.id) ?? [];
			state.originalDeps.set(step.id, new Set(deps));
			state.pendingDeps.set(step.id, new Set(deps));
			for (const dep of deps) {
				if (!state.reverseDeps.has(dep)) {
					state.reverseDeps.set(dep, new Set());
				}
				state.reverseDeps.get(dep)!.add(step.id);
			}
		}
		// Register parent-child relationships declared in the initial step set
		for (const step of steps) {
			if (step.parent) {
				// Track as a static child so it gets re-queued when the parent restarts
				if (!state.staticChildren.has(step.parent)) {
					state.staticChildren.set(step.parent, new Set());
				}
				state.staticChildren.get(step.parent)!.add(step.id);
				this.registerParentChild(step.id, step.parent);
				state.waves.registerChild(step);
			}
		}
		return this.collectReady();
	}

	/**
	 * Mark a step as dispatched (in-flight). Prevents duplicate dispatch
	 * if the consumer iterates ready items concurrently. Call immediately after dispatching.
	 */
	acknowledge(stepId: string): void {
		this.state.inFlightSteps.add(stepId);
	}

	/**
	 * Mark a step as finished. Returns newly ready items.
	 *
	 * Handles retry: if outcome is 'failed' and retry config allows, re-enqueues the step.
	 * If a loop (onFailure.goto) triggers, invalidates target and descendants and re-enqueues them.
	 * Returns [] if the step was invalidated by a loop before this call arrived (stale result).
	 *
	 * Parent-blocking:
	 * - If the completed step has pending children, completion is deferred until all children settle.
	 * - If a child fails: parent is re-queued for re-execution (with error recorded in
	 *   context.subStepErrors). Repeats up to step.maxSubStepIterations (default 3) times,
	 *   then the parent is failed terminally.
	 */
	complete(stepId: string, outcome: StepOutcome): ReadyItem[] {
		const state = this.state;
		// Stale result: step was invalidated by a loop while in-flight -- discard
		if (state.pendingDeps.has(stepId)) {
			state.inFlightSteps.delete(stepId);
			return [];
		}

		state.inFlightSteps.delete(stepId);

		if (outcome.type === 'completed') {
			return this.completeSuccessfully(stepId, outcome.outputs);
		}

		// Failed -- check retry first
		const step = state.steps.get(stepId);
		if (!step) {
			throw new Error(`FlowScheduler: unknown stepId "${stepId}" in complete()`);
		}
		if (outcome.origin === 'engine') {
			return this.failEngineOrigin(stepId, outcome.error);
		}
		const retry = step.retry;
		if (retry) {
			const attempts = (state.retryCount.get(stepId) ?? 0) + 1;
			if (attempts <= retry.maxAttempts) {
				state.retryCount.set(stepId, attempts);
				// Re-enqueue immediately (deps already met)
				state.pendingDeps.set(stepId, new Set());
				return this.collectReady();
			}
		}

		// Check loop (onFailure.goto)
		const onFailure = step.onFailure;
		if (onFailure?.goto) {
			return this.gotoLoop.trigger(stepId, onFailure) ? this.collectReady() : [];
		}

		// If this failed step is a child of a deferred parent, its strategy decides what happens next.
		const parentId = state.childToParent.get(stepId);
		if (parentId !== undefined && state.deferredOutcomes.has(parentId)) {
			return this.coordinator.onChildFailure(stepId, parentId, outcome);
		}

		// No parent re-run -- mark step as failed terminally
		state.failedSteps.add(stepId);
		return [];
	}

	private completeSuccessfully(stepId: string, outputs: Record<string, unknown>): ReadyItem[] {
		const state = this.state;
		// The launch that consumed the relaunch feedback is over; a later launch is a plain one
		state.subStepRelaunchFeedback.delete(stepId);
		// Store outputs immediately so children can use them for template rendering
		state.outputs.set(stepId, outputs);
		this.context.stepOutputs.set(stepId, outputs);

		// Check if this step has pending children -- defer completion until they all settle
		const children = state.parentToChildren.get(stepId);
		if (children && children.size > 0) {
			const hasPending = [...children].some(c => !state.isSettled(c));
			if (hasPending) {
				state.deferredOutcomes.set(stepId, { type: 'completed', outputs });
				// Release only sub-step dependents (children that depend on this step).
				// Non-sub-step dependents (e.g. handoff) stay blocked until parent fully completes.
				for (const [depId, depDeps] of state.pendingDeps) {
					if (depDeps.has(stepId) && state.childToParent.get(depId) === stepId) {
						depDeps.delete(stepId);
					}
				}
				if (state.waves.isWavesParent(stepId)) {
					// Start the first wave. A wave whose members are all skipped by `when` is terminal at once:
					// no child completion will ever fire the parent, so check it here.
					state.waves.releaseFirst(stepId, children);
					const ready = this.collectReady();
					return [...ready, ...this.coordinator.tryFireDeferredParent(stepId)];
				}
				return this.collectReady();
			}
		}

		state.completedSteps.add(stepId);
		// Reset sub-step loop counter on successful parent completion
		state.subStepLoopIterations.delete(stepId);
		this.propagateCompletion(stepId);
		this.gotoLoop.resetBudgetsTargeting(stepId);
		const ready = this.collectReady();

		// If this step is a child, try to fire its deferred parent
		const parentId = state.childToParent.get(stepId);
		const parentReady = parentId !== undefined ? this.coordinator.tryFireDeferredParent(parentId) : [];
		return [...ready, ...parentReady];
	}

	/**
	 * Parents failed because the engine failed one of their sub-steps, each with the reason. Returned
	 * once and forgotten, so the consumer can record them where the user looks: the sub-step's own
	 * error does not say that the parent was given up on too.
	 */
	takeParentFailures(): { stepId: string; message: string }[] {
		const taken = [...this.state.parentFailureMessages].map(([stepId, message]) => ({ stepId, message }));
		this.state.parentFailureMessages.clear();
		return taken;
	}

	/**
	 * Terminal failure of a step the engine gave up on: no retry, no `onFailure.goto`, no sub-step
	 * relaunch. A deferred parent is failed with it (recursively), with the real error in the message.
	 */
	private failEngineOrigin(stepId: string, error: string): ReadyItem[] {
		const state = this.state;
		state.failedSteps.add(stepId);
		const parentId = state.childToParent.get(stepId);
		if (parentId === undefined || !state.deferredOutcomes.has(parentId)) {
			return [];
		}
		state.deferredOutcomes.delete(parentId);
		const message =
			`Sub-step '${stepId}' of '${parentId}' failed on an engine failure, not on its own result: ${error} ` +
			`The sub-step was not retried and '${parentId}' was not relaunched, because the sub-step may already have had an effect.`;
		state.parentFailureMessages.set(parentId, message);
		return this.complete(parentId, { type: 'failed', error: message, origin: 'engine' });
	}

	/**
	 * Reverse of acknowledge(). Called when transport dispatch failed -- the step was never sent.
	 * Consumer is responsible for re-queuing it externally. FlowScheduler removes it from in-flight.
	 */
	unacknowledge(stepId: string): void {
		this.state.inFlightSteps.delete(stepId);
	}

	/** Total number of steps registered (including injected). */
	getStepCount(): number {
		return this.state.steps.size;
	}

	/** All step IDs currently registered (initial + injected). */
	getStepIds(): Set<string> {
		return new Set(this.state.steps.keys());
	}

	/** True when the step has been acknowledged (dispatched) but not yet completed. */
	isInFlight(stepId: string): boolean {
		return this.state.inFlightSteps.has(stepId);
	}

	/**
	 * How many retries (`retry`) the scheduler has granted this step so far; 0 for a step never retried or unknown. Read-only:
	 * lets the consumer tell a retry from any other re-run (loop, sub-step round) when the step starts again.
	 */
	getRetryCount(stepId: string): number {
		return this.state.retryCount.get(stepId) ?? 0;
	}

	/**
	 * Returns the accumulated sub-step error history for the given parent step.
	 * Used by CommandHandler to populate ExecutionContext.subStepErrors before dispatching.
	 */
	getSubStepErrors(stepId: string): string[] {
		return this.context.subStepErrors?.get(stepId) ?? [];
	}

	/**
	 * Returns the current subSteps map, populated when a parent step is re-queued after child failure.
	 * Used by FlowOrchestrator to sync into TemplateContext before rendering the next parent execution.
	 */
	getSubSteps(): Map<string, SubStepRecord> | undefined {
		return this.context.subSteps;
	}

	/**
	 * Feedback of the failed sub-steps when the next (or current) launch of `stepId` is a relaunch
	 * caused by them, `undefined` for any other launch. Unlike `getSubSteps()` this is per step:
	 * the consumer resumes the parent's own session with it instead of re-rendering the prompt.
	 */
	getSubStepRelaunchFeedback(stepId: string): string | undefined {
		return this.state.subStepRelaunchFeedback.get(stepId);
	}

	/**
	 * Throws, with the fix, when `step` cannot be injected now (a sub-step of a waves parent without a valid
	 * wave, or in a wave that is already over). Lets a caller refuse a request before recording anything.
	 */
	assertInjectable(step: SchedulerStep): void {
		this.state.waves.assertAdmissible(step);
	}

	/** Inject steps dynamically (MCP provideSteps). Returns newly ready items. */
	inject(steps: SchedulerStep[]): ReadyItem[] {
		const state = this.state;
		// Fail before touching any state when a sub-step cannot join its waves parent
		for (const step of steps) {
			state.waves.assertAdmissible(step);
		}
		for (const step of steps) {
			state.steps.set(step.id, step);
			// parent implicitly depends on the parent step
			const explicit = step.depends ?? [];
			const deps = step.parent && !explicit.includes(step.parent) ? [...explicit, step.parent] : explicit;
			state.originalDeps.set(step.id, new Set(deps));
			// Only wait on deps not already completed
			// A sub-step joining a waves parent that already ran (deferred) does not wait for it: its wave decides
			const remaining = new Set(
				deps.filter(
					d => !state.completedSteps.has(d) && !(d === step.parent && this.joinsDeferredWavesParent(d))
				)
			);
			state.pendingDeps.set(step.id, remaining);
			for (const dep of deps) {
				if (!state.reverseDeps.has(dep)) {
					state.reverseDeps.set(dep, new Set());
				}
				state.reverseDeps.get(dep)!.add(step.id);
			}
			// Register parent-child relationship if declared
			if (step.parent) {
				this.registerParentChild(step.id, step.parent);
				state.waves.registerChild(step);
			}
		}
		return this.collectReady();
	}

	/**
	 * Register a parent-child relationship.
	 * Public so external callers (tests, CommandHandler) can register relationships explicitly.
	 * Emits a warning to stderr if the parent is already completed -- the sub-step is still registered
	 * but will not re-defer the parent.
	 */
	registerParentChild(childId: string, parentId: string): void {
		const state = this.state;
		if (!state.parentToChildren.has(parentId)) {
			state.parentToChildren.set(parentId, new Set());
		}
		state.parentToChildren.get(parentId)!.add(childId);
		state.childToParent.set(childId, parentId);
		if (state.completedSteps.has(parentId)) {
			process.stderr.write(
				`[FlowScheduler] warning: parent step '${parentId}' is already completed; sub-step '${childId}' registered but parent completion will not be re-deferred\n`
			);
		}
	}

	/** True when no steps remain pending (all completed, skipped, superseded, or failed-terminal). Returns false before start() is called. */
	isTerminal(): boolean {
		const state = this.state;
		if (!state.started) {
			return false;
		}
		if (this.hasFailed()) {
			return true;
		}
		// All steps must be settled and none in-flight, pending, or deferred.
		// supersededSteps counts alongside completedSteps: they ran but were superseded by a parent re-run.
		return (
			state.completedSteps.size + state.supersededSteps.size === state.steps.size &&
			state.inFlightSteps.size === 0 &&
			state.pendingDeps.size === 0 &&
			state.deferredOutcomes.size === 0
		);
	}

	/** True when any step failed with no retry or loop remaining. */
	hasFailed(): boolean {
		return this.state.failedSteps.size > 0;
	}

	/**
	 * Re-arms a terminally failed step as ready to dispatch again, as if it had never failed.
	 *
	 * No other step is touched or re-run -- only the one step named. Used by CommandHandler to
	 * resume an execution after a `user_intervention` step was answered late, past its original
	 * timeout: the rest of the flow's state (outputs, completed steps) is untouched because
	 * nothing else ever ran again.
	 *
	 * Only valid when this step is the sole reason {@link hasFailed} is true: resuming it while
	 * an unrelated step is also terminally failed would un-pause an execution that still cannot
	 * succeed, silently hiding the other failure.
	 */
	resumeFailedStep(stepId: string): ReadyItem {
		const state = this.state;
		if (!state.failedSteps.has(stepId)) {
			throw new Error(`FlowScheduler: step "${stepId}" is not failed, cannot resume it.`);
		}
		const otherFailed = [...state.failedSteps].filter(id => id !== stepId);
		if (otherFailed.length > 0) {
			throw new Error(
				`FlowScheduler: cannot resume step "${stepId}" because other step(s) are also terminally failed: ${otherFailed.join(', ')}.`
			);
		}
		const step = state.steps.get(stepId);
		if (!step) {
			throw new Error(`FlowScheduler: unknown stepId "${stepId}" in resumeFailedStep()`);
		}
		state.failedSteps.delete(stepId);
		return { stepId, step };
	}

	/** Current step outputs map (read-only snapshot). Used by CommandHandler to sync ExecutionContext. */
	getOutputs(): Map<string, Record<string, unknown>> {
		return new Map(this.state.outputs);
	}

	/**
	 * Steps settled without ever running because a sibling sub-step they depend on failed, each with
	 * the reason. Returned once and forgotten, so the consumer can record them where the user looks
	 * (`flow show`).
	 */
	takeSkippedSteps(): { stepId: string; reason: string }[] {
		const taken = [...this.state.skippedReasons].map(([stepId, reason]) => ({ stepId, reason }));
		this.state.skippedReasons.clear();
		return taken;
	}

	/**
	 * Sub-steps (nested ones included) a parent restart put back to pending, returned once and forgotten, so
	 * the consumer can reset their record too: what `flow show` kept of the previous round (a "not run"
	 * reason, an error) no longer describes a step that is about to run again.
	 */
	takeRequeuedSteps(): string[] {
		const taken = [...this.state.requeuedSteps];
		this.state.requeuedSteps.clear();
		return taken;
	}

	private joinsDeferredWavesParent(parentId: string): boolean {
		return this.state.deferredOutcomes.has(parentId) && this.state.waves.isWavesParent(parentId);
	}

	private collectReady(): ReadyItem[] {
		return this.readyStepCollector.collect();
	}

	private propagateCompletion(stepId: string): void {
		for (const deps of this.state.pendingDeps.values()) {
			deps.delete(stepId);
		}
	}
}
