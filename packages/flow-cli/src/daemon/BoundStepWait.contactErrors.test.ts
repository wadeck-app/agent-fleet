import { describe, expect, it, vi } from 'vitest';

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

const REFUSED_BASE = BASE.replace(
	'but no worker of that type was connected in the 121s it waited',
	'but no worker of that type that accepts this step was available in the 121s it waited'
);

describe('BoundStepWait - connected workers of the type that refuse the step', () => {
	function failureWith(
		refusals: (() => string[]) | undefined,
		contactErrorsSince?: () => string[]
	): ReturnType<BoundStepWait['decide']> {
		let now = 1_000;
		const wait = new BoundStepWait(120_000, () => now);
		const request = {
			executionId: 'e1',
			stepId: 's1',
			workerType: 'sandbox',
			connectedOfType: 0,
			knownTypes: ['sandbox'],
			...(refusals === undefined ? {} : { refusals }),
			...(contactErrorsSince === undefined ? {} : { contactErrorsSince }),
		};
		wait.decide(request);
		now += 121_000;
		return wait.decide(request);
	}

	it('says no worker that ACCEPTS the step was available (not that none was connected), then names the workers and why', () => {
		const decision = failureWith(() => ['w-1 (it lacks the label "gpu")', 'w-2 (it cannot run the shell "bash")']);

		expect(decision).toEqual({
			action: 'fail',
			reason: `${REFUSED_BASE} Workers of that type are connected but refuse this step: w-1 (it lacks the label "gpu"); w-2 (it cannot run the shell "bash").`,
		});
		expect(decision.action === 'fail' && decision.reason).not.toContain('was connected in the');
	});

	it('puts the base first, then the refusals, then the contact sentence', () => {
		const decision = failureWith(
			() => ['w-1 (it lacks the label "gpu")'],
			() => ['Last contact with source "sbx-1" failed at T1.']
		);

		expect(decision).toEqual({
			action: 'fail',
			reason: `${REFUSED_BASE} Workers of that type are connected but refuse this step: w-1 (it lacks the label "gpu"). Last contact with source "sbx-1" failed at T1.`,
		});
	});

	it('lists at most five and counts the rest', () => {
		const refusals = Array.from({ length: 8 }, (_, index) => `w-${String(index)} (it lacks the label "gpu")`);

		const decision = failureWith(() => refusals);

		expect(decision.action === 'fail' && decision.reason).toContain('w-4 (it lacks the label "gpu"); and 3 more.');
		expect(decision.action === 'fail' && decision.reason).not.toContain('w-5');
	});

	it('leaves the message exactly as before when no connected worker of the type refuses', () => {
		expect(failureWith(() => [])).toEqual({ action: 'fail', reason: BASE });
		expect(failureWith(undefined)).toEqual({ action: 'fail', reason: BASE });
	});

	it('works out the refusals only when the step fails, never while it waits', () => {
		let now = 1_000;
		const wait = new BoundStepWait(120_000, () => now);
		const refusals = vi.fn(() => ['w-1 (it lacks the label "gpu")']);
		const request = {
			executionId: 'e1',
			stepId: 's1',
			workerType: 'sandbox',
			connectedOfType: 0,
			knownTypes: ['sandbox'],
			refusals,
		};

		wait.decide(request);
		now += 60_000;
		wait.decide(request);
		expect(refusals).not.toHaveBeenCalled();

		now += 61_000;
		wait.decide(request);
		expect(refusals).toHaveBeenCalledOnce();
	});

	it('does not fail while a worker of the type that accepts the step is connected', () => {
		let now = 1_000;
		const wait = new BoundStepWait(120_000, () => now);
		const request = {
			executionId: 'e1',
			stepId: 's1',
			workerType: 'sandbox',
			connectedOfType: 1,
			knownTypes: ['sandbox'],
		};
		wait.decide(request);
		now += 600_000;

		expect(wait.decide(request)).toEqual({ action: 'wait' });
	});
});
