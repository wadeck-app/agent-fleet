import { describe, expect, it } from 'vitest';

import { NO_REASON_RECORDED, countSkippedSteps, isSkippedStep, skipReasonOf } from './StepSkip.js';

describe('isSkippedStep', () => {
	it('is true for a completed step that carries a skip reason', () => {
		expect(isSkippedStep({ status: 'completed', skippedReason: "when 'x' was false" })).toBe(true);
	});

	it('is true for a completed step that never started, whatever the record says (records written before reasons existed)', () => {
		expect(isSkippedStep({ status: 'completed' })).toBe(true);
	});

	it('is false for a completed step that ran', () => {
		expect(isSkippedStep({ status: 'completed', startedAt: '2026-10-04T14:00:00.000Z' })).toBe(false);
	});

	it('is false for a step that is not completed', () => {
		expect(isSkippedStep({ status: 'pending' })).toBe(false);
		expect(isSkippedStep({ status: 'failed' })).toBe(false);
		expect(isSkippedStep({ status: 'running' })).toBe(false);
	});
});

describe('skipReasonOf', () => {
	it('gives the recorded reason', () => {
		expect(skipReasonOf({ status: 'completed', skippedReason: 'cancelled by user' })).toBe('cancelled by user');
	});

	it('says that no reason was recorded for a step that never started', () => {
		expect(skipReasonOf({ status: 'completed' })).toBe(NO_REASON_RECORDED);
	});

	it('is undefined for a step that ran', () => {
		expect(skipReasonOf({ status: 'completed', startedAt: '2026-10-04T14:00:00.000Z' })).toBeUndefined();
	});
});

describe('countSkippedSteps', () => {
	it('counts the skipped steps only', () => {
		const steps = [
			{ status: 'completed' as const, startedAt: '2026-10-04T14:00:00.000Z' },
			{ status: 'completed' as const },
			{ status: 'completed' as const, skippedReason: 'x' },
			{ status: 'failed' as const },
		];
		expect(countSkippedSteps(steps)).toBe(2);
	});
});
