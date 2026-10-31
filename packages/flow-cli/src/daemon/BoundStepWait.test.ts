import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BoundStepWait, DEADLINE_RETRY_MS } from './BoundStepWait.js';

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

// Dispatch only runs on events; with nothing connected, nothing may be left to notice that the bound has passed.
describe('BoundStepWait - its own deadline timer', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	function timed(waitMs: number) {
		const onDeadline = vi.fn();
		return { onDeadline, wait: new BoundStepWait(waitMs, Date.now, onDeadline) };
	}

	it('asks for a dispatch pass when the bound is spent, without any other event', () => {
		const { wait, onDeadline } = timed(120_000);
		wait.decide(request());

		vi.advanceTimersByTime(119_999);
		expect(onDeadline).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(onDeadline).toHaveBeenCalledTimes(1);
	});

	it('arms one timer per step however often it is decided', () => {
		const { wait, onDeadline } = timed(1_000);
		wait.decide(request());
		vi.advanceTimersByTime(400);
		wait.decide(request());
		wait.decide(request());

		vi.advanceTimersByTime(10_000);

		expect(onDeadline).toHaveBeenCalledTimes(1);
	});

	// A timer that fires while the clock reads short of the bound must not leave the step without one.
	it('arms again for the remainder when it fires before the bound is spent', () => {
		const onDeadline = vi.fn();
		const clock = { now: 0 };
		const wait = new BoundStepWait(1_000, () => clock.now, onDeadline);
		wait.decide(request());
		clock.now = 600;

		vi.advanceTimersByTime(1_000);
		expect(onDeadline).toHaveBeenCalledTimes(1);
		wait.decide(request());

		vi.advanceTimersByTime(400);
		expect(onDeadline).toHaveBeenCalledTimes(2);
	});

	it('does not fire for a step handed to a worker', () => {
		const { wait, onDeadline } = timed(1_000);
		wait.decide(request());
		wait.clear('e1', 's1');

		vi.advanceTimersByTime(5_000);

		expect(onDeadline).not.toHaveBeenCalled();
	});

	it('does not fire for a step that failed', () => {
		const { wait, onDeadline } = timed(1_000);
		wait.decide(request());
		vi.advanceTimersByTime(1_000);
		expect(onDeadline).toHaveBeenCalledTimes(1);
		wait.decide(request());

		vi.advanceTimersByTime(5_000);

		expect(onDeadline).toHaveBeenCalledTimes(1);
	});

	it('does not fire while a worker of the type is connected', () => {
		const { wait, onDeadline } = timed(1_000);
		wait.decide(request());
		wait.decide(request({ connectedOfType: 1 }));

		vi.advanceTimersByTime(5_000);

		expect(onDeadline).not.toHaveBeenCalled();
	});

	it('does not fire for an execution that is over', () => {
		const { wait, onDeadline } = timed(1_000);
		wait.decide(request());
		wait.forgetExecution('e1');

		vi.advanceTimersByTime(5_000);

		expect(onDeadline).not.toHaveBeenCalled();
	});

	it('does not fire once stopped', () => {
		const { wait, onDeadline } = timed(1_000);
		wait.decide(request());
		wait.decide(request({ stepId: 's2' }));

		wait.stop();
		vi.advanceTimersByTime(5_000);

		expect(onDeadline).not.toHaveBeenCalled();
		expect(wait.size).toBe(0);
	});

	// A throw out of a timer callback is an uncaught exception, and the daemon has no handler for it.
	describe('when the dispatch pass asked for by the timer throws', () => {
		let stderr: ReturnType<typeof vi.spyOn>;
		beforeEach(() => {
			stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		});
		afterEach(() => {
			stderr.mockRestore();
		});

		it('does not let the error escape the timer, and reports it with the step it concerns', () => {
			const onDeadline = vi.fn().mockImplementation(() => {
				throw new Error('dispatch exploded');
			});
			const wait = new BoundStepWait(1_000, Date.now, onDeadline);
			wait.decide(request());

			expect(() => vi.advanceTimersByTime(1_000)).not.toThrow();

			const written = stderr.mock.calls.map((call: unknown[]) => String(call[0])).join('');
			expect(written).toContain('[BoundStepWait]');
			expect(written).toContain('e1:s1');
			expect(written).toContain('dispatch exploded');
			wait.stop();
		});

		it('asks again after the retry delay, so the bound of the step is still enforced', () => {
			const onDeadline = vi
				.fn()
				.mockImplementationOnce(() => {
					throw new Error('dispatch exploded');
				})
				.mockImplementation(() => undefined);
			const wait = new BoundStepWait(1_000, Date.now, onDeadline);
			wait.decide(request());

			vi.advanceTimersByTime(1_000);
			expect(onDeadline).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(DEADLINE_RETRY_MS - 1);
			expect(onDeadline).toHaveBeenCalledTimes(1);
			vi.advanceTimersByTime(1);
			expect(onDeadline).toHaveBeenCalledTimes(2);
			wait.stop();
		});

		it('does not ask again for a step the failed pass had already settled', () => {
			const holder: { wait?: BoundStepWait } = {};
			const onDeadline = vi.fn().mockImplementation(() => {
				holder.wait?.clear('e1', 's1');
				throw new Error('dispatch exploded');
			});
			holder.wait = new BoundStepWait(1_000, Date.now, onDeadline);
			holder.wait.decide(request());

			vi.advanceTimersByTime(1_000 + DEADLINE_RETRY_MS * 3);

			expect(onDeadline).toHaveBeenCalledTimes(1);
		});
	});

	it('leaves no timer behind for a bound of zero, which fails at once', () => {
		const { wait } = timed(0);
		wait.decide(request());

		expect(vi.getTimerCount()).toBe(0);
	});

	it('never keeps the process alive', () => {
		const unref = vi.fn();
		const realSetTimeout = globalThis.setTimeout;
		const spy = vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void, ms: number) => {
			const timer = realSetTimeout(fn, ms);
			(timer as unknown as { unref: () => void }).unref = unref;
			return timer;
		}) as never);
		const { wait } = timed(1_000);

		wait.decide(request());

		expect(unref).toHaveBeenCalledTimes(1);
		spy.mockRestore();
		wait.stop();
	});
});
