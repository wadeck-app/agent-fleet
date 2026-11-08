import { describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { countByStatus } from './StatusCounts.js';

describe('countByStatus', () => {
	it('counts every known status, with zero for the ones that did not run, and the total', () => {
		const counts = countByStatus([
			makeExec({ executionId: 'a', status: 'completed' }),
			makeExec({ executionId: 'b', status: 'completed' }),
			makeExec({ executionId: 'c', status: 'failed' }),
		]);
		expect(counts).toEqual({
			total: 3,
			waitingForWorkspace: 0,
			queued: 0,
			running: 0,
			completed: 2,
			failed: 1,
			're-queued': 0,
		});
	});

	it('is all zero for no execution', () => {
		expect(countByStatus([]).total).toBe(0);
	});

	it('counts only the executions of the given flow', () => {
		const counts = countByStatus(
			[
				makeExec({ executionId: 'a', flowId: 'f1', status: 'failed' }),
				makeExec({ executionId: 'b', flowId: 'f2', status: 'failed' }),
				makeExec({ executionId: 'c', flowId: 'f1', status: 'running' }),
			],
			'f1'
		);
		expect(counts).toMatchObject({ total: 2, failed: 1, running: 1 });
	});

	it('fails loudly on a status it does not know instead of dropping the execution from the counts', () => {
		const corrupt = { ...makeExec({ executionId: 'a' }), status: 'exploded' } as unknown as Parameters<
			typeof countByStatus
		>[0][number];
		expect(() => countByStatus([corrupt])).toThrow(/exploded/);
	});
});

describe('countByStatus waiting for a workspace', () => {
	it('keeps counting a waiting run as queued and tells how many of the queued ones wait', () => {
		const wait = { since: '2026-10-22T10:00:00.000Z', message: 'all slots claimed', run: {} };
		const counts = countByStatus([
			makeExec({ executionId: 'a', status: 'queued', workspaceWait: wait }),
			makeExec({ executionId: 'b', status: 'queued' }),
		]);
		expect(counts).toMatchObject({ total: 2, queued: 2, waitingForWorkspace: 1 });
	});
});
