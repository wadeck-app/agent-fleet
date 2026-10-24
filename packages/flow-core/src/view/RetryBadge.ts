import type { FlowDefinition } from 'flow-engine/types';

/**
 * The retry cell of a step in the steps table. The DataTable `badge` colours a cell whose text is exactly a key, so
 * the texts are a small fixed set (RETRY_BADGE_VARIANTS) and the YAML copies that map (a test compares them).
 */

/** From this many retries on, the text stops counting. */
export const MAX_COUNTED_RETRIES = 3;

export const NO_RETRY_LEFT = 'no retry left';
const POLICY_UNKNOWN = 'retry policy unknown';
const RETRIES_UNKNOWN = 'retries unknown';
const NOT_STARTED = '-';

type RetryBadgeVariant = 'success' | 'warning' | 'danger' | 'default';

// Texts outside this map (the dash of a step that has not started) stay plain.
// @formatter:off
export const RETRY_BADGE_VARIANTS: Readonly<Record<string, RetryBadgeVariant>> = {
	'0 retry': 'success',
	'1 retry': 'warning',
	'2 retries': 'warning',
	[`${MAX_COUNTED_RETRIES}+ retries`]: 'warning',
	[NO_RETRY_LEFT]: 'danger',
	[POLICY_UNKNOWN]: 'default',
	[RETRIES_UNKNOWN]: 'default',
};
// @formatter:on

/** How many more starts a step is allowed after its first one: `retry.maxAttempts` plus the `onFailure.goto` loop limit. */
export interface StepRetryPolicy {
	retryBudget: number;
}

// Same default as the scheduler (FlowScheduler.handleLoop) and the graph builder.
const DEFAULT_LOOP_ITERATIONS = 3;

/**
 * The retry budget of each step of a flow. The scheduler counts `retry.maxAttempts` once per step (never reset) and
 * allows `onFailure.maxIterations` loops on top of it, so a step that failed after that many extra starts is out of retries.
 */
export function retryPoliciesOf(flow: Pick<FlowDefinition, 'steps'>): Record<string, StepRetryPolicy> {
	const policies: Record<string, StepRetryPolicy> = {};
	for (const step of flow.steps) {
		const retries = step.retry?.maxAttempts ?? 0;
		const loops = step.onFailure?.goto ? (step.onFailure.maxIterations ?? DEFAULT_LOOP_ITERATIONS) : 0;
		policies[step.id] = { retryBudget: retries + loops };
	}
	return policies;
}

export interface StepRetryFacts {
	status: string;
	attempts?: number;
}

/** The retry cell text: the number of retries (attempts - 1, 0 included), or "no retry left" for a failed step that cannot be retried. */
export function retryLabel(step: StepRetryFacts, policy: StepRetryPolicy | undefined): string {
	if (step.status === 'pending') {
		return NOT_STARTED;
	}
	if (step.attempts === undefined) {
		return RETRIES_UNKNOWN;
	}
	const retries = Math.max(0, step.attempts - 1);
	if (step.status === 'failed') {
		// Red only on evidence: without the flow definition a failed step may still have had budget.
		if (policy === undefined) {
			return POLICY_UNKNOWN;
		}
		if (retries >= policy.retryBudget) {
			return NO_RETRY_LEFT;
		}
	}
	if (retries === 0) {
		return '0 retry';
	}
	if (retries >= MAX_COUNTED_RETRIES) {
		return `${MAX_COUNTED_RETRIES}+ retries`;
	}
	return retries === 1 ? '1 retry' : `${retries} retries`;
}
