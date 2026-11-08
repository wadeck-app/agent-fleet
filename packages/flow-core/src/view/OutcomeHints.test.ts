import { describe, expect, it } from 'vitest';

import {
	RECOVERED_RUN_HINT,
	RECOVERED_STEP_HINT,
	isRecoveredStep,
	recoveredStepHint,
	retryHint,
	runStatusHint,
	skippedHint,
	stepStatusHint,
} from './OutcomeHints.js';
import type { StepAttemptView } from './StepAttemptViews.js';

function attempt(n: number, outcome: StepAttemptView['outcome']): StepAttemptView {
	return { n, origin: n === 1 ? 'first' : 'retry', outcome, endReason: 'x', duration: '1s', durationMs: 1000 };
}

describe('wording of the recovered hints (pinned: the UI and flow show share it)', () => {
	it('says what a recovered run is', () => {
		expect(RECOVERED_RUN_HINT).toBe(
			'Completed after an error: a step failed earlier in this run (see "Last error" in the output below) and a later attempt succeeded (retry, loop, restart, relaunch or resume).'
		);
	});

	it('says what a recovered step is when its attempts are unknown', () => {
		expect(RECOVERED_STEP_HINT).toBe(
			'Completed after a failed attempt: an earlier attempt of this step failed and a later one succeeded.'
		);
	});
});

describe('runStatusHint', () => {
	it('explains a recovered run, nothing for a clean or a failed one', () => {
		expect(runStatusHint({ status: 'completed', lastErrorRecovered: true })).toBe(RECOVERED_RUN_HINT);
		expect(runStatusHint({ status: 'completed', lastErrorRecovered: false })).toBeUndefined();
		expect(runStatusHint({ status: 'failed', lastErrorRecovered: false })).toBeUndefined();
		expect(
			runStatusHint({
				status: 'queued',
				lastErrorRecovered: false,
				workspaceWait: { message: 'all 2 slots claimed' },
			})
		).toBe('all 2 slots claimed');
	});
});

describe('isRecoveredStep', () => {
	it('is true for a completed step with a failed attempt in its history', () => {
		expect(
			isRecoveredStep({ status: 'completed', attemptHistory: [attempt(1, 'failed'), attempt(2, 'completed')] })
		).toBe(true);
		expect(
			isRecoveredStep({
				status: 'completed',
				attemptHistory: [attempt(1, 'engine_failed'), attempt(2, 'completed')],
			})
		).toBe(true);
	});
	it('is true for a completed step that still carries an error and has no history (older record)', () => {
		expect(isRecoveredStep({ status: 'completed', error: 'boom' })).toBe(true);
	});
	it('is false for a clean, a failed, a skipped or a pending step', () => {
		expect(isRecoveredStep({ status: 'completed', attemptHistory: [attempt(1, 'completed')] })).toBe(false);
		expect(isRecoveredStep({ status: 'completed' })).toBe(false);
		expect(isRecoveredStep({ status: 'failed', error: 'boom', attemptHistory: [attempt(1, 'failed')] })).toBe(
			false
		);
		expect(isRecoveredStep({ status: 'pending' })).toBe(false);
		expect(isRecoveredStep({ status: 'completed', skipped: true, error: 'boom' })).toBe(false);
	});
});

describe('recoveredStepHint', () => {
	it('names the attempts when they are known', () => {
		expect(recoveredStepHint([attempt(1, 'failed'), attempt(2, 'completed')])).toBe(
			'2 attempts: attempt 1 failed (expand the row to see the attempts), attempt 2 succeeded.'
		);
		expect(recoveredStepHint([attempt(1, 'failed'), attempt(2, 'engine_failed'), attempt(3, 'completed')])).toBe(
			'3 attempts: attempts 1, 2 failed (expand the row to see the attempts), attempt 3 succeeded.'
		);
	});
	it('falls back to the general sentence without history', () => {
		expect(recoveredStepHint(undefined)).toBe(RECOVERED_STEP_HINT);
	});
});

describe('stepStatusHint', () => {
	it('explains a recovered step, a skipped step with its reason, nothing for a clean one', () => {
		expect(stepStatusHint({ status: 'completed', error: 'boom' })).toBe(RECOVERED_STEP_HINT);
		expect(stepStatusHint({ status: 'completed', skipped: true, skippedReason: 'when is false' })).toBe(
			skippedHint('when is false')
		);
		expect(skippedHint('when is false')).toBe('Did not run: when is false.');
		expect(stepStatusHint({ status: 'completed' })).toBeUndefined();
		expect(stepStatusHint({ status: 'failed', error: 'boom' })).toBeUndefined();
	});
});

describe('retryHint', () => {
	it('explains the ambiguous retry texts, nothing for a count', () => {
		expect(retryHint('retries unknown')).toMatch(/no attempt count/);
		expect(retryHint('retry policy unknown')).toMatch(/flow file/);
		expect(retryHint('no retry left')).toMatch(/whole retry budget/);
		expect(retryHint('1 retry')).toBeUndefined();
		expect(retryHint('-')).toBeUndefined();
	});
});
