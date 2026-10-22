import { describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { summarizeFlows } from './FlowSummaries.js';
import { FLOW_LABEL_LENGTH, activeRuns, flowRows, latestRuns, recentFailures } from './RunRows.js';

const NOW = Date.parse('2026-10-22T12:00:00.000Z');

describe('latestRuns', () => {
	it('keeps the first rows, with the short status word and the ISO start time', () => {
		const runs = [
			makeExec({ executionId: 'b', status: 'failed', startedAt: '2026-10-22T11:00:00.000Z' }),
			makeExec({ executionId: 'a', startedAt: '2026-10-22T10:00:00.000Z' }),
		];
		expect(latestRuns(runs, 1)).toEqual([
			{
				executionId: 'b',
				flowId: 'test-flow',
				flowLabel: 'test-flow',
				statusLabel: 'FAILED',
				startedAt: '2026-10-22T11:00:00.000Z',
			},
		]);
	});

	it('is empty when nothing ran', () => {
		expect(latestRuns([], 5)).toEqual([]);
	});

	it('refuses a record whose start time is not a date, naming the run', () => {
		expect(() => latestRuns([makeExec({ executionId: 'bad', startedAt: 'yesterday' })], 5)).toThrow(/yesterday/);
	});
});

describe('flow labels', () => {
	it('cut a long flow name to fit a narrow table column, the full name staying in flowId', () => {
		const [row] = latestRuns([makeExec({ executionId: 'a', flowId: 'long_running_deploy_pipeline' })], 1);
		expect(row).toMatchObject({ flowId: 'long_running_deploy_pipeline', flowLabel: 'long_runn...' });
		expect(row!.flowLabel).toHaveLength(FLOW_LABEL_LENGTH);
	});
});

describe('recentFailures', () => {
	it('lists the newest failed runs with the first line of the error', () => {
		const runs = [
			makeExec({ executionId: 'ok', startedAt: '2026-10-22T11:30:00.000Z' }),
			makeExec({
				executionId: 'f2',
				flowId: 'deploy',
				status: 'failed',
				startedAt: '2026-10-22T11:00:00.000Z',
				lastError: '\n  Step build failed: exit 2\nstack line 1\nstack line 2',
			}),
			makeExec({
				executionId: 'f1',
				status: 'failed',
				startedAt: '2026-10-22T10:00:00.000Z',
				lastError: 'boom',
			}),
		];
		expect(recentFailures(runs, 5)).toEqual([
			{
				executionId: 'f2',
				flowId: 'deploy',
				error: 'Step build failed: exit 2',
				summary: 'deploy: Step build failed: ...',
				startedAt: '2026-10-22T11:00:00.000Z',
			},
			{
				executionId: 'f1',
				flowId: 'test-flow',
				error: 'boom',
				summary: 'test-flow: boom',
				startedAt: '2026-10-22T10:00:00.000Z',
			},
		]);
	});

	it('reads the error of the failed step when the run has no lastError, and says so when there is none at all', () => {
		const withStep = makeExec({
			executionId: 'a',
			status: 'failed',
			startedAt: '2026-10-22T11:00:00.000Z',
			steps: { build: { status: 'failed', error: 'compile error\nmore' } },
		});
		const bare = makeExec({ executionId: 'b', status: 'failed', startedAt: '2026-10-22T10:00:00.000Z' });
		expect(recentFailures([withStep, bare], 5).map(row => row.error)).toEqual([
			'compile error',
			'No error message recorded',
		]);
	});

	it('cuts a very long first line', () => {
		const run = makeExec({ executionId: 'a', status: 'failed', lastError: 'x'.repeat(500) });
		expect(recentFailures([run], 5)[0]!.error).toHaveLength(160);
	});

	it('stops at the limit', () => {
		const runs = ['a', 'b', 'c'].map(id => makeExec({ executionId: id, status: 'failed', lastError: 'e' }));
		expect(recentFailures(runs, 2).map(row => row.executionId)).toEqual(['a', 'b']);
	});
});

describe('activeRuns', () => {
	it('lists running and waiting runs with the time elapsed since they started, not the finished ones', () => {
		const runs = [
			makeExec({ executionId: 'done', startedAt: '2026-10-22T11:59:00.000Z' }),
			makeExec({
				executionId: 'run',
				status: 'running',
				completedAt: null,
				startedAt: '2026-10-22T11:56:40.000Z',
			}),
			makeExec({
				executionId: 'wait',
				status: 'queued',
				completedAt: null,
				startedAt: '2026-10-22T11:59:30.000Z',
			}),
		];
		expect(activeRuns(runs, NOW, 5)).toEqual([
			{
				executionId: 'run',
				flowId: 'test-flow',
				flowLabel: 'test-flow',
				statusLabel: 'running',
				elapsed: '3m20s',
			},
			{
				executionId: 'wait',
				flowId: 'test-flow',
				flowLabel: 'test-flow',
				statusLabel: 'waiting',
				elapsed: '30.0s',
			},
		]);
	});

	it('is empty when everything is finished', () => {
		expect(activeRuns([makeExec({ executionId: 'a' })], NOW, 5)).toEqual([]);
	});
});

describe('flowRows', () => {
	it('gives the busiest-recently flows first, with their run and failure counts', () => {
		const flows = summarizeFlows([
			makeExec({ executionId: 'a', flowId: 'deploy', status: 'failed', startedAt: '2026-10-22T10:00:00.000Z' }),
			makeExec({ executionId: 'b', flowId: 'deploy', startedAt: '2026-10-21T10:00:00.000Z' }),
			makeExec({ executionId: 'c', flowId: 'build', startedAt: '2026-10-22T11:00:00.000Z' }),
		]);
		expect(flowRows(flows, 1)).toEqual([{ flowId: 'build', flowLabel: 'build', runs: 1, failed: 0 }]);
		expect(flowRows(flows, 5)).toEqual([
			{ flowId: 'build', flowLabel: 'build', runs: 1, failed: 0 },
			{ flowId: 'deploy', flowLabel: 'deploy', runs: 2, failed: 1 },
		]);
	});
});
