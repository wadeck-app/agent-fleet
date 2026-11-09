import { describe, expect, it } from 'vitest';

import { BoundStepWait } from './BoundStepWait.js';

/** The failure of a step with requirements that no worker served carries the contact failures of the sources that could provide them. */

const BASE =
	'Step "s1" requires sandbox, but no worker whose source guarantees all of them and accepts this step was available in the 121s it waited, and a step with requirements never runs on another worker. ' +
	'Check that a source providing them is declared (flow worker source list) and that its plugin can start workers (see the daemon log). ' +
	'If starting one takes longer than 120s, raise worker.boundStepWaitSeconds in the daemon config.';

function failure(contactErrorsSince?: (sinceMs: number) => string[]): { reason: string; sinceSeen: number[] } {
	let now = 1_000;
	const sinceSeen: number[] = [];
	const wait = new BoundStepWait(120_000, () => now);
	const request = {
		executionId: 'e1',
		stepId: 's1',
		required: ['sandbox'],
		connectedServing: 0,
		closest: () => [],
		...(contactErrorsSince === undefined
			? {}
			: {
					contactErrorsSince: (since: number) => {
						sinceSeen.push(since);
						return contactErrorsSince(since);
					},
				}),
	};
	wait.decideRequirement(request);
	now += 121_000;
	const decision = wait.decideRequirement(request);
	if (decision.action !== 'fail') throw new Error('expected a failure');
	return { reason: decision.reason, sinceSeen };
}

describe('BoundStepWait - contact errors in the failure', () => {
	it('appends the last contact errors, asked for with the time the step started waiting', () => {
		const { reason, sinceSeen } = failure(() => ['Last contact with source "sbx-1" failed at T1.']);

		expect(reason).toBe(`${BASE} Last contact with source "sbx-1" failed at T1.`);
		expect(sinceSeen).toEqual([1_000]);
	});

	it('joins the errors of several sources', () => {
		const { reason } = failure(() => [
			'Last contact with source "a" failed at T1.',
			'Last contact with source "b" failed at T2.',
		]);

		expect(reason).toBe(
			`${BASE} Last contact with source "a" failed at T1. Last contact with source "b" failed at T2.`
		);
	});

	it('leaves the message exactly as it was when there is no error', () => {
		expect(failure(() => []).reason).toBe(BASE);
		expect(failure().reason).toBe(BASE);
	});

	it('works out the contact errors only when the step fails, never while it waits', () => {
		let now = 1_000;
		const wait = new BoundStepWait(120_000, () => now);
		let asked = 0;
		const request = {
			executionId: 'e1',
			stepId: 's1',
			required: ['sandbox'],
			connectedServing: 0,
			closest: () => [],
			contactErrorsSince: () => {
				asked++;
				return [];
			},
		};

		wait.decideRequirement(request);
		now += 60_000;
		wait.decideRequirement(request);
		expect(asked).toBe(0);

		now += 61_000;
		wait.decideRequirement(request);
		expect(asked).toBe(1);
	});

	it('does not fail while a worker that meets the requirements and accepts the step is connected', () => {
		let now = 1_000;
		const wait = new BoundStepWait(120_000, () => now);
		const request = {
			executionId: 'e1',
			stepId: 's1',
			required: ['sandbox'],
			connectedServing: 1,
			closest: () => [],
		};
		wait.decideRequirement(request);
		now += 600_000;

		expect(wait.decideRequirement(request)).toEqual({ action: 'wait' });
	});
});
