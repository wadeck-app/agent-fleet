import type { ExecutionDetailView, StepView } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { toExecutionDetailRow, toStepRow } from './ExecutionDisplay.js';

const STEP: StepView = { stepId: 's', status: 'completed', injected: false, duration: '1s', relaunches: [] };

describe('toStepRow cost cell', () => {
	it('shows the flow-core costLabel of the step total, incomplete totals included', () => {
		expect(toStepRow({ ...STEP, costUsd: 0.0075, costLabel: '$0.0075' }, undefined).costLabel).toBe('$0.0075');
		expect(toStepRow({ ...STEP, costLabel: '$2.7900+ (2 attempts unknown)' }, undefined).costLabel).toBe(
			'$2.7900+ (2 attempts unknown)'
		);
		expect(toStepRow({ ...STEP, costLabel: 'unknown' }, undefined).costLabel).toBe('unknown');
	});

	it('shows a dash, never $0, for a step without model cost', () => {
		expect(toStepRow(STEP, undefined).costLabel).toBe('-');
	});
});

describe('toExecutionDetailRow total cost', () => {
	const DETAIL = {
		executionId: 'e',
		flowId: 'f',
		status: 'completed',
		startedAt: '2026-01-01T00:00:00.000Z',
		lastErrorRecovered: false,
		steps: [],
	} as unknown as ExecutionDetailView;

	it('puts the run total in the timing row', () => {
		const row = toExecutionDetailRow({ ...DETAIL, totalCostLabel: '$1.2000+ (1 attempt unknown)' }, undefined);
		expect(row.timing[0]!.totalCost).toBe('$1.2000+ (1 attempt unknown)');
	});

	it('shows a dash when no step has a model cost', () => {
		expect(toExecutionDetailRow(DETAIL, undefined).timing[0]!.totalCost).toBe('-');
	});
});

describe('toStepRow attempts expansion', () => {
	const ATTEMPTS = [
		{
			n: 1,
			origin: 'first' as const,
			outcome: 'failed' as const,
			endReason: 'first 8.8s',
			duration: '8.8s',
			durationMs: 8800,
			costUnknownReason: 'no session',
		},
		{
			n: 2,
			origin: 'retry' as const,
			outcome: 'completed' as const,
			endReason: 'retry 2s',
			duration: '2s',
			durationMs: 2000,
			costUnknownReason: 'no session',
		},
	];

	it('gives a model step with unknown attempt costs its rows, the expansion flag and a self-explanatory cost cell', () => {
		const row = toStepRow({ ...STEP, costLabel: 'unknown', attemptHistory: ATTEMPTS }, undefined);
		expect(row.expandable).toBe(true);
		expect(row.attemptRows).toHaveLength(2);
		expect(row.attemptRows[1]).toMatchObject({ n: 2, origin: 'retry', cost: 'unknown' });
		expect(row.costLabel).toBe('unknown - see attempts');
	});

	it('gives a single-attempt step with a known cost no expansion', () => {
		const row = toStepRow(
			{
				...STEP,
				costLabel: '$0.0064',
				attemptHistory: [{ ...ATTEMPTS[0]!, costUsd: 0.0064, costUnknownReason: undefined }],
			},
			undefined
		);
		expect(row.expandable).toBe(false);
		expect(row.attemptRows).toEqual([]);
		expect(row.costLabel).toBe('$0.0064');
	});
});

describe('toStepRow cost notes', () => {
	it('sends the reason of an unknown cost once, as the text shown under the attempts table', () => {
		const attempt = {
			n: 1,
			origin: 'first' as const,
			outcome: 'completed' as const,
			endReason: 'done',
			duration: '1s',
			durationMs: 1000,
			costUnknownReason: 'no session',
		};
		expect(toStepRow({ ...STEP, costLabel: 'unknown', attemptHistory: [attempt] }, undefined).costNotes).toBe(
			'Cost unknown: no session.'
		);
		expect(toStepRow(STEP, undefined).costNotes).toBe('');
	});
});
