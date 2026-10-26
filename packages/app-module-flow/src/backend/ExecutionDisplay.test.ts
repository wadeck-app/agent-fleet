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
