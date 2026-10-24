import { describe, expect, it } from 'vitest';

import { countTraceSteps } from './trace-utils';

describe('countTraceSteps', () => {
	it('returns the number of steps of a trace', () => {
		expect(countTraceSteps({ steps: [{}, {}, {}] })).toBe(3);
	});

	it('returns 0 when the trace has no steps list', () => {
		expect(countTraceSteps({})).toBe(0);
		expect(countTraceSteps({ steps: 'not-a-list' })).toBe(0);
	});

	it('returns 0 for non-object values', () => {
		expect(countTraceSteps(undefined)).toBe(0);
		expect(countTraceSteps(null)).toBe(0);
		expect(countTraceSteps([{}, {}])).toBe(0);
	});
});
