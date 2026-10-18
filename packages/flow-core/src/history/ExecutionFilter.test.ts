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

	it('rejects a non-integer or negative limit/offset with an actionable error', () => {
		expect(() => filterExecutions(execs, { limit: Number.NaN })).toThrow(/limit/);
		expect(() => filterExecutions(execs, { offset: -1 })).toThrow(/offset/);
	});
});
