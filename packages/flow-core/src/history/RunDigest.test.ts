import { describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { DIGEST_DAYS, DIGEST_ROWS, DIGEST_WINDOW, buildRunDigest } from './RunDigest.js';

const NOW = Date.parse('2026-10-22T12:00:00.000Z');

describe('buildRunDigest', () => {
	it('is all zeros and empty lists when nothing ran', () => {
		const digest = buildRunDigest([], NOW);
		expect(digest).toMatchObject({
			total: 0,
			running: 0,
			failed: 0,
			lastRunAt: null,
			health: { text: 'No execution yet', variant: 'default' },
			window: { completed: 0, failed: 0, successRate: null },
			last24h: { total: 0, failed: 0 },
			week: { current: null, previous: null },
			latest: [],
			failures: [],
			active: [],
			flows: [],
		});
		expect(digest.daily).toHaveLength(DIGEST_DAYS);
	});

	it('answers every dimension from the same runs (newest first)', () => {
		const runs = [
			makeExec({
				executionId: 'live',
				flowId: 'lint',
				status: 'running',
				completedAt: null,
				startedAt: '2026-10-22T11:50:00.000Z',
			}),
			makeExec({
				executionId: 'bad',
				status: 'failed',
				lastError: 'boom',
				startedAt: '2026-10-22T11:00:00.000Z',
			}),
			makeExec({ executionId: 'good', startedAt: '2026-10-22T10:00:00.000Z' }),
		];
		const digest = buildRunDigest(runs, NOW);
		expect(digest).toMatchObject({
			total: 3,
			running: 1,
			failed: 1,
			lastRunAt: '2026-10-22T11:50:00.000Z',
			health: { text: '1 flow failing, 1 running', variant: 'danger' },
			window: { completed: 1, failed: 1, successRate: 50 },
			last24h: { total: 3, failed: 1 },
		});
		expect(digest.latest.map(row => row.executionId)).toEqual(['live', 'bad', 'good']);
		expect(digest.failures.map(row => row.executionId)).toEqual(['bad']);
		expect(digest.active.map(row => row.executionId)).toEqual(['live']);
		expect(digest.flows.map(row => row.flowId)).toEqual(['lint', 'test-flow']);
	});

	it('keeps lists to the row budget and the window to its size', () => {
		const runs = Array.from({ length: 30 }, (_, index) =>
			makeExec({
				executionId: `r${index}`,
				flowId: `flow${index}`,
				status: 'failed',
				lastError: 'e',
				startedAt: new Date(NOW - index * 60_000).toISOString(),
			})
		);
		const digest = buildRunDigest(runs, NOW);
		expect(digest.latest).toHaveLength(DIGEST_ROWS);
		expect(digest.failures).toHaveLength(DIGEST_ROWS);
		expect(digest.flows).toHaveLength(DIGEST_ROWS);
		expect(digest.window.failed).toBe(DIGEST_WINDOW);
	});
});
