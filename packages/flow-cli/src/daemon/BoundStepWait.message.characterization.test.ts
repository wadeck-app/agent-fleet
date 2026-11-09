import { describe, expect, it } from 'vitest';

import { BoundStepWait } from './BoundStepWait.js';

/** Pins the exact failure message of a step with requirements that no worker ever served, before it learns anything about the sources. */

function failureAfter(
	closest: () => string[] = () => [],
	waitedMs = 121_000,
	contactErrorsSince?: () => string[]
): string {
	let now = 1_000;
	const wait = new BoundStepWait(120_000, () => now);
	const request = {
		executionId: 'e1',
		stepId: 's1',
		required: ['fs=confined', 'sandbox'],
		connectedServing: 0,
		closest,
		contactErrorsSince,
	};
	expect(wait.decideRequirement(request)).toEqual({ action: 'wait' });
	now += waitedMs;
	const decision = wait.decideRequirement(request);
	if (decision.action !== 'fail') throw new Error('expected a failure');
	return decision.reason;
}

const USUAL_TEXT =
	'Step "s1" requires fs=confined, sandbox, but no worker whose source guarantees all of them and accepts this step was available in the 121s it waited, and a step with requirements never runs on another worker. ' +
	'Check that a source providing them is declared (flow worker source list) and that its plugin can start workers (see the daemon log). ' +
	'If starting one takes longer than 120s, raise worker.boundStepWaitSeconds in the daemon config.';

describe('the requirement-wait failure message - characterization', () => {
	it('names the step, the requirements, the wait and what to check', () => {
		expect(failureAfter()).toBe(USUAL_TEXT);
	});

	it('does not mention the removed workerType', () => {
		expect(failureAfter()).not.toMatch(/workerType|worker type/);
	});

	it('carries, after the usual text, the closest workers and declared sources', () => {
		expect(failureAfter(() => ['Closest connected workers: w1 lacks fs=confined.'])).toBe(
			`${USUAL_TEXT} Closest connected workers: w1 lacks fs=confined.`
		);
	});

	it('carries, after that, one sentence per source that failed to be contacted', () => {
		const contactSentence =
			'Last contact with source "sbx-1" failed at 2026-11-06T17:02:11Z (3 consecutive failures since 17:01:20Z); the error is in the daemon log (flow logs, or C:/logs).';

		expect(
			failureAfter(
				() => [],
				121_000,
				() => [contactSentence]
			)
		).toBe(`${USUAL_TEXT} ${contactSentence}`);
	});

	it('is exactly the text above, unchanged, when no source failed to be contacted', () => {
		expect(
			failureAfter(
				() => [],
				121_000,
				() => []
			)
		).toBe(failureAfter());
	});
});
