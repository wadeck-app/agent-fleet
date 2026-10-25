import type { FailureConfig, RetryConfig } from '../types';
import type { SubStepStrategy } from './FlowScheduler.subStepStrategies';

/** What is known of a sub-step for the parent: its outputs, status, and the failure error when there is one. */
export interface SubStepRecord {
	outputs: Record<string, unknown>;
	status: string;
	error?: string;
}

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
	 * Built-in values: 'restart-on-first-failure' (default), 'wait-all', 'waves'.
	 * Custom strategies can be registered via FlowSchedulerOptions.extraStrategies.
	 */
	subStepStrategy?: string;
	/** Wave of a direct sub-step of a parent using `subStepStrategy: waves` (required there, see SubStepWaves). */
	wave?: number;
	[key: string]: unknown;
}

export interface FlowSchedulerOptions {
	/**
	 * Additional sub-step strategies beyond the built-ins
	 * ('restart-on-first-failure', 'wait-all' and 'waves'). Duplicate names override built-ins.
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
	/**
	 * Sub-step results for the most recent failed iteration, keyed by parent step ID then child step ID.
	 * Populated when a parent is re-queued due to child failure.
	 * Consumed by TemplateRenderer via ${{ subSteps.stepId.outputs.* }} and ${{ subSteps.stepId.status.failed }}.
	 */
	subSteps?: Map<string, SubStepRecord>;
}

export interface ReadyItem {
	stepId: string;
	step: SchedulerStep;
}

/**
 * Who decided a step failed. `step`: the step's own result (script exit code, model validation),
 * so the author's `retry`, `onFailure.goto` and the sub-step relaunch of the parent apply.
 * `engine`: the engine gave up on the step (stall watchdog, lost worker) without a result from it;
 * the step may already have had an effect, so none of those apply and the failure is terminal.
 */
export type FailureOrigin = 'step' | 'engine';

export type StepOutcome =
	| { type: 'completed'; outputs: Record<string, unknown> }
	| { type: 'failed'; error: string; outputs?: Record<string, unknown>; origin?: FailureOrigin };
