import { describe, expect, it } from 'vitest';

import type { AttemptRecord, StepState } from '../execution/ExecutionState.js';
import { renderStepCostLines, renderTotalCostLine } from './StepCostLines.js';

const entry = (n: number, extra: Partial<AttemptRecord> = {}): AttemptRecord => ({
	n,
	origin: n === 1 ? 'first' : 'relaunch',
	startedAt: '2026-10-26T10:00:00.000Z',
	endedAt: '2026-10-26T10:00:30.000Z',
	durationMs: 30_000,
	outcome: 'completed',
	endReason: 'completed',
	provider: 'claude',
	sessionId: 's1',
	...extra,
});

const meta = (usd: number): StepState['meta'] =>
	({
		duration_ms: 4496,
		model: 'haiku',
		session_id: 's1',
		session_file: '',
		ttft_ms: 1,
		cost: { input_tokens: 120, output_tokens: 40, cache_read_tokens: 0, cache_write_tokens: 0, usd },
	}) as StepState['meta'];

const capturedStep: StepState = {
	status: 'completed',
	attempts: 2,
	meta: meta(0.00749017),
	attemptLog: [
		entry(1, {
			usd: 0.00637995,
			turns: 2,
			toolCalls: 3,
			tokens: { input: 2, output: 4, cacheRead: 0, cacheWrite: 51022 },
		}),
		entry(2, {
			usd: 0.00749017,
			turns: 1,
			tokens: { input: 4, output: 8, cacheRead: 45902, cacheWrite: 56214 },
		}),
	],
};

describe('renderStepCostLines', () => {
	it('prints an attempt table with delta cost for a step that ran several times, then the step total', () => {
		expect(renderStepCostLines(capturedStep, '      ')).toEqual([
			'      attempt 1  first     30.0s  $0.0064  2 in / 4 out + 51022 cache tokens  completed  turns 2  tools 3',
			'      attempt 2  relaunch  30.0s  $0.0011  2 in / 4 out + 51094 cache tokens  completed  turns 1',
			'      cost: $0.0075 over 2 attempts',
		]);
	});

	it('says why an attempt cost is unknown and marks the total as a lower bound', () => {
		const step: StepState = {
			status: 'failed',
			attempts: 2,
			attemptLog: [
				entry(1, { usd: 2 }),
				entry(2, { usd: undefined, outcome: 'failed', endReason: 'timeout', sessionId: undefined }),
			],
		};
		const lines = renderStepCostLines(step, '');
		expect(lines[1]).toBe(
			'attempt 2  relaunch  30.0s  cost unknown (the provider reported no cost for this attempt)  timeout'
		);
		expect(lines.at(-1)).toBe('cost: $2.0000+ (1 attempt unknown) over 2 attempts');
	});

	it('keeps the single-line cost for a step that ran once, with the total in place of the raw value', () => {
		const step: StepState = {
			status: 'completed',
			attempts: 1,
			meta: meta(0.0123),
			attemptLog: [entry(1, { usd: 0.0123 })],
		};
		expect(renderStepCostLines(step, '')).toEqual(['cost: $0.0123 (120 in / 40 out tokens, 4496ms)']);
	});

	it('renders an old record (no log) like before, with the earlier-attempts caveat when it ran several times', () => {
		expect(renderStepCostLines({ status: 'completed', meta: meta(0.0123) }, '')).toEqual([
			'cost: $0.0123 (120 in / 40 out tokens, 4496ms)',
		]);
		expect(renderStepCostLines({ status: 'completed', attempts: 3, meta: meta(0.3) }, '')).toEqual([
			'cost: $0.3000 (last attempt of 3, earlier not recorded) (120 in / 40 out tokens, 4496ms)',
		]);
	});

	it('prints nothing for a step without model cost', () => {
		expect(renderStepCostLines({ status: 'completed', meta: { duration_ms: 1, exit_code: 0 } }, '')).toEqual([]);
	});

	it('never prints an unknown single-attempt cost as $0', () => {
		const step: StepState = {
			status: 'failed',
			attempts: 1,
			meta: {
				...(meta(0) as object),
				cost: { ...(meta(0) as { cost: object }).cost, reported: false },
			} as StepState['meta'],
		};
		expect(renderStepCostLines(step, '')).toEqual(['cost: unknown (120 in / 40 out tokens, 4496ms)']);
	});
});

describe('renderTotalCostLine', () => {
	it('adds the step totals, not the raw cumulative values', () => {
		expect(
			renderTotalCostLine([capturedStep, { status: 'completed', attempts: 1, meta: meta(0.0125) }], '  ')
		).toBe('  Total cost: $0.0200');
	});

	it('marks the lower bound and omits the line when no step has a model cost', () => {
		const partial: StepState = {
			status: 'failed',
			attempts: 2,
			attemptLog: [entry(1, { usd: 1 }), entry(2, { usd: undefined })],
		};
		expect(renderTotalCostLine([partial], '  ')).toBe('  Total cost: $1.0000+ (1 attempt unknown)');
		expect(renderTotalCostLine([{ status: 'pending' }], '  ')).toBeUndefined();
	});
});

describe('non-model steps in the show output', () => {
	const bare = (n: number): AttemptRecord => {
		const { provider: _provider, sessionId: _sessionId, ...rest } = entry(n);
		return rest;
	};
	const script = (count: number): StepState => ({
		status: 'completed',
		attempts: count,
		meta: { duration_ms: 12, exit_code: 0 } as StepState['meta'],
		attemptLog: Array.from({ length: count }, (_, i) => bare(i + 1)),
	});
	const model: StepState = {
		status: 'completed',
		attempts: 1,
		meta: meta(0.00637995),
		attemptLog: [entry(1, { usd: 0.00637995, model: 'haiku' })],
	};

	it('prints no cost part for a script step, even with several attempts', () => {
		expect(renderStepCostLines(script(2), '  ')).toEqual([
			'  attempt 1  first     30.0s  completed',
			'  attempt 2  relaunch  30.0s  completed',
		]);
		expect(renderStepCostLines(script(1), '  ')).toEqual([]);
	});

	it('the total of a model + script execution is complete', () => {
		expect(renderTotalCostLine([model, script(1)], '  ')).toBe('  Total cost: $0.0064');
	});

	it('prints no total line for a script-only execution', () => {
		expect(renderTotalCostLine([script(1), script(2)], '  ')).toBeUndefined();
	});
});
