import { ConditionEvaluationError } from '../processing/ConditionEvaluator';
import type { FailureConfig, RetryConfig } from '../types';
import {
	RestartOnFirstFailure,
	WaitAll,
} from './FlowScheduler.subStepStrategies';
import type {
	SubStepAction,
	SubStepStrategy,
	SubStepStrategyContext,
} from './FlowScheduler.subStepStrategies';

export type { SubStepAction, SubStepStrategy, SubStepStrategyContext };

export interface SchedulerStep {
	id: string;
	depends?: string[];
	when?: string;
	retry?: RetryConfig;
	onFailure?: FailureConfig;
	/** Declares this step as a sub-step of the named parent. Parent completion is blocked until all children reach terminal state. */
	parent?: string;
	/**
	 * Maximum number of times the parent is re-queued when a child sub-step fails.
	 * Defaults to 3. After exhausting attempts the parent is failed terminally.
	 * Configurable on the parent step declaration.
	 */
	maxSubStepIterations?: number;
	/**
	 * Name of the sub-step failure strategy to use on this parent step.
	 * Built-in values: 'restart-on-first-failure' (default), 'wait-all'.
	 * Custom strategies can be registered via FlowSchedulerOptions.extraStrategies.
	 */
	subStepStrategy?: string;
	[key: string]: unknown;
}

export interface FlowSchedulerOptions {
	/**
	 * Additional sub-step strategies beyond the two built-ins
	 * ('restart-on-first-failure' and 'wait-all'). Duplicate names override built-ins.
	 */
	extraStrategies?: SubStepStrategy[];
}

export interface SchedulerContext {
	inputs: Record<string, unknown>;
	stepOutputs: Map<string, Record<string, unknown>>;
	/**
	 * Sub-step error history per parent step. Populated by FlowScheduler when a child fails
	 * and the parent is re-queued. Used by CommandHandler to surface errors in the worker's
	 * template context (${{ context.lastSubStepError }}).
	 * Optional: callers that do not need sub-step re-run can omit it (FlowScheduler initialises lazily).
	 */
	subStepErrors?: Map<string, string[]>;
}

export interface ReadyItem {
	stepId: string;
	step: SchedulerStep;
}

export type StepOutcome = { type: 'completed'; outputs: Record<string, unknown> } | { type: 'failed'; error: string };

export class FlowScheduler {
	private readonly steps = new Map<string, SchedulerStep>();
	/** Original dep set per step -- used when rebuilding after loop invalidation */
	private readonly originalDeps = new Map<string, Set<string>>();
	/** stepId → set of stepIds that depend on it */
	private readonly reverseDeps = new Map<string, Set<string>>();
	/** Remaining unmet deps per step. Entry removed when step is dispatched (all deps met). */
	private readonly pendingDeps = new Map<string, Set<string>>();
	private readonly completedSteps = new Set<string>();
	private readonly failedSteps = new Set<string>();
	/** Steps that have been acknowledged (dispatched) but not yet completed. */
	private readonly inFlightSteps = new Set<string>();
	private readonly retryCount = new Map<string, number>();
	private readonly loopIterations = new Map<string, number>();
	private readonly outputs = new Map<string, Record<string, unknown>>();
	private started = false;

	/** parentId → set of child stepIds (current-run children only, reset when parent is re-queued) */
	private readonly parentToChildren = new Map<string, Set<string>>();
	/** childId → parentId */
	private readonly childToParent = new Map<string, string>();
	/** Stores outcome for parent steps whose completion is deferred waiting for children to settle. */
	private readonly deferredOutcomes = new Map<string, { type: 'completed'; outputs: Record<string, unknown> }>();
	/** Number of times a parent step has been re-queued due to child failure. */
	private readonly subStepLoopIterations = new Map<string, number>();
	/**
	 * Child steps that failed but were superseded by a parent re-run.
	 * They are neither in completedSteps (didn't succeed) nor in failedSteps (not a terminal flow failure).
	 * Counted alongside completedSteps for isTerminal() purposes.
	 */
	private readonly supersededSteps = new Set<string>();
	/**
	 * Per-parent tracking of children that failed during the current run.
	 * Reset whenever the parent is restarted. Used to build SubStepStrategyContext.failedChildren.
	 */
	private readonly subStepFailedChildren = new Map<string, Map<string, string>>();
	/** Registered sub-step strategies, keyed by strategy name. */
	private readonly strategies: Map<string, SubStepStrategy>;

	constructor(
		private readonly context: SchedulerContext,
		options?: FlowSchedulerOptions,
	) {
		this.strategies = new Map<string, SubStepStrategy>([
			[RestartOnFirstFailure.name, RestartOnFirstFailure],
			[WaitAll.name, WaitAll],
		]);
		for (const s of options?.extraStrategies ?? []) {
			this.strategies.set(s.name, s);
		}
	}

	/**
	 * Load all steps. Returns initially ready items.
	 * Call sequence: start() → acknowledge(stepId) → dispatch → complete(stepId, outcome)
	 */
	start(steps: SchedulerStep[], depends: Map<string, string[]>): ReadyItem[] {
		this.started = true;
		for (const step of steps) {
			this.steps.set(step.id, step);
			const deps = depends.get(step.id) ?? [];
			this.originalDeps.set(step.id, new Set(deps));
			this.pendingDeps.set(step.id, new Set(deps));
			for (const dep of deps) {
				if (!this.reverseDeps.has(dep)) this.reverseDeps.set(dep, new Set());
				this.reverseDeps.get(dep)!.add(step.id);
			}
		}
		// Register parent-child relationships declared in the initial step set
		for (const step of steps) {
			if (step.parent) {
				this.registerParentChild(step.id, step.parent);
			}
		}
		return this.collectReady();
	}

	/**
	 * Mark a step as dispatched (in-flight). Prevents duplicate dispatch
	 * if the consumer iterates ready items concurrently. Call immediately after dispatching.
	 */
	acknowledge(stepId: string): void {
		this.inFlightSteps.add(stepId);
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
		// Stale result: step was invalidated by a loop while in-flight -- discard
		if (this.pendingDeps.has(stepId)) {
			this.inFlightSteps.delete(stepId);
			return [];
		}

		this.inFlightSteps.delete(stepId);

		if (outcome.type === 'completed') {
			// Store outputs immediately so children can use them for template rendering
			this.outputs.set(stepId, outcome.outputs);
			this.context.stepOutputs.set(stepId, outcome.outputs);

			// Check if this step has pending children — defer completion until they all settle
			const children = this.parentToChildren.get(stepId);
			if (children && children.size > 0) {
				const hasPending = [...children].some(
					c =>
						!this.completedSteps.has(c) &&
						!this.failedSteps.has(c) &&
						!this.supersededSteps.has(c)
				);
				if (hasPending) {
					this.deferredOutcomes.set(stepId, { type: 'completed', outputs: outcome.outputs });
					return [];
				}
			}

			this.completedSteps.add(stepId);
			// Reset sub-step loop counter on successful parent completion
			this.subStepLoopIterations.delete(stepId);
			this.propagateCompletion(stepId);
			this.handleLoopResetOnSuccess(stepId);
			const ready = this.collectReady();

			// If this step is a child, try to fire its deferred parent
			const parentId = this.childToParent.get(stepId);
			const parentReady = parentId !== undefined ? this.tryFireDeferredParent(parentId) : [];
			return [...ready, ...parentReady];
		}

		// Failed -- check retry first
		const step = this.steps.get(stepId);
		if (!step) throw new Error(`FlowScheduler: unknown stepId "${stepId}" in complete()`);
		const retry = step.retry as RetryConfig | undefined;
		if (retry) {
			const attempts = (this.retryCount.get(stepId) ?? 0) + 1;
			if (attempts <= retry.maxAttempts) {
				this.retryCount.set(stepId, attempts);
				// Re-enqueue immediately (deps already met)
				this.pendingDeps.set(stepId, new Set());
				return this.collectReady();
			}
		}

		// Check loop (onFailure.goto)
		const onFailure = step.onFailure;
		if (onFailure?.goto) {
			return this.handleLoop(stepId, onFailure);
		}

		// If this failed step is a child of a deferred parent, delegate to the configured
		// sub-step strategy to decide whether to restart the parent, wait for more children,
		// or fail the parent terminally.
		// IMPORTANT: checked before failedSteps.add() so hasFailed() stays false during re-run cycles.
		const parentId = this.childToParent.get(stepId);
		if (parentId !== undefined && this.deferredOutcomes.has(parentId)) {
			const parentStep = this.steps.get(parentId);
			const strategyName = parentStep?.subStepStrategy ?? 'restart-on-first-failure';
			const strategy = this.strategies.get(strategyName);
			if (!strategy) {
				throw new Error(
					`FlowScheduler: unknown sub-step strategy "${strategyName}" on step "${parentId}"`,
				);
			}

			// Track this failure for strategy context (persists until parent restarts)
			const failedChildren = this.subStepFailedChildren.get(parentId) ?? new Map<string, string>();
			failedChildren.set(stepId, outcome.error);
			this.subStepFailedChildren.set(parentId, failedChildren);

			const children = this.parentToChildren.get(parentId) ?? new Set<string>();
			// pendingChildren: not yet terminal, excluding the current failing child
			const pendingChildren = new Set<string>(
				[...children].filter(
					c =>
						c !== stepId &&
						!this.completedSteps.has(c) &&
						!this.failedSteps.has(c) &&
						!this.supersededSteps.has(c),
				),
			);
			const completedChildren = new Set<string>([...children].filter(c => this.completedSteps.has(c)));

			const ctx: SubStepStrategyContext = {
				parentId,
				failedChildId: stepId,
				error: outcome.error,
				pendingChildren,
				failedChildren,
				completedChildren,
			};

			const action = strategy.onChildFailure(ctx);

			if (action.type === 'wait') {
				// Strategy wants to wait for remaining children before acting
				this.supersededSteps.add(stepId);
				return [];
			}

			if (action.type === 'fail-parent') {
				this.failedSteps.add(stepId);
				this.deferredOutcomes.delete(parentId);
				return this.complete(parentId, { type: 'failed', error: action.error });
			}

			// action.type === 'restart-parent': check iteration budget before committing
			const iterations = (this.subStepLoopIterations.get(parentId) ?? 0) + 1;
			const maxIterations = parentStep?.maxSubStepIterations ?? 3;

			if (iterations > maxIterations) {
				// Budget exhausted — fail child and parent terminally
				this.failedSteps.add(stepId);
				this.deferredOutcomes.delete(parentId);
				return this.complete(parentId, {
					type: 'failed',
					error: `Sub-step '${stepId}' failed after ${maxIterations} re-run(s): ${outcome.error}`,
				});
			}

			// Mark child as superseded (not a terminal flow failure — parent will address it)
			this.supersededSteps.add(stepId);

			// Record errors so the parent's next execution can reference them via
			// ${{ context.lastSubStepError }} in its prompt template
			const subStepErrors = this.ensureSubStepErrors();
			const accumulated = subStepErrors.get(parentId) ?? [];
			for (const e of action.errors) {
				accumulated.push(e);
			}
			subStepErrors.set(parentId, accumulated);

			// Remove the deferred outcome — parent will re-run
			this.deferredOutcomes.delete(parentId);
			this.subStepLoopIterations.set(parentId, iterations);
			// Reset per-run failure tracking for the next parent run
			this.subStepFailedChildren.delete(parentId);

			// Clear parent's children tracking so re-run starts with an empty child set.
			// Old children (from this run) may still be in-flight; they complete harmlessly
			// since tryFireDeferredParent checks the new (empty/updated) children set.
			this.parentToChildren.set(parentId, new Set());

			// Clear parent's previous outputs — it must re-execute to produce new ones
			this.outputs.delete(parentId);
			this.context.stepOutputs.delete(parentId);

			// Re-queue the parent: restore to pendingDeps with no remaining deps (all its
			// original deps were already met when it was first dispatched)
			this.pendingDeps.set(parentId, new Set());
			return this.collectReady();
		}

		// No parent re-run — mark step as failed terminally
		this.failedSteps.add(stepId);
		return [];
	}

	/**
	 * Reverse of acknowledge(). Called when transport dispatch failed -- the step was never sent.
	 * Consumer is responsible for re-queuing it externally. FlowScheduler removes it from in-flight.
	 */
	unacknowledge(stepId: string): void {
		this.inFlightSteps.delete(stepId);
	}

	/** Total number of steps registered (including injected). */
	getStepCount(): number {
		return this.steps.size;
	}

	/** All step IDs currently registered (initial + injected). */
	getStepIds(): Set<string> {
		return new Set(this.steps.keys());
	}

	/** True when the step has been acknowledged (dispatched) but not yet completed. */
	isInFlight(stepId: string): boolean {
		return this.inFlightSteps.has(stepId);
	}

	/**
	 * Returns the accumulated sub-step error history for the given parent step.
	 * Used by CommandHandler to populate ExecutionContext.subStepErrors before dispatching.
	 */
	getSubStepErrors(stepId: string): string[] {
		return this.context.subStepErrors?.get(stepId) ?? [];
	}

	/** Inject steps dynamically (MCP provideSteps). Returns newly ready items. */
	inject(steps: SchedulerStep[]): ReadyItem[] {
		for (const step of steps) {
			this.steps.set(step.id, step);
			const deps = step.depends ?? [];
			this.originalDeps.set(step.id, new Set(deps));
			// Only wait on deps not already completed
			const remaining = new Set(deps.filter(d => !this.completedSteps.has(d)));
			this.pendingDeps.set(step.id, remaining);
			for (const dep of deps) {
				if (!this.reverseDeps.has(dep)) this.reverseDeps.set(dep, new Set());
				this.reverseDeps.get(dep)!.add(step.id);
			}
			// Register parent-child relationship if declared
			if (step.parent) {
				this.registerParentChild(step.id, step.parent);
			}
		}
		return this.collectReady();
	}

	/**
	 * Register a parent-child relationship.
	 * Public so external callers (tests, CommandHandler) can register relationships explicitly.
	 * Emits a warning to stderr if the parent is already completed — the sub-step is still registered
	 * but will not re-defer the parent.
	 */
	registerParentChild(childId: string, parentId: string): void {
		if (!this.parentToChildren.has(parentId)) {
			this.parentToChildren.set(parentId, new Set());
		}
		this.parentToChildren.get(parentId)!.add(childId);
		this.childToParent.set(childId, parentId);
		if (this.completedSteps.has(parentId)) {
			process.stderr.write(
				`[FlowScheduler] warning: parent step '${parentId}' is already completed; sub-step '${childId}' registered but parent completion will not be re-deferred\n`
			);
		}
	}

	/** True when no steps remain pending (all completed, skipped, superseded, or failed-terminal). Returns false before start() is called. */
	isTerminal(): boolean {
		if (!this.started) return false;
		if (this.hasFailed()) return true;
		// All steps must be settled and none in-flight, pending, or deferred.
		// supersededSteps counts alongside completedSteps: they ran but were superseded by a parent re-run.
		return (
			this.completedSteps.size + this.supersededSteps.size === this.steps.size &&
			this.inFlightSteps.size === 0 &&
			this.pendingDeps.size === 0 &&
			this.deferredOutcomes.size === 0
		);
	}

	/** True when any step failed with no retry or loop remaining. */
	hasFailed(): boolean {
		return this.failedSteps.size > 0;
	}

	/** Current step outputs map (read-only snapshot). Used by CommandHandler to sync ExecutionContext. */
	getOutputs(): Map<string, Record<string, unknown>> {
		return new Map(this.outputs);
	}

	private ensureSubStepErrors(): Map<string, string[]> {
		if (!this.context.subStepErrors) {
			this.context.subStepErrors = new Map();
		}
		return this.context.subStepErrors;
	}

	private collectReady(): ReadyItem[] {
		const ready: ReadyItem[] = [];
		const skipped: string[] = [];

		for (const [stepId, deps] of this.pendingDeps) {
			if (deps.size === 0 && !this.inFlightSteps.has(stepId)) {
				const step = this.steps.get(stepId);
				if (!step) throw new Error(`FlowScheduler: unknown stepId "${stepId}" in collectReady()`);
				this.pendingDeps.delete(stepId);

				if (step.when !== undefined) {
					const shouldRun = this.evaluateWhen(step, stepId);
					if (!shouldRun) {
						this.completedSteps.add(stepId);
						skipped.push(stepId);
						continue;
					}
				}

				ready.push({ stepId, step });
			}
		}

		// Propagate skipped steps so their dependents become ready
		if (skipped.length > 0) {
			for (const skippedId of skipped) {
				for (const deps of this.pendingDeps.values()) {
					deps.delete(skippedId);
				}
			}
			ready.push(...this.collectReady());
		}

		return ready;
	}

	/**
	 * Evaluate a step's when: condition.
	 *
	 * Context exposed to the expression:
	 *   outputs  -- step outputs keyed by dep step id: { 'dep-id': { field: value } }
	 *   inputs   -- flow-level inputs
	 *   steps    -- same data in GitHub Actions shape: { 'dep-id': { outputs: { field: value } } }
	 *              (available in both bare and ${{ }} forms)
	 *
	 * Dot-notation for hyphenated IDs is supported transparently:
	 *   `outputs.get-status.field` → converted to `outputs['get-status'].field`
	 *   `steps.get-status.outputs.field` → converted to `steps['get-status'].outputs.field`
	 *
	 * Both bare expressions and ${{ }} wrapper are supported.
	 */
	private evaluateWhen(step: SchedulerStep, stepId: string): boolean {
		let condition = step.when!.trim();

		// Strip ${{ }} wrapper if present
		if (condition.startsWith('${{') && condition.endsWith('}}')) {
			condition = condition.slice(3, -2).trim();
		}

		// Convert dot-notation segments with hyphens to bracket notation
		// e.g. steps.get-status.outputs.x → steps['get-status'].outputs.x
		condition = FlowScheduler.normalizeDotNotation(condition);

		const depIds = Array.from(this.originalDeps.get(stepId) ?? []);

		// outputs: keyed by dep step id
		const outputs: Record<string, Record<string, unknown>> = {};
		for (const depId of depIds) {
			outputs[depId] = this.outputs.get(depId) ?? {};
		}

		// steps: GitHub Actions shape (for ${{ steps.X.outputs.Y }} style expressions)
		const steps: Record<string, { outputs: Record<string, unknown> }> = {};
		for (const depId of depIds) {
			steps[depId] = { outputs: this.outputs.get(depId) ?? {} };
		}

		try {
			const evalFn = new Function('outputs', 'inputs', 'steps', `"use strict"; return (${condition});`);
			const result = evalFn(outputs, this.context.inputs, steps);
			if (typeof result !== 'boolean') {
				throw new ConditionEvaluationError(
					`Condition must evaluate to boolean, got: ${typeof result}`,
					condition,
					stepId
				);
			}
			return result;
		} catch (err) {
			if (err instanceof ConditionEvaluationError) throw err;
			throw new ConditionEvaluationError(
				`Failed to evaluate condition: ${err instanceof Error ? String(err) : String(err)}`,
				condition,
				stepId
			);
		}
	}

	/**
	 * Convert dot-notation path segments that are not valid JS identifiers to bracket notation.
	 * Handles `outputs.get-status.field` → `outputs['get-status'].field`
	 * and `steps.get-status.outputs.field` → `steps['get-status'].outputs.field`
	 */
	private static normalizeDotNotation(condition: string): string {
		// Match any dot-access segment that contains a hyphen or starts with a digit
		// Pattern: .<segment> where segment is NOT a valid JS identifier
		return condition.replace(/\.([a-zA-Z0-9_][a-zA-Z0-9_-]*-[a-zA-Z0-9_-]*)/g, "['$1']");
	}

	private propagateCompletion(stepId: string): void {
		for (const deps of this.pendingDeps.values()) {
			deps.delete(stepId);
		}
	}

	private handleLoopResetOnSuccess(completedStepId: string): void {
		for (const [stepId, step] of this.steps) {
			const onFailure = (step as { onFailure?: FailureConfig }).onFailure;
			if (onFailure?.goto === completedStepId && onFailure.resetOnSuccess) {
				this.loopIterations.delete(stepId);
			}
		}
	}

	/**
	 * Fire the deferred completion for a parent step if all its current-run children have settled.
	 * Delegates to the configured sub-step strategy's onAllChildrenTerminal() to decide whether to
	 * proceed with normal completion, restart the parent, or fail it terminally.
	 * Returns newly ready items, or [] if not all children are terminal yet.
	 */
	private tryFireDeferredParent(parentId: string): ReadyItem[] {
		if (!this.deferredOutcomes.has(parentId)) return [];
		const children = this.parentToChildren.get(parentId) ?? new Set<string>();
		const allTerminal = [...children].every(
			c =>
				this.completedSteps.has(c) ||
				this.failedSteps.has(c) ||
				this.supersededSteps.has(c),
		);
		if (!allTerminal) return [];

		const parentStep = this.steps.get(parentId);
		const strategyName = parentStep?.subStepStrategy ?? 'restart-on-first-failure';
		const strategy = this.strategies.get(strategyName);
		if (!strategy) {
			throw new Error(
				`FlowScheduler: unknown sub-step strategy "${strategyName}" on step "${parentId}"`,
			);
		}

		const failedChildren = this.subStepFailedChildren.get(parentId) ?? new Map<string, string>();
		const completedChildren = new Set<string>([...children].filter(c => this.completedSteps.has(c)));

		const ctx: Omit<SubStepStrategyContext, 'failedChildId' | 'error'> = {
			parentId,
			// All children are terminal at this point
			pendingChildren: new Set(),
			failedChildren,
			completedChildren,
		};

		const action = strategy.onAllChildrenTerminal(ctx);

		if (action.type === 'wait') {
			// Proceed with normal deferred completion
			const outcome = this.deferredOutcomes.get(parentId)!;
			// Delete before recursing to prevent infinite loop
			this.deferredOutcomes.delete(parentId);
			return this.complete(parentId, outcome);
		}

		if (action.type === 'fail-parent') {
			this.deferredOutcomes.delete(parentId);
			return this.complete(parentId, { type: 'failed', error: action.error });
		}

		// action.type === 'restart-parent': check iteration budget
		const iterations = (this.subStepLoopIterations.get(parentId) ?? 0) + 1;
		const maxIterations = parentStep?.maxSubStepIterations ?? 3;

		if (iterations > maxIterations) {
			this.deferredOutcomes.delete(parentId);
			return this.complete(parentId, {
				type: 'failed',
				error: `Sub-steps of '${parentId}' failed after ${maxIterations} re-run(s): ${action.errors.join(', ')}`,
			});
		}

		// Record errors in context for the next parent run
		const subStepErrors = this.ensureSubStepErrors();
		const accumulated = subStepErrors.get(parentId) ?? [];
		for (const e of action.errors) {
			accumulated.push(e);
		}
		subStepErrors.set(parentId, accumulated);

		this.deferredOutcomes.delete(parentId);
		this.subStepLoopIterations.set(parentId, iterations);
		this.subStepFailedChildren.delete(parentId);
		this.parentToChildren.set(parentId, new Set());
		this.outputs.delete(parentId);
		this.context.stepOutputs.delete(parentId);
		this.pendingDeps.set(parentId, new Set());
		return this.collectReady();
	}

	private handleLoop(failedStepId: string, onFailure: FailureConfig): ReadyItem[] {
		const targetStepId = onFailure.goto!;
		const maxIterations = onFailure.maxIterations ?? 3;
		const current = this.loopIterations.get(failedStepId) ?? 0;

		if (current >= maxIterations) {
			this.failedSteps.add(failedStepId);
			return [];
		}

		this.loopIterations.set(failedStepId, current + 1);

		// Collect all descendants of the target step (BFS via reverseDeps)
		const toInvalidate = new Set<string>([targetStepId]);
		const bfsQueue = [targetStepId];
		while (bfsQueue.length > 0) {
			const id = bfsQueue.shift()!;
			for (const dep of this.reverseDeps.get(id) ?? new Set()) {
				if (!toInvalidate.has(dep)) {
					toInvalidate.add(dep);
					bfsQueue.push(dep);
				}
			}
		}

		// Restore invalidated steps (except skipOnLoop ones)
		for (const invId of toInvalidate) {
			const step = this.steps.get(invId);
			if (!step) throw new Error(`FlowScheduler: unknown stepId "${invId}" in handleLoop()`);
			if ((step as { skipOnLoop?: boolean }).skipOnLoop) continue;

			this.completedSteps.delete(invId);
			this.inFlightSteps.delete(invId);
			this.outputs.delete(invId);
			this.context.stepOutputs.delete(invId);
			// Clear any deferred, sub-step, or superseded state for invalidated steps
			this.deferredOutcomes.delete(invId);
			this.subStepLoopIterations.delete(invId);
			this.supersededSteps.delete(invId);
			this.subStepFailedChildren.delete(invId);

			// Rebuild pending deps: original deps minus currently completed
			const origDeps = this.originalDeps.get(invId) ?? new Set();
			const remaining = new Set<string>();
			for (const dep of origDeps) {
				if (!this.completedSteps.has(dep)) remaining.add(dep);
			}
			this.pendingDeps.set(invId, remaining);
		}

		// The failed step itself is NOT marked failed (loop triggered instead)
		return this.collectReady();
	}
}
