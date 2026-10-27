import { describe, expect, it } from 'vitest';

import { BoundStepWait } from './BoundStepWait.js';

function waitWithClock(waitMs: number) {
	const clock = { now: 1_000 };
	return { clock, wait: new BoundStepWait(waitMs, () => clock.now) };
}

const request = (overrides: Partial<Parameters<BoundStepWait['decide']>[0]> = {}) => ({
	executionId: 'e1',
	stepId: 's1',
	workerType: 'sandbox',
	connectedOfType: 0,
	knownTypes: ['sandbox'],
	...overrides,
});

describe('BoundStepWait', () => {
	it('waits while no worker of the type has been missing for the whole bound', () => {
		const { clock, wait } = waitWithClock(120_000);

		expect(wait.decide(request()).action).toBe('wait');
		clock.now += 119_999;
		expect(wait.decide(request()).action).toBe('wait');
	});

	it('fails once the bound is spent, saying what is missing and what to do', () => {
		const { clock, wait } = waitWithClock(120_000);
		wait.decide(request());
		clock.now += 120_000;

		const decision = wait.decide(request());

		expect(decision.action).toBe('fail');
		const reason = decision.action === 'fail' ? decision.reason : '';
		expect(reason).toContain('"s1"');
		expect(reason).toContain('"sandbox"');
		expect(reason).toContain('120s');
		expect(reason).toContain('never runs on another worker');
		expect(reason).toContain('flow worker source list');
		expect(reason).toContain('worker.boundStepWaitSeconds');
	});

	it('fails at once with a zero bound', () => {
		const { wait } = waitWithClock(0);

		expect(wait.decide(request()).action).toBe('fail');
	});

	// A busy worker of the type will free up: waiting for it is queueing, not a missing worker.
	it('keeps waiting, and starts the count over, while a worker of the type is connected', () => {
		const { clock, wait } = waitWithClock(1_000);
		wait.decide(request());
		clock.now += 900;
		expect(wait.decide(request({ connectedOfType: 1 })).action).toBe('wait');

		clock.now += 900;
		expect(wait.decide(request()).action).toBe('wait');
		clock.now += 1_000;
		expect(wait.decide(request()).action).toBe('fail');
	});

	it('counts each step of each execution on its own', () => {
		const { clock, wait } = waitWithClock(1_000);
		wait.decide(request());
		clock.now += 1_000;

		expect(wait.decide(request({ stepId: 's2' })).action).toBe('wait');
		expect(wait.decide(request({ executionId: 'e2' })).action).toBe('wait');
		expect(wait.decide(request()).action).toBe('fail');
	});

	it('forgets a step that failed, so the key does not outlive it', () => {
		const { clock, wait } = waitWithClock(1_000);
		wait.decide(request());
		clock.now += 1_000;
		wait.decide(request());

		expect(wait.size).toBe(0);
	});

	it('forgets a step that was dispatched', () => {
		const { wait } = waitWithClock(1_000);
		wait.decide(request());
		expect(wait.size).toBe(1);

		wait.clear('e1', 's1');

		expect(wait.size).toBe(0);
	});

	it('forgets every step of an execution that is over, and only that one', () => {
		const { wait } = waitWithClock(1_000);
		wait.decide(request());
		wait.decide(request({ stepId: 's2' }));
		wait.decide(request({ executionId: 'e10' }));

		wait.forgetExecution('e1');

		expect(wait.size).toBe(1);
	});

	it('names the types it knows when the bound type is not one of them', () => {
		const { wait } = waitWithClock(0);

		const decision = wait.decide(request({ workerType: 'sandbx', knownTypes: ['gpu', 'sandbox'] }));

		const reason = decision.action === 'fail' ? decision.reason : '';
		expect(reason).toContain('known worker types: gpu, sandbox');
	});

	it('says no worker type is declared when none is', () => {
		const { wait } = waitWithClock(0);

		const decision = wait.decide(request({ knownTypes: [] }));

		const reason = decision.action === 'fail' ? decision.reason : '';
		expect(reason).toContain('no worker source with a plugin is declared');
	});
});
