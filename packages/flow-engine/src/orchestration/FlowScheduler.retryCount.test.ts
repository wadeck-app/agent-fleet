import { describe, expect, it } from 'vitest';

import { FlowScheduler } from './FlowScheduler';
import type { SchedulerStep } from './FlowScheduler';

describe('FlowScheduler.getRetryCount', () => {
	// The daemon tells a retry from any other re-run by whether this number grew since the step last started.
	it('counts the retries the scheduler has granted a step, and is 0 for a step never retried', () => {
		const step: SchedulerStep = { id: 'a', retry: { maxAttempts: 2, backoff: 'linear' } };
		const scheduler = new FlowScheduler({ inputs: {}, stepOutputs: new Map() });
		scheduler.start([step], new Map());
		expect(scheduler.getRetryCount('a')).toBe(0);

		scheduler.acknowledge('a');
		scheduler.complete('a', { type: 'failed', error: 'x' });
		expect(scheduler.getRetryCount('a')).toBe(1);

		scheduler.acknowledge('a');
		scheduler.complete('a', { type: 'failed', error: 'x' });
		expect(scheduler.getRetryCount('a')).toBe(2);
		expect(scheduler.getRetryCount('unknown-step')).toBe(0);
	});
});
