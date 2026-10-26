import type { StepAttemptView, StepView } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { costNotes, hasAttemptRows, toAttemptRows, withCostHint } from './StepAttemptRows.js';

function attempt(overrides: Partial<StepAttemptView>): StepAttemptView {
	return {
		n: 1,
		origin: 'first',
		outcome: 'completed',
		endReason: 'done',
		duration: '1s',
		durationMs: 1000,
		...overrides,
	};
}

function step(history: StepAttemptView[] | undefined, costLabel?: string): StepView {
	return {
		stepId: 's',
		status: 'completed',
		injected: false,
		duration: '1s',
		relaunches: [],
		...(history !== undefined ? { attemptHistory: history } : {}),
		...(costLabel !== undefined ? { costLabel } : {}),
	};
}

describe('hasAttemptRows', () => {
	it('is true for 2+ attempts, also for a step without model cost', () => {
		expect(
			hasAttemptRows(step([attempt({ costNotApplicable: true }), attempt({ n: 2, costNotApplicable: true })]))
		).toBe(true);
	});

	it('is true for a single attempt whose cost is unknown', () => {
		expect(hasAttemptRows(step([attempt({ costUnknownReason: 'no session' })], 'unknown'))).toBe(true);
	});

	it('is false for one attempt with a known cost, no history, or a non-model single attempt', () => {
		expect(hasAttemptRows(step([attempt({ costUsd: 0.01 })], '$0.0100'))).toBe(false);
		expect(hasAttemptRows(step(undefined))).toBe(false);
		expect(hasAttemptRows(step([attempt({ costNotApplicable: true })]))).toBe(false);
	});
});

describe('toAttemptRows', () => {
	it('shows a delta cost, tokens, turns, tools and end reason', () => {
		const [row] = toAttemptRows([
			attempt({
				costUsd: 0.0064,
				tokens: { input: 2, output: 4, cacheRead: 100, cacheWrite: 20 },
				turns: 3,
				toolCalls: 5,
				endReason: 'first 8.8s',
			}),
		]);
		expect(row).toEqual({
			n: 1,
			origin: 'first',
			duration: '1s',
			cost: '$0.0064',
			tokens: '2 in / 4 out + 120 cache',
			turns: '3',
			toolCalls: '5',
			endReason: 'first 8.8s',
		});
	});

	it('says unknown and gives the reason, never $0', () => {
		const [row] = toAttemptRows([attempt({ costUnknownReason: "provider 'unrecorded' shares a session" })]);
		expect(row).toMatchObject({
			cost: 'unknown',
			tokens: '-',
			turns: '-',
			toolCalls: '-',
		});
	});

	it('shows a dash for a non-model attempt and unknown with a fixed reason when none was recorded', () => {
		expect(toAttemptRows([attempt({ costNotApplicable: true })])[0]).toMatchObject({ cost: '-' });
		expect(toAttemptRows([attempt({})])[0]).toMatchObject({ cost: 'unknown' });
	});
});

describe('withCostHint', () => {
	it('points an unknown cost at the attempts, only when there are rows to see', () => {
		expect(withCostHint('unknown', true)).toBe('unknown - see attempts');
		expect(withCostHint('$2.7900+ (2 attempts unknown)', true)).toBe(
			'$2.7900+ (2 attempts unknown) - see attempts'
		);
		expect(withCostHint('unknown', false)).toBe('unknown');
		expect(withCostHint('$0.0075', true)).toBe('$0.0075');
		expect(withCostHint('-', true)).toBe('-');
	});
});

describe('costNotes', () => {
	it('gives one sentence when every unknown attempt has the same reason', () => {
		expect(
			costNotes([
				attempt({ costUnknownReason: 'no session' }),
				attempt({ n: 2, costUnknownReason: 'no session' }),
			])
		).toBe('Cost unknown: no session.');
	});

	it('lists the attempts when the reasons differ, and says not recorded when there is none', () => {
		expect(costNotes([attempt({ costUnknownReason: 'a' }), attempt({ n: 2, costUnknownReason: 'b' })])).toBe(
			'Cost unknown:\n\n- attempt 1: a\n- attempt 2: b'
		);
		expect(costNotes([attempt({})])).toBe('Cost unknown: not recorded.');
	});

	it('is empty when no attempt has an unknown cost (known or not applicable)', () => {
		expect(costNotes([attempt({ costUsd: 0.1 }), attempt({ n: 2, costNotApplicable: true })])).toBe('');
	});
});
