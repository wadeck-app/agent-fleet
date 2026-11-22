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

	it('marks an attempt of an unverified provider unknown when its session is shared, counts it in full when alone in its session', () => {
		const shared = summarizeStepCost(
			stepWithLog([attempt(1, { usd: 1, provider: 'other' }), attempt(2, { usd: 2, provider: 'other' })])
		);
		expect(usdOf(shared)).toEqual([undefined, undefined]);
		expect(shared.attempts[0]!.unknownReason).toMatch(/other/);

		const alone = summarizeStepCost(
			stepWithLog([
				attempt(1, { usd: 1, provider: 'other', sessionId: 'a' }),
				attempt(2, { usd: 2, provider: 'other', sessionId: 'b' }),
			])
		);
		expect(usdOf(alone)).toEqual([1, 2]);
		expect(alone.totalUsd).toBe(3);
		expect(alone.complete).toBe(true);
	});

	// Measured on a real opencode run: `--session` resumes report the attempt's own turn (0.1314 then 0.0108).
	it('sums the per-attempt values of opencode attempts sharing a session, with no delta', () => {
		const summary = summarizeStepCost(
			stepWithLog([
				attempt(1, {
					usd: 0.131357875,
					provider: 'opencode',
					tokens: { input: 2, output: 4, cacheRead: 0, cacheWrite: 19089 },
				}),
				attempt(2, {
					usd: 0.01081245,
					provider: 'opencode',
					tokens: { input: 2, output: 5, cacheRead: 19089, cacheWrite: 24 },
				}),
			])
		);
		expect(usdOf(summary)).toEqual([0.131357875, 0.01081245]);
		expect(summary.totalUsd).toBeCloseTo(0.142170325, 12);
		expect(summary.complete).toBe(true);
		expect(summary.lastAttemptUsd).toBe(0.01081245);
		expect(summary.attempts[1]!.tokens).toEqual({ input: 2, output: 5, cacheRead: 19089, cacheWrite: 24 });
		expect(summary.estimated).toBeUndefined();
	});

	it('keeps the opencode total as a lower bound when one attempt has no cost, without breaking the others', () => {
		const summary = summarizeStepCost(
			stepWithLog([
				attempt(1, { usd: 0.5, provider: 'opencode' }),
				attempt(2, { usd: undefined, provider: 'opencode' }),
				attempt(3, { usd: 0.25, provider: 'opencode' }),
			])
		);
		expect(usdOf(summary)).toEqual([0.5, undefined, 0.25]);
		expect(summary.totalUsd).toBe(0.75);
		expect(summary.complete).toBe(false);
	});

	describe('codex: cumulative per thread, like claude', () => {
		// Real captures (codex-cli 0.171.0, luna): turn 1, then turn 2 of the same thread (`codex exec resume`).
		const turn1 = { input: 42, output: 5, cacheRead: 0, cacheWrite: 9302 };
		const turn2 = { input: 84, output: 10, cacheRead: 9302, cacheWrite: 9324 };
		const codex = (n: number, extra: Partial<AttemptRecord>): AttemptRecord =>
			attempt(n, { provider: 'codex', sessionId: 'thread-1', ...extra });

		it('turns the cumulative estimate of a resumed thread into a delta and totals the final value', () => {
			const summary = summarizeStepCost(
				stepWithLog([
					codex(1, { usd: 0.00257389, estimated: true, pricesAsOf: '2026-11-08', tokens: turn1 }),
					codex(2, { usd: 0.002800424, estimated: true, pricesAsOf: '2026-11-08', tokens: turn2 }),
				])
			);
			expect(summary.attempts[0]!.usd).toBeCloseTo(0.00257389, 12);
			expect(summary.attempts[1]!.usd).toBeCloseTo(0.000226534, 12);
			expect(summary.attempts[1]!.estimated).toBe(true);
			expect(summary.attempts[1]!.tokens).toEqual({ input: 42, output: 5, cacheRead: 9302, cacheWrite: 22 });
			expect(summary.totalUsd).toBeCloseTo(0.002800424, 12);
			expect(summary.estimated).toBe(true);
			expect(summary.pricesAsOf).toBe('2026-11-08');
			expect(summary.complete).toBe(true);
		});

		it('is unknown, never 0, when the cumulative value of a thread decreases', () => {
			const summary = summarizeStepCost(
				stepWithLog([
					codex(1, { usd: 0.003, estimated: true, pricesAsOf: '2026-11-08' }),
					codex(2, { usd: 0.002, estimated: true, pricesAsOf: '2026-11-08' }),
				])
			);
			expect(summary.attempts[1]!.usd).toBeUndefined();
			expect(summary.attempts[1]!.unknownReason).toMatch(/decreased/);
			expect(summary.complete).toBe(false);
		});

		it('is unknown for several attempts without a session id', () => {
			const summary = summarizeStepCost(
				stepWithLog([
					codex(1, { usd: 0.001, sessionId: undefined, estimated: true }),
					codex(2, { usd: 0.002, sessionId: undefined, estimated: true }),
				])
			);
			expect(usdOf(summary)).toEqual([undefined, undefined]);
		});

		it('carries the reason the worker gave for an attempt without a cost', () => {
			const reason = "codex reports no cost and model 'x' is not in the price table of 2026-11-08";
			const summary = summarizeStepCost(stepWithLog([codex(1, { usdUnknownReason: reason })]));
			expect(summary.attempts[0]!.unknownReason).toBe(reason);
			expect(summary.totalUsd).toBeUndefined();
			expect(summary.complete).toBe(false);
		});

		it('takes the oldest price date when sessions were priced at different dates', () => {
			const summary = summarizeStepCost(
				stepWithLog([
					codex(1, { usd: 1, sessionId: 'a', estimated: true, pricesAsOf: '2026-12-01' }),
					codex(2, { usd: 1, sessionId: 'b', estimated: true, pricesAsOf: '2026-11-08' }),
				])
			);
			expect(summary.pricesAsOf).toBe('2026-11-08');
		});
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

	it('reads an estimated meta cost (not reported) as a figure flagged as an estimate', () => {
		const estimated = {
			...(meta(0.002, false) as { cost: object }),
			cost: { ...(meta(0.002, false) as { cost: object }).cost, estimated: true, pricesAsOf: '2026-11-08' },
		} as StepState['meta'];
		const summary = summarizeStepCost({ meta: estimated, attempts: 1 });
		expect(summary).toMatchObject({
			basis: 'meta',
			totalUsd: 0.002,
			complete: true,
			estimated: true,
			pricesAsOf: '2026-11-08',
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
		[
			{
				totalUsd: 0.0123,
				complete: true,
				estimated: true as const,
				pricesAsOf: '2026-11-08',
				unknownAttempts: 0,
				basis: 'log' as const,
				attemptCount: 1,
			},
			'~$0.0123 (estimated, prices of 2026-11-08)',
		],
		[
			{
				totalUsd: 0.0123,
				complete: false,
				estimated: true as const,
				pricesAsOf: '2026-11-08',
				unknownAttempts: 1,
				basis: 'log' as const,
				attemptCount: 2,
			},
			'~$0.0123+ (1 attempt unknown; estimated, prices of 2026-11-08)',
		],
		[
			{
				totalUsd: 0.0123,
				complete: true,
				estimated: true as const,
				unknownAttempts: 0,
				basis: 'log' as const,
				attemptCount: 1,
			},
			'~$0.0123 (estimated)',
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

	it('makes the sum an estimate, with the oldest price date, as soon as one costed step is estimated', () => {
		const exact = summarizeStepCost(stepWithLog([attempt(1, { usd: 1 })]));
		const estimatedStep = summarizeStepCost(
			stepWithLog([attempt(1, { usd: 0.5, provider: 'codex', estimated: true, pricesAsOf: '2026-11-08' })])
		);
		const total = sumStepCosts([exact, estimatedStep]);
		expect(total).toMatchObject({ totalUsd: 1.5, complete: true, estimated: true, pricesAsOf: '2026-11-08' });
		expect(formatStepCost(total)).toBe('~$1.5000 (estimated, prices of 2026-11-08)');
		expect(sumStepCosts([exact]).estimated).toBeUndefined();
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

describe('non-model steps (script, user_intervention, subflow): cost is not applicable', () => {
	// The attempt entry of a script step carries no model, provider, session, cost or tokens.
	const scriptAttempt = (n: number): AttemptRecord => {
		const { provider: _provider, sessionId: _sessionId, ...bare } = attempt(n);
		return bare;
	};
	const scriptMeta = { duration_ms: 12, exit_code: 0 } as StepState['meta'];

	it.each([
		['one attempt (execution q8bbdk5u, step check)', [scriptAttempt(1)]],
		['two attempts (execution ajk42rid)', [scriptAttempt(1), scriptAttempt(2)]],
	])('a script step with %s has no cost, nothing unknown', (_name, log) => {
		const summary = summarizeStepCost({ attemptLog: log, attempts: log.length, meta: scriptMeta });
		expect(summary).toMatchObject({ basis: 'none', complete: true, unknownAttempts: 0 });
		expect(summary.totalUsd).toBeUndefined();
		expect(summary.attempts.every(a => a.notApplicable === true && a.unknownReason === undefined)).toBe(true);
		expect(formatStepCost(summary)).toBeUndefined();
	});

	it('mixed model + script execution: the total is the model total and stays complete', () => {
		const model = summarizeStepCost(stepWithLog([attempt(1, { usd: 0.00637995, model: 'haiku' })]));
		const script = summarizeStepCost({ attemptLog: [scriptAttempt(1)], attempts: 1, meta: scriptMeta });
		const total = sumStepCosts([model, script]);
		expect(total).toMatchObject({ totalUsd: 0.00637995, complete: true, unknownAttempts: 0 });
		expect(formatStepCost(total)).toBe('$0.0064');
	});

	it('script-only execution has no total', () => {
		const script = summarizeStepCost({ attemptLog: [scriptAttempt(1)], attempts: 1, meta: scriptMeta });
		expect(sumStepCosts([script, script])).toMatchObject({ basis: 'none' });
	});

	it('a model step whose provider reported no cost stays unknown and incomplete', () => {
		const model = summarizeStepCost(stepWithLog([attempt(1, { usd: undefined, model: 'haiku' })]));
		const script = summarizeStepCost({ attemptLog: [scriptAttempt(1)], attempts: 1, meta: scriptMeta });
		expect(model).toMatchObject({ basis: 'log', complete: false, unknownAttempts: 1 });
		const total = sumStepCosts([model, script]);
		expect(total.complete).toBe(false);
		expect(formatStepCost(total)).toBe('unknown');
	});

	it('a failed model attempt with only a model recorded is still a model attempt (unknown)', () => {
		const { provider: _p, sessionId: _s, ...bare } = attempt(1, { model: 'haiku' });
		expect(summarizeStepCost({ attemptLog: [bare], attempts: 1 })).toMatchObject({
			unknownAttempts: 1,
			complete: false,
		});
	});
});
