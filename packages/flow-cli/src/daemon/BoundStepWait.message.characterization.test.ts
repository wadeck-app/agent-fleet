import { describe, expect, it } from 'vitest';

import { BoundStepWait } from './BoundStepWait.js';

/** Pins the exact failure message of a bound step that no worker of its type ever served, before it learns anything about the sources. */

function failureAfter(knownTypes: string[], waitedMs = 121_000, contactErrorsSince?: () => string[]): string {
	let now = 1_000;
	const wait = new BoundStepWait(120_000, () => now);
	const request = {
		executionId: 'e1',
		stepId: 's1',
		workerType: 'sandbox',
		connectedOfType: 0,
		knownTypes,
		contactErrorsSince,
	};
	expect(wait.decide(request)).toEqual({ action: 'wait' });
	now += waitedMs;
	const decision = wait.decide(request);
	if (decision.action !== 'fail') throw new Error('expected a failure');
	return decision.reason;
}

describe('the bound-wait failure message - characterization', () => {
	it('names the type, the wait, the known types and what to check', () => {
		expect(failureAfter(['gpu', 'sandbox'])).toBe(
			'Step "s1" belongs to a run bound to worker type "sandbox" (the flow\'s workerType field), ' +
				'but no worker of that type was connected in the 121s it waited, and a step of a bound run never runs on another worker. ' +
				'known worker types: gpu, sandbox. ' +
				'Check that a source of that type is declared (flow worker source list) and that its plugin can start workers (see the daemon log). ' +
				'If starting one takes longer than 120s, raise worker.boundStepWaitSeconds in the daemon config.'
		);
	});

	it('says so when no worker source with a plugin is declared', () => {
		expect(failureAfter([])).toContain(
			'no worker source with a plugin is declared, so no worker type exists yet. Check that a source of that type is declared'
		);
	});

	it('carries, after the usual text, one sentence per source of the type that failed to be contacted', () => {
		expect(
			failureAfter(['sandbox'], 121_000, () => [
				'Last contact with source "sbx-1" failed at 2026-11-06T17:02:11Z (3 consecutive failures since 17:01:20Z); the error is in the daemon log (flow logs, or C:/logs).',
			])
		).toBe(
			'Step "s1" belongs to a run bound to worker type "sandbox" (the flow\'s workerType field), ' +
				'but no worker of that type was connected in the 121s it waited, and a step of a bound run never runs on another worker. ' +
				'known worker types: sandbox. ' +
				'Check that a source of that type is declared (flow worker source list) and that its plugin can start workers (see the daemon log). ' +
				'If starting one takes longer than 120s, raise worker.boundStepWaitSeconds in the daemon config. ' +
				'Last contact with source "sbx-1" failed at 2026-11-06T17:02:11Z (3 consecutive failures since 17:01:20Z); the error is in the daemon log (flow logs, or C:/logs).'
		);
	});

	it('is exactly the text above, unchanged, when no source failed to be contacted', () => {
		expect(failureAfter(['sandbox'], 121_000, () => [])).toBe(failureAfter(['sandbox']));
	});
});
