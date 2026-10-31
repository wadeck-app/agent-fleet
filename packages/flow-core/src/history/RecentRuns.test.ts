import { describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { RECENT_RUNS_CAP, RECENT_RUNS_DAYS, selectRecentRuns } from './RecentRuns.js';

const NOW = Date.parse('2026-10-22T12:00:00.000Z');
const DAY_MS = 24 * 3600 * 1000;
const iso = (msBeforeNow: number): string => new Date(NOW - msBeforeNow).toISOString();

describe('selectRecentRuns', () => {
	it('is empty and not truncated when nothing ran', () => {
		expect(selectRecentRuns([], NOW)).toEqual({ runs: [], truncated: false });
	});

	it('keeps the start time and the status of the finished runs, in the order given (newest first)', () => {
		const runs = [
			makeExec({ executionId: 'b', status: 'failed', startedAt: iso(1000) }),
			makeExec({ executionId: 'a', status: 'completed', startedAt: iso(5000) }),
		];
		expect(selectRecentRuns(runs, NOW)).toEqual({
			runs: [
				{ startedAt: iso(1000), status: 'failed' },
				{ startedAt: iso(5000), status: 'completed' },
			],
			truncated: false,
		});
	});

	it('leaves out the runs that are not finished, the ones from the future and the ones older than the window', () => {
		const runs = [
			makeExec({ executionId: 'future', startedAt: iso(-1000) }),
			makeExec({ executionId: 'live', status: 'running', completedAt: null, startedAt: iso(1000) }),
			makeExec({ executionId: 'edge', startedAt: iso(RECENT_RUNS_DAYS * DAY_MS) }),
			makeExec({ executionId: 'old', startedAt: iso(RECENT_RUNS_DAYS * DAY_MS + 1) }),
		];
		expect(selectRecentRuns(runs, NOW).runs).toEqual([
			{ startedAt: iso(RECENT_RUNS_DAYS * DAY_MS), status: 'completed' },
		]);
	});

	it('keeps the newest runs and says so when more than the cap are in the window', () => {
		const runs = Array.from({ length: 5 }, (_, index) =>
			makeExec({ executionId: `r${index}`, startedAt: iso(index * 1000) })
		);
		const result = selectRecentRuns(runs, NOW, 3);
		expect(result.truncated).toBe(true);
		expect(result.runs.map(run => run.startedAt)).toEqual([iso(0), iso(1000), iso(2000)]);
		expect(selectRecentRuns(runs, NOW, 5).truncated).toBe(false);
	});

	it('has a documented default cap of 2000 and a window wide enough for 7 days in any time zone', () => {
		expect(RECENT_RUNS_CAP).toBe(2000);
		expect(RECENT_RUNS_DAYS).toBe(8);
	});

	it('refuses a cap that is not a positive integer, and a corrupt start time', () => {
		expect(() => selectRecentRuns([], NOW, 0)).toThrow(/cap.*0/);
		expect(() => selectRecentRuns([makeExec({ executionId: 'x', startedAt: 'not-a-date' })], NOW)).toThrow(
			/not-a-date/
		);
	});
});
