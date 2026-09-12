import { describe, expect, it } from 'vitest';

import { DefaultInteractivityPolicy } from './DefaultInteractivityPolicy.js';

const policy = new DefaultInteractivityPolicy();

describe('DefaultInteractivityPolicy', () => {
	// One rule, fully predictable (D#39): a step needing a human fails at once rather than
	// waiting on a terminal nobody has opened.
	it('fails immediately when no worker has a user interface', () => {
		const decision = policy.decide({ stepId: 'confirm', waitingMs: 0, interactiveWorkers: 0 });

		expect(decision.action).toBe('fail');
	});

	it('names the step and says how to make it runnable', () => {
		const decision = policy.decide({ stepId: 'confirm', waitingMs: 0, interactiveWorkers: 0 });

		expect(decision).toMatchObject({ action: 'fail' });
		const reason = decision.action === 'fail' ? decision.reason : '';
		expect(reason).toContain('confirm');
		expect(reason).toContain('flow worker');
	});

	// Being asked at all means routing found nothing, but a policy must not assume that:
	// answering "fail" while capacity exists would kill a runnable step.
	it('waits when an interactive worker exists but is busy', () => {
		const decision = policy.decide({ stepId: 'confirm', waitingMs: 500, interactiveWorkers: 1 });

		expect(decision.action).toBe('wait');
	});
});
