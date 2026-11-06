import {
	type ExecutionDetailView,
	type ExecutionSummary,
	RECOVERED_RUN_HINT,
	type StepView,
	retryHint,
} from 'flow-core';
import { describe, expect, it } from 'vitest';

import { toExecutionDetailRow, toExecutionRow, toStepRow } from './ExecutionDisplay.js';

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

describe('toStepRow skipped step', () => {
	const SKIPPED: StepView = {
		...STEP,
		duration: '-',
		skipped: true,
		skippedReason: "when 'inputs.dev' was false",
	};

	it('says skipped, not ok, and shows no retry count', () => {
		const row = toStepRow(SKIPPED, undefined);
		expect(row.statusLabel).toBe('skipped');
		expect(row.retryLabel).toBe('-');
	});

	it('keeps ok and the retry count for a step that ran', () => {
		const row = toStepRow({ ...STEP, attempts: 1 }, { retryBudget: 0 });
		expect(row.statusLabel).toBe('ok');
		expect(row.retryLabel).toBe('0 retry');
	});
});

describe('status and retry hints (tooltips)', () => {
	const FAILED_THEN_OK = [
		{
			n: 1,
			origin: 'first' as const,
			outcome: 'failed' as const,
			endReason: 'x',
			duration: '1s',
			durationMs: 1000,
		},
		{
			n: 2,
			origin: 'retry' as const,
			outcome: 'completed' as const,
			endReason: 'x',
			duration: '1s',
			durationMs: 1000,
		},
	];
	const SUMMARY = {
		executionId: 'e',
		flowId: 'f',
		flowFile: 'f.yaml',
		status: 'completed',
		startedAt: '2026-01-01T00:00:00.000Z',
		lastErrorRecovered: true,
	} as unknown as ExecutionSummary;

	it('explains a recovered run in the list row, with the flow-core sentence', () => {
		expect(toExecutionRow(SUMMARY)).toMatchObject({ statusLabel: 'ok, recovered', statusHint: RECOVERED_RUN_HINT });
	});

	it('sends an empty hint (no tooltip) for a clean or a failed run', () => {
		expect(toExecutionRow({ ...SUMMARY, lastErrorRecovered: false }).statusHint).toBe('');
		expect(toExecutionRow({ ...SUMMARY, status: 'failed', lastErrorRecovered: false }).statusHint).toBe('');
	});

	it('explains a recovered step from its attempts, and marks it recovered even without a stored error', () => {
		const row = toStepRow({ ...STEP, attemptHistory: FAILED_THEN_OK, attempts: 2 }, undefined);
		expect(row.statusLabel).toBe('ok, recovered');
		expect(row.statusHint).toBe(
			'2 attempts: attempt 1 failed (expand the row to see the attempts), attempt 2 succeeded.'
		);
	});

	it('sends no step hint for a clean completed step or a failed one', () => {
		expect(toStepRow(STEP, undefined).statusHint).toBe('');
		expect(toStepRow({ ...STEP, status: 'failed', error: 'boom' }, undefined).statusHint).toBe('');
	});

	it('says why a skipped step did not run', () => {
		const row = toStepRow({ ...STEP, skipped: true, skippedReason: 'condition is false' }, undefined);
		expect(row.statusLabel).toBe('skipped');
		expect(row.statusHint).toBe('Did not run: condition is false.');
	});

	it('explains the ambiguous retry texts and nothing for a count', () => {
		expect(toStepRow({ ...STEP }, undefined).retryHint).toBe(retryHint('retries unknown'));
		expect(toStepRow({ ...STEP, attempts: 1 }, undefined).retryHint).toBe('');
	});

	it('gives the detail header badge the run hint and a flag for each of its two variants', () => {
		const detail = { ...SUMMARY, steps: [] } as unknown as ExecutionDetailView;
		expect(toExecutionDetailRow(detail, undefined)).toMatchObject({
			statusHint: RECOVERED_RUN_HINT,
			hasStatusHint: true,
			lacksStatusHint: false,
		});
		expect(toExecutionDetailRow({ ...detail, lastErrorRecovered: false }, undefined)).toMatchObject({
			statusHint: '',
			hasStatusHint: false,
			lacksStatusHint: true,
		});
	});
});
