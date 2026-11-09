import { describe, expect, it } from 'vitest';

import { eachRow } from '../testing/EachRow';
import { RequiresGuard, SANDBOX_GUARANTEES } from './RequiresGuard';

describe('SANDBOX_GUARANTEES', () => {
	it('lists only what the exec variant enforces (fs=readonly-enforced since the :ro workspace mount; never net=filtered, which it cannot verify)', () => {
		expect([...SANDBOX_GUARANTEES]).toEqual([
			'clean=run',
			'env=clean',
			'fs=confined',
			'fs=readonly-enforced',
			'ports=private',
			'sandbox',
		]);
	});
});

describe('RequiresGuard.refusal', () => {
	it('accepts a step whose requires are non-empty and all guaranteed by this worker (in any order, any subset)', async () => {
		await eachRow<[string, unknown]>(
			[
				['the keyword', ['sandbox']],
				['one guarantee', ['fs=confined']],
				['several, sorted', ['env=clean', 'fs=confined', 'sandbox']],
				['several, unsorted', ['sandbox', 'clean=run']],
				['all of them', [...SANDBOX_GUARANTEES]],
			],
			(_name, requires) => expect(RequiresGuard.refusal(requires)).toBeUndefined()
		);
	});

	it('refuses a missing field with the flow syntax to add and what this worker provides', () => {
		const message = RequiresGuard.refusal(undefined);

		expect(message).toMatch(/no "requires"/);
		expect(message).toContain('requires: [sandbox]');
		expect(message).not.toMatch(/workerType/i);
		for (const guarantee of SANDBOX_GUARANTEES) expect(message).toContain(guarantee);
	});

	it('refuses an empty list and a value that is not a list of strings, never guessing', async () => {
		await eachRow<[string, unknown, RegExp]>(
			[
				['an empty list', [], /no "requires"/],
				['null', null, /no "requires"/],
				['a string', 'sandbox', /must be a list of strings/],
				['a number', 3, /must be a list of strings/],
				['a list with a number', ['sandbox', 3], /must be a list of strings/],
				['a list with an empty string', ['sandbox', ''], /must be a list of strings/],
			],
			(_name, requires, expected) => expect(RequiresGuard.refusal(requires)).toMatch(expected)
		);
	});

	it('refuses entries this worker does not guarantee, naming them and what it does provide', async () => {
		await eachRow<[string, unknown, string[]]>(
			[
				['an unknown keyword', ['sandbox', 'gpu'], ['gpu']],
				['two missing', ['net=filtered', 'gpu'], ['net=filtered', 'gpu']],
				['a wrong value of a known key', ['fs=readonly', 'fs=confined'], ['fs=readonly']],
				['no ordering: clean=step is not clean=run', ['clean=step'], ['clean=step']],
			],
			(_name, requires, missing) => {
				const message = RequiresGuard.refusal(requires);

				expect(message).toBeDefined();
				for (const entry of missing) expect(message).toContain(JSON.stringify(entry));
				expect(message).toContain('This worker provides:');
				expect(message).not.toMatch(/no "requires"/);
			}
		);
	});
});
