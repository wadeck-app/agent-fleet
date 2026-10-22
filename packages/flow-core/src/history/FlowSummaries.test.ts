import { describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { summarizeFlows } from './FlowSummaries.js';

describe('summarizeFlows', () => {
	it('is empty when nothing ran', () => {
		expect(summarizeFlows([])).toEqual([]);
	});

	it('counts executions and failures per flow, most recently started flow first', () => {
		const summaries = summarizeFlows([
			makeExec({ executionId: 'a', flowId: 'deploy', status: 'failed', startedAt: '2026-08-16T10:00:00.000Z' }),
			makeExec({ executionId: 'b', flowId: 'build', startedAt: '2026-08-17T10:00:00.000Z' }),
			makeExec({ executionId: 'c', flowId: 'deploy', startedAt: '2026-08-15T10:00:00.000Z' }),
		]);
		expect(summaries).toEqual([
			{
				flowId: 'build',
				executionCount: 1,
				failedCount: 0,
				runningCount: 0,
				lastExecutionId: 'b',
				lastStatus: 'completed',
				lastStartedAt: '2026-08-17T10:00:00.000Z',
			},
			{
				flowId: 'deploy',
				executionCount: 2,
				failedCount: 1,
				runningCount: 0,
				lastExecutionId: 'a',
				lastStatus: 'failed',
				lastStartedAt: '2026-08-16T10:00:00.000Z',
			},
		]);
	});
});

describe('summarizeFlows last run', () => {
	it('reports the id and status of the most recently started run, and how many runs are active', () => {
		const [summary] = summarizeFlows([
			makeExec({ executionId: 'old', flowId: 'f', status: 'failed', startedAt: '2026-08-15T10:00:00.000Z' }),
			makeExec({ executionId: 'new', flowId: 'f', status: 'running', startedAt: '2026-08-17T10:00:00.000Z' }),
			makeExec({ executionId: 'mid', flowId: 'f', status: 'queued', startedAt: '2026-08-16T10:00:00.000Z' }),
		]);
		expect(summary).toMatchObject({ lastExecutionId: 'new', lastStatus: 'running', runningCount: 2 });
	});
});
