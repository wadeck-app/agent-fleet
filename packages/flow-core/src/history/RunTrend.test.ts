import { describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { countRunsPerDay } from './RunTrend.js';

// Local time on purpose: a day is the viewer's calendar day, so the expectations are built the same way (any time zone).
const at = (day: number, hour = 12): string => new Date(2026, 9, day, hour).toISOString();
const NOW = new Date(2026, 9, 22, 15).getTime();

describe('countRunsPerDay', () => {
	it('returns one zero-filled entry per day, oldest first, ending today', () => {
		expect(countRunsPerDay([], NOW, 3)).toEqual([
			{ dayStart: at(20, 0), completed: 0, failed: 0 },
			{ dayStart: at(21, 0), completed: 0, failed: 0 },
			{ dayStart: at(22, 0), completed: 0, failed: 0 },
		]);
	});

	it('counts completed and failed runs on the day they started', () => {
		const execs = [
			makeExec({ executionId: 'a', startedAt: at(22, 9) }),
			makeExec({ executionId: 'b', startedAt: at(22, 10) }),
			makeExec({ executionId: 'c', status: 'failed', startedAt: at(22, 11) }),
			makeExec({ executionId: 'd', status: 'failed', startedAt: at(21, 23) }),
			makeExec({ executionId: 'old', startedAt: at(1) }),
		];
		expect(countRunsPerDay(execs, NOW, 2)).toEqual([
			{ dayStart: at(21, 0), completed: 0, failed: 1 },
			{ dayStart: at(22, 0), completed: 2, failed: 1 },
		]);
	});

	it('does not count runs that are not finished', () => {
		const execs = [
			makeExec({ executionId: 'a', status: 'running', completedAt: null, startedAt: at(22, 9) }),
			makeExec({ executionId: 'b', status: 'queued', completedAt: null, startedAt: at(22, 10) }),
		];
		expect(countRunsPerDay(execs, NOW, 1)).toEqual([{ dayStart: at(22, 0), completed: 0, failed: 0 }]);
	});

	it('refuses a day count that is not a positive integer, naming the value', () => {
		expect(() => countRunsPerDay([], NOW, 0)).toThrow(/days.*0/);
		expect(() => countRunsPerDay([], NOW, 1.5)).toThrow(/days.*1\.5/);
	});
});
