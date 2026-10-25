import { describe, expect, it } from 'vitest';

import { makeExec } from '../testing/makeExec.js';
import { filterExecutions } from './ExecutionFilter.js';

const execs = [
	makeExec({ executionId: 'aaa111', flowId: 'flow-a', status: 'completed' }),
	makeExec({ executionId: 'aaa222', flowId: 'flow-b', status: 'failed' }),
	makeExec({ executionId: 'bbb333', flowId: 'flow-a', status: 'failed' }),
];

describe('filterExecutions', () => {
	it('returns everything (default page size 20) when no filter is given', () => {
		const result = filterExecutions(execs, {});
		expect(result.items.map(e => e.executionId)).toEqual(['aaa111', 'aaa222', 'bbb333']);
		expect(result.total).toBe(3);
	});

	it('filters by status and by flow, combined', () => {
		expect(filterExecutions(execs, { status: 'failed' }).items).toHaveLength(2);
		expect(filterExecutions(execs, { flow: 'flow-a' }).items).toHaveLength(2);
		expect(filterExecutions(execs, { status: 'failed', flow: 'flow-a' }).items.map(e => e.executionId)).toEqual([
			'bbb333',
		]);
	});

	it('filters by id prefix and ignores limit/offset then (a lookup, not a page)', () => {
		const result = filterExecutions(execs, { id: 'aaa', limit: 1, offset: 1 });
		expect(result.items.map(e => e.executionId)).toEqual(['aaa111', 'aaa222']);
		expect(result.total).toBe(2);
	});

	it('applies the id prefix after status/flow filters', () => {
		expect(filterExecutions(execs, { id: 'aaa', status: 'failed' }).items.map(e => e.executionId)).toEqual([
			'aaa222',
		]);
	});

	it('paginates with limit/offset and reports the total before pagination', () => {
		const result = filterExecutions(execs, { limit: 1, offset: 1 });
		expect(result.items.map(e => e.executionId)).toEqual(['aaa222']);
		expect(result.total).toBe(3);
	});

	it('searches the flow name by case-insensitive substring with flowContains, combined with the other filters', () => {
		const named = [
			makeExec({ executionId: 'n1', flowId: 'build_task', status: 'completed' }),
			makeExec({ executionId: 'n2', flowId: 'Deploy-Prod', status: 'failed' }),
			makeExec({ executionId: 'n3', flowId: 'deploy_stage', status: 'failed' }),
		];
		expect(filterExecutions(named, { flowContains: 'deploy' }).items.map(e => e.executionId)).toEqual(['n2', 'n3']);
		expect(filterExecutions(named, { flowContains: 'TASK' }).items.map(e => e.executionId)).toEqual(['n1']);
		expect(filterExecutions(named, { flowContains: 'deploy', status: 'failed', limit: 1 }).total).toBe(2);
		expect(filterExecutions(named, { flowContains: 'nothing' })).toEqual({ items: [], total: 0 });
	});

	it('keeps flow as an exact match when flowContains is not given', () => {
		const named = [
			makeExec({ executionId: 'n1', flowId: 'deploy' }),
			makeExec({ executionId: 'n2', flowId: 'deploy_stage' }),
		];
		expect(filterExecutions(named, { flow: 'deploy' }).items.map(e => e.executionId)).toEqual(['n1']);
	});

	it('filters the pseudo status "recovered": completed runs that saw an error', () => {
		const runs = [
			makeExec({ executionId: 'r1', status: 'completed', lastError: 'flaky' }),
			makeExec({ executionId: 'r2', status: 'completed' }),
			makeExec({ executionId: 'r3', status: 'failed', lastError: 'boom' }),
		];
		expect(filterExecutions(runs, { status: 'recovered' }).items.map(e => e.executionId)).toEqual(['r1']);
		expect(filterExecutions(runs, { status: 'completed' }).items.map(e => e.executionId)).toEqual(['r1', 'r2']);
	});

	it('rejects a non-integer or negative limit/offset with an actionable error', () => {
		expect(() => filterExecutions(execs, { limit: Number.NaN })).toThrow(/limit/);
		expect(() => filterExecutions(execs, { offset: -1 })).toThrow(/offset/);
	});
});

describe('filterExecutions by project', () => {
	const mixed = [
		makeExec({ executionId: 'p1', projectId: 'aaaaaaaa' }),
		makeExec({ executionId: 'p2', projectId: 'bbbbbbbb' }),
		makeExec({ executionId: 'old', projectRoot: '/old/root' }),
	];

	it('keeps only the executions of that project id; old records without an id never match', () => {
		const result = filterExecutions(mixed, { projectId: 'aaaaaaaa' });
		expect(result.items.map(e => e.executionId)).toEqual(['p1']);
		expect(result.total).toBe(1);
	});
});
