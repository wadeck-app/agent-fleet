import { describe, expect, it } from 'vitest';

import { summarizeStatuses } from './StatusSummary.js';
import { BUILD_GRAPH, chain, node } from './testing/GraphFixtures.js';

describe('summarizeStatuses', () => {
	it('counts the steps by status in run order and leaves out empty statuses', () => {
		expect(summarizeStatuses(BUILD_GRAPH)).toBe('4 steps: 2 pending, 1 completed, 1 failed');
	});

	it('only counts a definition drawn without a run', () => {
		expect(summarizeStatuses(chain(3))).toBe('3 steps');
	});

	it('uses the singular for one step', () => {
		expect(summarizeStatuses({ nodes: [node('a')], edges: [] })).toBe('1 step');
		expect(summarizeStatuses({ nodes: [node('a', { status: 'running' })], edges: [] })).toBe('1 step: 1 running');
	});
});
