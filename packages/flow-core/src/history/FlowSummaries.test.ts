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
			{ flowId: 'build', executionCount: 1, failedCount: 0, lastStartedAt: '2026-08-17T10:00:00.000Z' },
			{ flowId: 'deploy', executionCount: 2, failedCount: 1, lastStartedAt: '2026-08-16T10:00:00.000Z' },
		]);
	});
});
