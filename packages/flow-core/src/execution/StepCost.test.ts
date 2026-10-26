import { describe, expect, it } from 'vitest';

import type { AttemptRecord, StepState } from './ExecutionState.js';
import { formatStepCost, sumStepCosts, summarizeStepCost } from './StepCost.js';

function attempt(n: number, extra: Partial<AttemptRecord> = {}): AttemptRecord {
	return {
		n,
		origin: n === 1 ? 'first' : 'relaunch',
		startedAt: '2026-10-26T10:00:00.000Z',
		endedAt: '2026-10-26T10:01:00.000Z',
		durationMs: 60_000,
		outcome: 'completed',
		endReason: 'completed',
		provider: 'claude',
		sessionId: 's1',
		...extra,
	};
}

function stepWithLog(log: AttemptRecord[], extra: Partial<StepState> = {}): Pick<StepState, 'attemptLog' | 'attempts'> {
	return { attemptLog: log, attempts: log.length, ...extra };
}

function usdOf(summary: ReturnType<typeof summarizeStepCost>): (number | undefined)[] {
	return summary.attempts.map(a => a.usd);
}

describe('summarizeStepCost: attempt log', () => {
	it('uses the measured claude capture: cumulative session gives deltas and a total equal to the final value', () => {
		const summary = summarizeStepCost(
			stepWithLog([attempt(1, { usd: 0.00637995 }), attempt(2, { usd: 0.00749017 })])
		);
		expect(summary.attempts[0]!.usd).toBeCloseTo(0.00637995, 10);
		expect(summary.attempts[1]!.usd).toBeCloseTo(0.00111022, 10);
		expect(summary.totalUsd).toBeCloseTo(0.00749017, 10);
		expect(summary.lastAttemptUsd).toBeCloseTo(0.00111022, 10);
		expect(summary.complete).toBe(true);
		expect(summary.unknownAttempts).toBe(0);
		expect(summary.basis).toBe('log');
	});

	it('splits the cumulative tokens of a shared session the same way (measured capture)', () => {
		const summary = summarizeStepCost(
			stepWithLog([
				attempt(1, { usd: 0.00637995, tokens: { input: 2, output: 4, cacheRead: 0, cacheWrite: 51022 } }),
				attempt(2, { usd: 0.00749017, tokens: { input: 4, output: 8, cacheRead: 45902, cacheWrite: 56214 } }),
			])
		);
		expect(summary.attempts[0]!.tokens).toEqual({ input: 2, output: 4, cacheRead: 0, cacheWrite: 51022 });
		expect(summary.attempts[1]!.tokens).toEqual({ input: 2, output: 4, cacheRead: 45902, cacheWrite: 5192 });
	});

	it('gives no tokens for an attempt whose tokens went backwards or whose cost is unknown', () => {
		const summary = summarizeStepCost(
			stepWithLog([
				attempt(1, { usd: 1, tokens: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0 } }),
				attempt(2, { usd: 2, tokens: { input: 5, output: 20, cacheRead: 0, cacheWrite: 0 } }),
				attempt(3, { usd: undefined, tokens: { input: 5, output: 20, cacheRead: 0, cacheWrite: 0 } }),
			])
		);
		expect(summary.attempts[1]!.tokens).toBeUndefined();
		expect(summary.attempts[2]!.tokens).toBeUndefined();
	});

	it('sums the final values of distinct sessions', () => {
		const summary = summarizeStepCost(
			stepWithLog([
				attempt(1, { usd: 1, sessionId: 'a' }),
				attempt(2, { usd: 0.5, sessionId: 'b' }),
				attempt(3, { usd: 1.75, sessionId: 'a' }),
			])
		);
		expect(usdOf(summary)).toEqual([1, 0.5, 0.75]);
		expect(summary.totalUsd).toBeCloseTo(2.25, 10);
		expect(summary.complete).toBe(true);
	});

	it('marks an attempt unknown when the cumulative value decreases, keeps the earlier value as a lower bound and never goes back to summing', () => {
		const summary = summarizeStepCost(
			stepWithLog([attempt(1, { usd: 2 }), attempt(2, { usd: 1 }), attempt(3, { usd: 3 })])
		);
		expect(usdOf(summary)).toEqual([2, undefined, undefined]);
		expect(summary.totalUsd).toBe(2);
		expect(summary.complete).toBe(false);
		expect(summary.unknownAttempts).toBe(2);
		expect(summary.attempts[1]!.unknownReason).toMatch(/decreased/);
	});

	it('marks claude attempts without a session id unknown when the step has several attempts', () => {
		const summary = summarizeStepCost(
			stepWithLog([attempt(1, { usd: 1, sessionId: undefined }), attempt(2, { usd: 2, sessionId: undefined })])
		);
		expect(usdOf(summary)).toEqual([undefined, undefined]);
		expect(summary.totalUsd).toBeUndefined();
		expect(summary.unknownAttempts).toBe(2);
		expect(summary.attempts[0]!.unknownReason).toMatch(/session id/);
	});

	it('counts a lone attempt in full even without a session id (nothing to be cumulative with)', () => {
		const summary = summarizeStepCost(stepWithLog([attempt(1, { usd: 0.4, sessionId: undefined })]));
		expect(summary.totalUsd).toBe(0.4);
		expect(summary.complete).toBe(true);
	});

	it('marks attempts without a provider (older entries) unknown when the step has several attempts', () => {
		const summary = summarizeStepCost(
			stepWithLog([attempt(1, { usd: 1, provider: undefined }), attempt(2, { usd: 2, provider: undefined })])
		);
		expect(summary.totalUsd).toBeUndefined();
		expect(summary.unknownAttempts).toBe(2);
	});

	it('marks a non-claude attempt unknown when its session is shared, counts it in full when alone in its session', () => {
		const shared = summarizeStepCost(
			stepWithLog([attempt(1, { usd: 1, provider: 'opencode' }), attempt(2, { usd: 2, provider: 'opencode' })])
		);
		expect(usdOf(shared)).toEqual([undefined, undefined]);
		expect(shared.attempts[0]!.unknownReason).toMatch(/opencode/);

		const alone = summarizeStepCost(
			stepWithLog([
				attempt(1, { usd: 1, provider: 'opencode', sessionId: 'a' }),
				attempt(2, { usd: 2, provider: 'opencode', sessionId: 'b' }),
			])
		);
		expect(usdOf(alone)).toEqual([1, 2]);
		expect(alone.totalUsd).toBe(3);
		expect(alone.complete).toBe(true);
	});

	it('never sums an attempt without a reported cost as zero', () => {
		const summary = summarizeStepCost(
			stepWithLog([attempt(1, { usd: undefined, sessionId: 'a' }), attempt(2, { usd: 0.5, sessionId: 'b' })])
		);
		expect(usdOf(summary)).toEqual([undefined, 0.5]);
		expect(summary.totalUsd).toBe(0.5);
		expect(summary.complete).toBe(false);
		expect(summary.unknownAttempts).toBe(1);
	});

	it('treats the attempt that follows an unknown one of the same session as unknown, but keeps the final cumulative value in the total', () => {
		const summary = summarizeStepCost(stepWithLog([attempt(1, { usd: undefined }), attempt(2, { usd: 0.7 })]));
		expect(usdOf(summary)).toEqual([undefined, undefined]);
		expect(summary.totalUsd).toBe(0.7);
		expect(summary.complete).toBe(false);
		expect(summary.unknownAttempts).toBe(2);
	});

	it('counts the folded attempts of the overflow as unknown (their cumulative baseline is gone)', () => {
		const summary = summarizeStepCost({
			...stepWithLog([attempt(51, { usd: 3 })]),
			attempts: 51,
			attemptOverflow: { count: 3, usd: 9, usdUnknownCount: 0, durationMs: 1 },
		});
		expect(summary.totalUsd).toBe(3);
		expect(summary.complete).toBe(false);
		expect(summary.unknownAttempts).toBe(3);
	});
});

describe('summarizeStepCost: records without an attempt log', () => {
	const meta = (usd: number, reported?: boolean) =>
		({
			model: 'm',
			session_id: 's',
			session_file: '',
			ttft_ms: 0,
			duration_ms: 1,
			cost: {
				input_tokens: 0,
				output_tokens: 0,
				cache_read_tokens: 0,
				cache_write_tokens: 0,
				usd,
				...(reported === undefined ? {} : { reported }),
			},
		}) as StepState['meta'];

	it('reads the single recorded cost when the step ran once', () => {
		const summary = summarizeStepCost({ meta: meta(0.25), attempts: 1 });
		expect(summary).toMatchObject({ basis: 'meta', totalUsd: 0.25, complete: true, unknownAttempts: 0 });
	});

	it('shows the last attempt only, incomplete, when the step ran several times', () => {
		const summary = summarizeStepCost({ meta: meta(0.25), attempts: 4 });
		expect(summary).toMatchObject({
			basis: 'last-attempt-only',
			totalUsd: 0.25,
			complete: false,
			unknownAttempts: 3,
			attemptCount: 4,
		});
	});

	it('is unknown when the only meta says the cost was not reported', () => {
		const summary = summarizeStepCost({ meta: meta(0, false), attempts: 1 });
		expect(summary.totalUsd).toBeUndefined();
		expect(summary.complete).toBe(false);
		expect(summary.unknownAttempts).toBe(1);
	});

	it('has no cost for a step without model meta', () => {
		expect(summarizeStepCost({})).toMatchObject({ basis: 'none', unknownAttempts: 0 });
		expect(summarizeStepCost({ meta: { duration_ms: 1, exit_code: 0 } })).toMatchObject({ basis: 'none' });
	});
});

describe('formatStepCost', () => {
	it.each([
		[
			{ totalUsd: 0.00749017, complete: true, unknownAttempts: 0, basis: 'log' as const, attemptCount: 2 },
			'$0.0075',
		],
		[
			{ totalUsd: 2.79, complete: false, unknownAttempts: 2, basis: 'log' as const, attemptCount: 5 },
			'$2.7900+ (2 attempts unknown)',
		],
		[
			{ totalUsd: 2.79, complete: false, unknownAttempts: 1, basis: 'log' as const, attemptCount: 5 },
			'$2.7900+ (1 attempt unknown)',
		],
		[
			{ totalUsd: undefined, complete: false, unknownAttempts: 2, basis: 'log' as const, attemptCount: 2 },
			'unknown',
		],
		[
			{
				totalUsd: 0.3,
				complete: false,
				unknownAttempts: 7,
				basis: 'last-attempt-only' as const,
				attemptCount: 8,
			},
			'$0.3000 (last attempt of 8, earlier not recorded)',
		],
		[
			{ totalUsd: undefined, complete: true, unknownAttempts: 0, basis: 'none' as const, attemptCount: 0 },
			undefined,
		],
	])('%j -> %s', (input, expected) => {
		expect(formatStepCost(input)).toBe(expected);
	});
});

describe('sumStepCosts', () => {
	it('adds known totals, ignores steps without cost and carries incompleteness', () => {
		const a = summarizeStepCost(stepWithLog([attempt(1, { usd: 1 })]));
		const b = summarizeStepCost(
			stepWithLog([attempt(1, { usd: 2, sessionId: 'x' }), attempt(2, { usd: undefined, sessionId: 'y' })])
		);
		const none = summarizeStepCost({});
		const total = sumStepCosts([a, b, none]);
		expect(total).toMatchObject({ totalUsd: 3, complete: false, unknownAttempts: 1 });
		expect(formatStepCost(total)).toBe('$3.0000+ (1 attempt unknown)');
	});

	it('has no total when no step has a cost', () => {
		expect(sumStepCosts([summarizeStepCost({})])).toMatchObject({ basis: 'none' });
		expect(sumStepCosts([])).toMatchObject({ basis: 'none' });
	});

	it('is unknown (not zero) when every costed step is unknown', () => {
		const unknown = summarizeStepCost(stepWithLog([attempt(1, { usd: undefined })]));
		const total = sumStepCosts([unknown]);
		expect(total.totalUsd).toBeUndefined();
		expect(formatStepCost(total)).toBe('unknown');
	});
});
