import { describe, expect, it } from 'vitest';

import { BoundStepWait } from './BoundStepWait.js';

/** The failure of a bound step that no worker of its type served carries the contact failures of the sources of that type. */

const BASE =
	'Step "s1" belongs to a run bound to worker type "sandbox" (the flow\'s workerType field), ' +
	'but no worker of that type was connected in the 121s it waited, and a step of a bound run never runs on another worker. ' +
	'known worker types: sandbox. ' +
	'Check that a source of that type is declared (flow worker source list) and that its plugin can start workers (see the daemon log). ' +
	'If starting one takes longer than 120s, raise worker.boundStepWaitSeconds in the daemon config.';

function failure(contactErrorsSince?: (sinceMs: number) => string[]): { reason: string; sinceSeen: number[] } {
	let now = 1_000;
	const sinceSeen: number[] = [];
	const wait = new BoundStepWait(120_000, () => now);
	const request = {
		executionId: 'e1',
		stepId: 's1',
		workerType: 'sandbox',
		connectedOfType: 0,
		knownTypes: ['sandbox'],
		...(contactErrorsSince === undefined
			? {}
			: {
					contactErrorsSince: (since: number) => {
						sinceSeen.push(since);
						return contactErrorsSince(since);
					},
				}),
	};
	wait.decide(request);
	now += 121_000;
	const decision = wait.decide(request);
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
});
