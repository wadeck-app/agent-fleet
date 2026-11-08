import { describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { latestRuns } from './RunRows.js';

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
				statusLabel: 'FAILED',
				startedAt: '2026-10-22T11:00:00.000Z',
			},
		]);
	});

	it('sends the full flow name: the table column truncates it to the room it has', () => {
		const flowId = 'factory_retrospective_long_running_pipeline';
		const [row] = latestRuns([makeExec({ executionId: 'a', flowId })], 1);
		expect(row!.flowId).toBe(flowId);
	});

	it('is empty when nothing ran', () => {
		expect(latestRuns([], 5)).toEqual([]);
	});

	it('refuses a record whose start time is not a date, naming the run', () => {
		expect(() => latestRuns([makeExec({ executionId: 'bad', startedAt: 'yesterday' })], 5)).toThrow(/yesterday/);
	});
});

describe('latestRuns waiting for a workspace', () => {
	it('words a queued run that waits for a workspace apart from an ordinary queued one', () => {
		const wait = { since: '2026-10-22T10:00:00.000Z', message: '2/2 slots claimed', run: {} };
		const rows = latestRuns(
			[
				makeExec({ executionId: 'w', status: 'queued', workspaceWait: wait }),
				makeExec({ executionId: 'q', status: 'queued' }),
			],
			5
		);
		expect(rows.map(r => r.statusLabel)).toEqual(['waiting ws', 'waiting']);
	});
});
