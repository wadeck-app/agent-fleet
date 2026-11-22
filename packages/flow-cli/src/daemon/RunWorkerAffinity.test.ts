import { describe, expect, it } from 'vitest';

import { RunWorkerAffinity } from './RunWorkerAffinity.js';

describe('RunWorkerAffinity', () => {
	it('has no preference for a run that has not started a step', () => {
		expect(new RunWorkerAffinity().preferredWorkerOf('run-1')).toBeUndefined();
	});

	it('prefers the worker of the latest step of the run', () => {
		const affinity = new RunWorkerAffinity();
		affinity.record('run-1', 'w1');
		affinity.record('run-1', 'w2');
		expect(affinity.preferredWorkerOf('run-1')).toBe('w2');
	});

	it('keeps interleaved runs apart', () => {
		const affinity = new RunWorkerAffinity();
		affinity.record('run-1', 'w1');
		affinity.record('run-2', 'w2');
		expect(affinity.preferredWorkerOf('run-1')).toBe('w1');
		expect(affinity.preferredWorkerOf('run-2')).toBe('w2');
	});

	it('forgets a run that is over and leaves the others', () => {
		const affinity = new RunWorkerAffinity();
		affinity.record('run-1', 'w1');
		affinity.record('run-2', 'w2');
		affinity.forgetExecution('run-1');
		expect(affinity.preferredWorkerOf('run-1')).toBeUndefined();
		expect(affinity.size).toBe(1);
		affinity.forgetExecution('run-2');
		expect(affinity.size).toBe(0);
	});
});
