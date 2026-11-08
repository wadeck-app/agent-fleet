import { describe, expect, it } from 'vitest';

import { RequirementSyntax } from './RequirementSyntax';

describe('RequirementSyntax.parse', () => {
	it('parses a keyword', () => {
		expect(RequirementSyntax.parse('sandbox')).toEqual({ raw: 'sandbox', key: 'sandbox' });
	});

	it('parses key=value', () => {
		expect(RequirementSyntax.parse('fs=confined')).toEqual({ raw: 'fs=confined', key: 'fs', value: 'confined' });
	});

	it.each(['', ' ', '=x', 'fs=', 'a=b=c', 'fs = confined', ' fs=confined', 'fs=conf ined', 'a||b', 'fs=a|b'])(
		'rejects %j',
		entry => {
			expect(() => RequirementSyntax.parse(entry)).toThrow(/requirement/i);
		}
	);

	it('names the accepted forms in the error', () => {
		expect(() => RequirementSyntax.parse('fs = confined')).toThrow(/keyword.*key=value|key=value.*keyword/s);
	});
});

describe('RequirementSyntax.normalise', () => {
	it('returns undefined as an empty list', () => {
		expect(RequirementSyntax.normalise(undefined, 'Flow "f"')).toEqual([]);
	});

	it('removes duplicates and sorts, so a stored set is stable', () => {
		expect(RequirementSyntax.normalise(['net=filtered', 'fs=confined', 'fs=confined'], 'Flow "f"')).toEqual([
			'fs=confined',
			'net=filtered',
		]);
	});

	it('rejects a bare string with the place in the message', () => {
		expect(() => RequirementSyntax.normalise('fs=confined', 'Step "s1"')).toThrow(/Step "s1".*must be a list/);
	});

	it('rejects a non-string entry', () => {
		expect(() => RequirementSyntax.normalise([42], 'Step "s1"')).toThrow(/Step "s1".*string/);
	});
});

describe('RequirementSyntax.closest', () => {
	const known = ['fs=confined', 'env=clean', 'net=filtered', 'ports=private'];

	it('suggests a known entry for a near key', () => {
		expect(RequirementSyntax.closest('fs=confind', known)).toEqual(['fs=confined']);
		expect(RequirementSyntax.closest('evn=clean', known)).toEqual(['env=clean']);
	});

	it('suggests entries of a known key when only the value is wrong', () => {
		expect(RequirementSyntax.closest('fs=readonly', known)).toEqual(['fs=confined']);
	});

	it('suggests nothing for something far from every known entry', () => {
		expect(RequirementSyntax.closest('gpu=a100', known)).toEqual([]);
	});

	it('never suggests the entry itself', () => {
		expect(RequirementSyntax.closest('fs=confined', known)).toEqual([]);
	});
});
