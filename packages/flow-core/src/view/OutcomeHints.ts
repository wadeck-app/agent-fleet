import { NO_RETRY_LEFT, POLICY_UNKNOWN, RETRIES_UNKNOWN } from './RetryBadge.js';
import type { StepAttemptView } from './StepAttemptViews.js';

/**
 * The sentences that explain the short labels of the run and step tables ("ok, recovered", "skipped", "retries unknown").
 * One source for every surface: the tooltips of the web UI and the hint lines of `flow show`.
 */

/**
 * A run is recovered when it completed and `lastError` is set. `lastError` is written at every step failure and never
 * cleared, and a run completes only when every step completed: so a step failed, and the scheduler ran it again
 * (retry, `onFailure.goto` loop, sub-step restart, parent relaunch) or the run was resumed after a failure.
 */
export const RECOVERED_RUN_HINT =
	'Completed after an error: a step failed earlier in this run (see "Last error" in the output below) and a later attempt succeeded (retry, loop, restart, relaunch or resume).';

/** A recovered step whose attempts are not recorded (record written before attempts were logged). */
export const RECOVERED_STEP_HINT =
	'Completed after a failed attempt: an earlier attempt of this step failed and a later one succeeded.';

const FAILED_OUTCOMES: ReadonlySet<string> = new Set(['failed', 'engine_failed']);

function failedAttemptsOf(attempts: readonly StepAttemptView[] | undefined): StepAttemptView[] {
	return (attempts ?? []).filter(attempt => FAILED_OUTCOMES.has(attempt.outcome));
}

export interface RecoverableRun {
	status: string;
	lastErrorRecovered: boolean;
}

/** The hint of a run status label: set for a run that completed after an error, absent otherwise. */
export function runStatusHint(run: RecoverableRun): string | undefined {
	return run.status === 'completed' && run.lastErrorRecovered ? RECOVERED_RUN_HINT : undefined;
}

export interface RecoverableStep {
	status: string;
	skipped?: true;
	skippedReason?: string;
	/** Settled attempts, oldest first. */
	attemptHistory?: readonly StepAttemptView[];
	/** The error still on a completed step (records written before the attempts were logged). */
	error?: string;
}

/**
 * A step completed after a failed attempt: a failed attempt is in its history, or (no history) it still carries an error.
 * A step that did not run is stored as completed but is never recovered.
 */
export function isRecoveredStep(step: RecoverableStep): boolean {
	if (step.status !== 'completed' || step.skipped === true) {
		return false;
	}
	return step.attemptHistory !== undefined && step.attemptHistory.length > 0
		? failedAttemptsOf(step.attemptHistory).length > 0
		: step.error !== undefined;
}

/** "2 attempts: attempt 1 failed (expand the row to see the attempts), attempt 2 succeeded.", or the general sentence without history. */
export function recoveredStepHint(attempts: readonly StepAttemptView[] | undefined): string {
	const failed = failedAttemptsOf(attempts);
	if (attempts === undefined || failed.length === 0) {
		return RECOVERED_STEP_HINT;
	}
	const last = attempts[attempts.length - 1]!;
	const failedNumbers = failed.map(attempt => attempt.n).join(', ');
	const failedWord = failed.length === 1 ? 'attempt' : 'attempts';
	return `${attempts.length} attempts: ${failedWord} ${failedNumbers} failed (expand the row to see the attempts), attempt ${last.n} succeeded.`;
}

/** Why a step did not run. */
export function skippedHint(reason: string): string {
	return `Did not run: ${reason}.`;
}

/** The hint of a step status label: recovered or skipped, absent for any other step. */
export function stepStatusHint(step: RecoverableStep): string | undefined {
	if (step.skipped === true) {
		return step.skippedReason === undefined ? 'Did not run.' : skippedHint(step.skippedReason);
	}
	return isRecoveredStep(step) ? recoveredStepHint(step.attemptHistory) : undefined;
}

// @formatter:off
const RETRY_HINTS: Readonly<Record<string, string>> = {
	[RETRIES_UNKNOWN]: 'The record has no attempt count for this step, so its retries cannot be told.',
	[POLICY_UNKNOWN]:
		'This step failed, but its retry budget is unknown (flow file unreadable or step no longer in it): it is not known whether retries were left.',
	[NO_RETRY_LEFT]: 'This step failed and used its whole retry budget (retry.maxAttempts plus onFailure loops).',
};
// @formatter:on

/** The hint of a Retries cell text: set for the three texts a new user cannot decode, absent for a count. */
export function retryHint(label: string): string | undefined {
	return RETRY_HINTS[label];
}
