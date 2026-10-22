import { describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { countRunsPerDay, countSince, successTrend, successWindow } from './RunTrend.js';

// Local time on purpose: a day is the viewer's calendar day, so the expectations are built the same way (any time zone).
const at = (day: number, hour = 12): string => new Date(2026, 9, day, hour).toISOString();
const NOW = new Date(2026, 9, 22, 15).getTime();
const HOUR_MS = 3_600_000;

describe('countRunsPerDay', () => {
	it('returns one zero-filled entry per day, oldest first, ending today', () => {
		expect(countRunsPerDay([], NOW, 3)).toEqual([
			{ dayStart: at(20, 0), completed: 0, failed: 0, successRate: null },
			{ dayStart: at(21, 0), completed: 0, failed: 0, successRate: null },
			{ dayStart: at(22, 0), completed: 0, failed: 0, successRate: null },
		]);
	});

	it('counts completed and failed runs on the day they started and rounds the success rate', () => {
		const execs = [
			makeExec({ executionId: 'a', startedAt: at(22, 9) }),
			makeExec({ executionId: 'b', startedAt: at(22, 10) }),
			makeExec({ executionId: 'c', status: 'failed', startedAt: at(22, 11) }),
			makeExec({ executionId: 'd', status: 'failed', startedAt: at(21, 23) }),
			makeExec({ executionId: 'old', startedAt: at(1) }),
		];
		expect(countRunsPerDay(execs, NOW, 2)).toEqual([
			{ dayStart: at(21, 0), completed: 0, failed: 1, successRate: 0 },
			{ dayStart: at(22, 0), completed: 2, failed: 1, successRate: 67 },
		]);
	});

	it('does not count runs that are not finished', () => {
		const execs = [
			makeExec({ executionId: 'a', status: 'running', completedAt: null, startedAt: at(22, 9) }),
			makeExec({ executionId: 'b', status: 'queued', completedAt: null, startedAt: at(22, 10) }),
		];
		expect(countRunsPerDay(execs, NOW, 1)).toEqual([
			{ dayStart: at(22, 0), completed: 0, failed: 0, successRate: null },
		]);
	});

	it('refuses a day count that is not a positive integer, naming the value', () => {
		expect(() => countRunsPerDay([], NOW, 0)).toThrow(/days.*0/);
		expect(() => countRunsPerDay([], NOW, 1.5)).toThrow(/days.*1\.5/);
	});
});

describe('successWindow', () => {
	it('is empty (no rate) when no run is finished', () => {
		const running = makeExec({ executionId: 'a', status: 'running', completedAt: null });
		expect(successWindow([running], 20)).toEqual({ completed: 0, failed: 0, successRate: null });
	});

	it('looks at the newest finished runs only, skipping runs still going', () => {
		const execs = [
			makeExec({ executionId: 'live', status: 'running', completedAt: null, startedAt: at(22, 14) }),
			makeExec({ executionId: 'f', status: 'failed', startedAt: at(22, 13) }),
			makeExec({ executionId: 'ok1', startedAt: at(22, 12) }),
			makeExec({ executionId: 'ok2', startedAt: at(22, 11) }),
			makeExec({ executionId: 'older-failure', status: 'failed', startedAt: at(22, 10) }),
		];
		expect(successWindow(execs, 3)).toEqual({ completed: 2, failed: 1, successRate: 67 });
	});

	it('refuses a window that is not a positive integer', () => {
		expect(() => successWindow([], 0)).toThrow(/size.*0/);
	});
});

describe('successTrend', () => {
	it('compares the success rate of the last N days with the N days before', () => {
		const execs = [
			makeExec({ executionId: 'now1', startedAt: at(22, 1) }),
			makeExec({ executionId: 'now2', startedAt: at(21, 1) }),
			makeExec({ executionId: 'before1', startedAt: at(19, 1) }),
			makeExec({ executionId: 'before2', status: 'failed', startedAt: at(19, 2) }),
		];
		expect(successTrend(execs, NOW, 2)).toEqual({ current: 100, previous: 50 });
	});

	it('has no rate for a period without finished run', () => {
		expect(successTrend([], NOW, 7)).toEqual({ current: null, previous: null });
	});
});

describe('countSince', () => {
	it('counts the runs started in the window, failed ones apart, whatever their status', () => {
		const execs = [
			makeExec({ executionId: 'a', startedAt: new Date(NOW - HOUR_MS).toISOString() }),
			makeExec({ executionId: 'b', status: 'failed', startedAt: new Date(NOW - 23 * HOUR_MS).toISOString() }),
			makeExec({
				executionId: 'c',
				status: 'running',
				completedAt: null,
				startedAt: new Date(NOW - 2 * HOUR_MS).toISOString(),
			}),
			makeExec({ executionId: 'old', status: 'failed', startedAt: new Date(NOW - 25 * HOUR_MS).toISOString() }),
		];
		expect(countSince(execs, NOW, 24 * HOUR_MS)).toEqual({ total: 3, failed: 1 });
	});
});
