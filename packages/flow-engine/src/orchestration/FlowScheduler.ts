import { ConditionEvaluationError } from '../processing/ConditionEvaluator';
import type { FailureConfig, RetryConfig } from '../types';

export interface SchedulerStep {
	id: string;
	depends?: string[];
	when?: string;
	retry?: RetryConfig;
	onFailure?: FailureConfig;
	[key: string]: unknown;
}

export interface SchedulerContext {
	inputs: Record<string, unknown>;
	stepOutputs: Map<string, Record<string, unknown>>;
}

export interface ReadyItem {
	stepId: string;
	step: SchedulerStep;
}

export type StepOutcome = { type: 'completed'; outputs: Record<string, unknown> } | { type: 'failed'; error: string };

export class FlowScheduler {
	private readonly steps = new Map<string, SchedulerStep>();
	/** Original dep set per step — used when rebuilding after loop invalidation */
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

	constructor(private readonly context: SchedulerContext) {}

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
	 * Handles retry: if outcome is 'failed' and retry config allows, re-enqueues the step.
	 * If a loop (onFailure.goto) triggers, invalidates target and descendants and re-enqueues them.
	 * Returns [] if the step was invalidated by a loop before this call arrived (stale result).
	 */
	complete(stepId: string, outcome: StepOutcome): ReadyItem[] {
		// Stale result: step was invalidated by a loop while in-flight — discard
		if (this.pendingDeps.has(stepId)) {
			this.inFlightSteps.delete(stepId);
			return [];
		}

		this.inFlightSteps.delete(stepId);

		if (outcome.type === 'completed') {
			this.outputs.set(stepId, outcome.outputs);
			this.context.stepOutputs.set(stepId, outcome.outputs);
			this.completedSteps.add(stepId);
			this.propagateCompletion(stepId);
			this.handleLoopResetOnSuccess(stepId);
			return this.collectReady();
		}

		// Failed — check retry first
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

		this.failedSteps.add(stepId);
		return [];
	}

	/**
	 * Reverse of acknowledge(). Called when transport dispatch failed — the step was never sent.
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
		}
		return this.collectReady();
	}

	/** True when no steps remain pending (all completed, skipped, or failed-terminal). Returns false before start() is called. */
	isTerminal(): boolean {
		if (!this.started) return false;
		if (this.hasFailed()) return true;
		// All steps must be settled (in completedSteps) and none in-flight or pending
		return (
			this.completedSteps.size === this.steps.size && this.inFlightSteps.size === 0 && this.pendingDeps.size === 0
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
	 *   outputs  — step outputs keyed by dep step id: { 'dep-id': { field: value } }
	 *   inputs   — flow-level inputs
	 *   steps    — same data in GitHub Actions shape: { 'dep-id': { outputs: { field: value } } }
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
			const evalFn = new Function(
				'outputs',
				'inputs',
				'steps',
				`"use strict"; return (${condition});`
			);
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
				`Failed to evaluate condition: ${err instanceof Error ? err.message : String(err)}`,
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
