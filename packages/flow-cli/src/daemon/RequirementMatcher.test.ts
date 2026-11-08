import { describe, expect, it } from 'vitest';

import { missingRequirements, normaliseStepRequirements, workerMeetsRequirements } from './RequirementMatcher.js';

describe('workerMeetsRequirements', () => {
	it('is true when nothing is required, whatever the worker guarantees', () => {
		expect(workerMeetsRequirements([], [])).toBe(true);
		expect(workerMeetsRequirements([], ['fs=confined'])).toBe(true);
	});

	it('requires every entry (AND)', () => {
		expect(workerMeetsRequirements(['fs=confined', 'env=clean'], ['env=clean', 'fs=confined', 'x'])).toBe(true);
		expect(workerMeetsRequirements(['fs=confined', 'env=clean'], ['fs=confined'])).toBe(false);
	});

	it('compares by equality: another value of the same key does not satisfy', () => {
		expect(workerMeetsRequirements(['clean=step'], ['clean=run'])).toBe(false);
	});

	it('a worker advertising several values of a key satisfies each of them', () => {
		const guarantees = ['clean=run', 'clean=step'];
		expect(workerMeetsRequirements(['clean=run'], guarantees)).toBe(true);
		expect(workerMeetsRequirements(['clean=step'], guarantees)).toBe(true);
	});

	it('a keyword is not satisfied by a key=value of the same key, nor the reverse', () => {
		expect(workerMeetsRequirements(['sandbox'], ['sandbox=yes'])).toBe(false);
		expect(workerMeetsRequirements(['sandbox=yes'], ['sandbox'])).toBe(false);
	});

	it('a worker with no guarantee meets nothing that is required', () => {
		expect(workerMeetsRequirements(['sandbox'], [])).toBe(false);
	});
});

describe('missingRequirements', () => {
	it('lists the entries the guarantees do not cover, in the order required', () => {
		expect(missingRequirements(['b', 'a=1', 'c'], ['a=1'])).toEqual(['b', 'c']);
	});
});

describe('normaliseStepRequirements', () => {
	it('merges the run requirements with the step own, sorted and unique', () => {
		expect(normaliseStepRequirements(['net=filtered'], ['fs=confined', 'net=filtered'], 's1')).toEqual([
			'fs=confined',
			'net=filtered',
		]);
	});

	it('fails with the step id when the step requires is malformed (a step injected at run time skips the validator)', () => {
		expect(() => normaliseStepRequirements([], 'fs = confined', 's1')).toThrow(/Step "s1".*must be a list/);
		expect(() => normaliseStepRequirements([], ['fs = confined'], 's1')).toThrow(/Step "s1".*Invalid requirement/);
	});
});
