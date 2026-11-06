import type { StepState } from './ExecutionState.js';

// A skipped step is stored as `completed` (the persisted status unions are read by many consumers), so every
// presentation asks THIS module whether a step ran. Two signs: a `skippedReason`, or a `completed` step that never
// started (records written before reasons existed, e.g. a step whose `when` was false).

type SkipFacts = Pick<StepState, 'status' | 'startedAt' | 'skippedReason' | 'attempts'>;

/** What is printed for a step that never ran and whose record holds no reason. */
export const NO_REASON_RECORDED = 'did not run (no reason recorded)';

/** The word shown in place of the status of a step that did not run. */
export const SKIPPED_LABEL = 'skipped';

export function isSkippedStep(step: SkipFacts): boolean {
	if (step.status !== 'completed') {
		return false;
	}
	// An attempt count proves it ran, even on a record that lost its start time.
	return step.skippedReason !== undefined || (step.startedAt === undefined && (step.attempts ?? 0) === 0);
}

/** Why the step did not run; undefined for a step that ran. */
export function skipReasonOf(step: SkipFacts): string | undefined {
	return isSkippedStep(step) ? (step.skippedReason ?? NO_REASON_RECORDED) : undefined;
}

export function countSkippedSteps(steps: readonly SkipFacts[]): number {
	return steps.filter(isSkippedStep).length;
}
