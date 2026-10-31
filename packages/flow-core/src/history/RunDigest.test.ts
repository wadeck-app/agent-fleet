import { describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { DIGEST_ROWS, buildRunDigest } from './RunDigest.js';

const NOW = Date.parse('2026-10-22T12:00:00.000Z');

describe('buildRunDigest', () => {
	it('is all zeros and empty lists when nothing ran', () => {
		const digest = buildRunDigest([], NOW);
		expect(digest).toMatchObject({
			total: 0,
			running: 0,
			failed: 0,
			latest: [],
			recentRuns: [],
			recentRunsTruncated: false,
		});
	});

	it('answers the counters, the recent runs and the latest runs from the same runs (newest first)', () => {
		const runs = [
			makeExec({
				executionId: 'live',
				flowId: 'lint',
				status: 'running',
				completedAt: null,
				startedAt: '2026-10-22T11:50:00.000Z',
			}),
			makeExec({ executionId: 'bad', status: 'failed', startedAt: '2026-10-22T11:00:00.000Z' }),
			makeExec({ executionId: 'good', startedAt: '2026-10-22T10:00:00.000Z' }),
		];
		const digest = buildRunDigest(runs, NOW);
		expect(digest).toMatchObject({ total: 3, running: 1, failed: 1 });
		expect(digest.latest.map(row => row.executionId)).toEqual(['live', 'bad', 'good']);
		expect(digest.recentRuns).toEqual([
			{ startedAt: '2026-10-22T11:00:00.000Z', status: 'failed' },
			{ startedAt: '2026-10-22T10:00:00.000Z', status: 'completed' },
		]);
	});

	it('carries exactly the fields the dashboard widget reads', () => {
		expect(Object.keys(buildRunDigest([], NOW)).sort()).toEqual(
			['failed', 'latest', 'recentRuns', 'recentRunsTruncated', 'running', 'total'].sort()
		);
	});

	it('keeps the latest list to the row budget', () => {
		const runs = Array.from({ length: 30 }, (_, index) =>
			makeExec({
				executionId: `r${index}`,
				flowId: `flow${index}`,
				startedAt: new Date(NOW - index * 60_000).toISOString(),
			})
		);
		expect(buildRunDigest(runs, NOW).latest).toHaveLength(DIGEST_ROWS);
	});
});
