import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoundStepWait } from './BoundStepWait.js';

const request = (overrides: Partial<Parameters<BoundStepWait['decideRequirement']>[0]> = {}) => ({
	executionId: 'e1',
	stepId: 's1',
	required: ['fs=confined', 'net=filtered'],
	connectedServing: 0,
	closest: () => ['Closest: worker w1 (source sbx) lacks net=filtered.'],
	...overrides,
});

describe('BoundStepWait - steps that require something', () => {
	let now: number;
	beforeEach(() => {
		vi.useFakeTimers();
		now = 1_000_000;
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	const build = (waitMs = 120_000, onDeadline?: () => void) => new BoundStepWait(waitMs, () => now, onDeadline);

	it('waits while a worker that meets the requirements is connected, with no clock running (a busy one frees up)', () => {
		const wait = build();

		expect(wait.decideRequirement(request({ connectedServing: 1 }))).toEqual({ action: 'wait' });
		expect(wait.size).toBe(0);
	});

	it('waits up to the bound with nothing connected, then fails naming the requirements and the closest workers', () => {
		const wait = build(120_000);

		expect(wait.decideRequirement(request())).toEqual({ action: 'wait' });
		now += 119_999;
		expect(wait.decideRequirement(request())).toEqual({ action: 'wait' });
		now += 2;
		const decision = wait.decideRequirement(request());

		expect(decision.action).toBe('fail');
		const reason = decision.action === 'fail' ? decision.reason : '';
		expect(reason).toContain('Step "s1"');
		expect(reason).toContain('fs=confined, net=filtered');
		expect(reason).toContain('120s');
		expect(reason).toContain('worker.boundStepWaitSeconds');
		expect(reason).toContain('Closest: worker w1 (source sbx) lacks net=filtered.');
		expect(reason).not.toContain('belongs to a run bound to worker type');
	});

	it('restarts the clock when a serving worker showed up and went away', () => {
		const wait = build(1_000);
		wait.decideRequirement(request());
		now += 900;
		wait.decideRequirement(request({ connectedServing: 1 }));
		now += 900;

		expect(wait.decideRequirement(request())).toEqual({ action: 'wait' });
	});

	it('is a wait of its own: a bound worker type wait for the same step keeps its clock', () => {
		const wait = build(1_000);
		wait.decide({ executionId: 'e1', stepId: 's1', workerType: 'sandbox', connectedOfType: 0, knownTypes: [] });
		now += 600;
		wait.decideRequirement(request());

		expect(wait.size).toBe(2);
		now += 600;
		expect(
			wait.decide({ executionId: 'e1', stepId: 's1', workerType: 'sandbox', connectedOfType: 0, knownTypes: [] })
				.action
		).toBe('fail');
		expect(wait.decideRequirement(request())).toEqual({ action: 'wait' });
	});

	it('asks for a dispatch pass when the bound may have passed, like the worker type wait', () => {
		const onDeadline = vi.fn();
		const wait = build(1_000, onDeadline);

		wait.decideRequirement(request());
		vi.advanceTimersByTime(1_001);

		expect(onDeadline).toHaveBeenCalledTimes(1);
	});

	it('is dropped when the step is handed to a worker, and when its execution is over', () => {
		const wait = build();
		wait.decideRequirement(request());
		wait.decideRequirement(request({ stepId: 's2' }));
		wait.clearRequirement('e1', 's1');
		expect(wait.size).toBe(1);

		wait.forgetExecution('e1');
		expect(wait.size).toBe(0);
	});
});
