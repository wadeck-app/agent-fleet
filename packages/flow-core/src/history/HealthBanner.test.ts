import { describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { summarizeFlows } from './FlowSummaries.js';
import { describeFlowHealth } from './HealthBanner.js';

function health(...runs: Parameters<typeof makeExec>[0][]) {
	return describeFlowHealth(summarizeFlows(runs.map(run => makeExec(run))));
}

describe('describeFlowHealth', () => {
	it('says nothing ran yet, in a neutral tone', () => {
		expect(describeFlowHealth([])).toEqual({ text: 'No execution yet', variant: 'default' });
	});

	it('is healthy when the last run of every flow completed', () => {
		expect(health({ executionId: 'a' }, { executionId: 'b', flowId: 'build' })).toEqual({
			text: 'All healthy',
			variant: 'success',
		});
	});

	it('counts the flows whose last run failed, singular and plural, with the running ones', () => {
		expect(health({ executionId: 'a', status: 'failed' })).toEqual({ text: '1 flow failing', variant: 'danger' });
		expect(
			health(
				{ executionId: 'a', status: 'failed' },
				{ executionId: 'b', flowId: 'build', status: 'failed' },
				{ executionId: 'c', flowId: 'lint', status: 'running', completedAt: null }
			)
		).toEqual({ text: '2 flows failing, 1 running', variant: 'danger' });
	});

	it('mentions the running flows next to the healthy ones, or alone when nothing else ran', () => {
		expect(
			health({ executionId: 'a' }, { executionId: 'b', flowId: 'build', status: 'running', completedAt: null })
		).toEqual({ text: 'All healthy, 1 running', variant: 'success' });
		expect(health({ executionId: 'a', status: 'running', completedAt: null })).toEqual({
			text: '1 running',
			variant: 'info',
		});
	});
});
