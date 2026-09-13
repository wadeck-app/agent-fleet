import { describe, expect, it } from 'vitest';

import { DEFAULT_INTERACTIVE_WAIT_MS, DefaultInteractivityPolicy } from './DefaultInteractivityPolicy.js';

const policy = new DefaultInteractivityPolicy();

describe('DefaultInteractivityPolicy', () => {
	// Being asked at all means routing found nothing, but a policy must not assume that:
	// answering "fail" while capacity exists would kill a runnable step.
	it('waits when an interactive worker exists but is busy', () => {
		const decision = policy.decide({ stepId: 'confirm', waitingMs: 500, interactiveWorkers: 1 });

		expect(decision.action).toBe('wait');
	});

	// Why this is a bounded wait and no longer an immediate failure: an idle daemon stops and
	// disconnects external workers, so a `flow worker` is *always* momentarily absent right after
	// a run starts a fresh daemon. Failing at once made an interactive step unwinnable -- the
	// worker reconnects a second later, to a step already marked failed.
	it('waits while an absent worker still has time to re-register', () => {
		const decision = policy.decide({ stepId: 'confirm', waitingMs: 0, interactiveWorkers: 0 });

		expect(decision.action).toBe('wait');
	});

	it('keeps waiting up to the bound', () => {
		const decision = policy.decide({
			stepId: 'confirm',
			waitingMs: DEFAULT_INTERACTIVE_WAIT_MS - 1,
			interactiveWorkers: 0,
		});

		expect(decision.action).toBe('wait');
	});

	// Bounded, not indefinite: a step that blocks a flow on a terminal nobody will ever open must
	// end with something to act on rather than hanging forever (D#39's concern, kept).
	it('fails once the bound is reached with nothing connected', () => {
		const decision = policy.decide({
			stepId: 'confirm',
			waitingMs: DEFAULT_INTERACTIVE_WAIT_MS,
			interactiveWorkers: 0,
		});

		expect(decision.action).toBe('fail');
	});

	it('names the step, how long it waited, and how to make it runnable', () => {
		const decision = policy.decide({
			stepId: 'confirm',
			waitingMs: DEFAULT_INTERACTIVE_WAIT_MS,
			interactiveWorkers: 0,
		});

		expect(decision).toMatchObject({ action: 'fail' });
		const reason = decision.action === 'fail' ? decision.reason : '';
		expect(reason).toContain('confirm');
		expect(reason).toContain('flow worker');
		expect(reason).toMatch(/\d+ ?s/);
	});

	// The bound has to outlast one full reconnect backoff of a waiting worker
	// (MAX_RECONNECT_DELAY_MS in WorkerLaunch is 30s), or the wait cannot do its job.
	it('waits longer than a worker takes to retry', () => {
		expect(DEFAULT_INTERACTIVE_WAIT_MS).toBeGreaterThan(30_000);
	});
});
