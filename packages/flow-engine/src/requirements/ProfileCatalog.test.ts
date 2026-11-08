import { describe, expect, it } from 'vitest';

import { ProfileCatalog } from './ProfileCatalog';
import { RequirementSyntax } from './RequirementSyntax';

describe('ProfileCatalog contents (design note D2)', () => {
	it('lists exactly the four built-in profiles, sorted', () => {
		expect(ProfileCatalog.names()).toEqual(['agent', 'hermetic-test', 'inspect', 'untrusted-code']);
	});

	it('does not offer a strict profile', () => {
		expect(ProfileCatalog.find('strict')).toBeUndefined();
	});

	it.each([
		['agent', ['env=clean', 'fs=confined']],
		['inspect', ['env=clean', 'fs=confined', 'fs=readonly-enforced']],
		['untrusted-code', ['env=clean', 'fs=confined', 'ports=private']],
		['hermetic-test', ['clean=run', 'env=clean', 'fs=confined', 'ports=private']],
	])('%s expands to its sorted requirements', (name, expected) => {
		expect(ProfileCatalog.find(name)).toEqual(expected);
	});

	it('every profile is a superset of agent', () => {
		const agent = ProfileCatalog.find('agent')!;
		for (const name of ProfileCatalog.names()) {
			expect(ProfileCatalog.find(name)).toEqual(expect.arrayContaining(agent));
		}
	});

	it('hermetic-test is a superset of untrusted-code', () => {
		expect(ProfileCatalog.find('hermetic-test')).toEqual(
			expect.arrayContaining(ProfileCatalog.find('untrusted-code')!)
		);
	});

	it('every entry is valid requirement syntax', () => {
		for (const name of ProfileCatalog.names()) {
			expect(() => RequirementSyntax.normalise(ProfileCatalog.find(name), `Profile "${name}"`)).not.toThrow();
		}
	});

	// net=filtered is added only when a source declares AND verifies it (the sandbox plugin dropped it on purpose).
	it('no built-in profile contains net=filtered', () => {
		for (const name of ProfileCatalog.names()) {
			expect(ProfileCatalog.find(name)).not.toContain('net=filtered');
		}
	});

	it('every profile except inspect is made only of what the sandbox plugin declares today', () => {
		const sandboxDeclares = ['clean=run', 'env=clean', 'fs=confined', 'ports=private', 'sandbox'];
		for (const name of ['agent', 'untrusted-code', 'hermetic-test']) {
			expect(sandboxDeclares).toEqual(expect.arrayContaining(ProfileCatalog.find(name)!));
		}
		expect(sandboxDeclares).not.toEqual(expect.arrayContaining(ProfileCatalog.find('inspect')!));
	});

	it('returns a copy: a caller cannot change the catalog', () => {
		ProfileCatalog.find('agent')!.push('ports=private');
		expect(ProfileCatalog.find('agent')).toHaveLength(2);
	});
});

describe('ProfileCatalog.expand', () => {
	it('returns the requirements of a known profile', () => {
		expect(ProfileCatalog.expand('agent', 'Flow "f"')).toEqual(['env=clean', 'fs=confined']);
	});

	it('an unknown name throws naming the place, the name and the known profiles', () => {
		expect(() => ProfileCatalog.expand('sandboxed', 'Step "s1"')).toThrow(
			/Step "s1".*unknown profile "sandboxed".*agent, hermetic-test, inspect, untrusted-code/s
		);
	});

	it('offers a did-you-mean for a near miss', () => {
		expect(() => ProfileCatalog.expand('agnt', 'Flow "f"')).toThrow(/Did you mean "agent"\?/);
		expect(() => ProfileCatalog.expand('untrusted_code', 'Flow "f"')).toThrow(/Did you mean "untrusted-code"\?/);
	});

	it('offers nothing for a name far from every profile', () => {
		expect(() => ProfileCatalog.expand('zzzzzzzz', 'Flow "f"')).not.toThrow(/Did you mean/);
	});

	it.each([[1], [['agent']], [null], [{}], [true]])('a non-string %j throws asking for one profile name', value => {
		expect(() => ProfileCatalog.expand(value, 'Flow "f"')).toThrow(/profile must be a single name/);
	});

	it('is case sensitive: "Agent" is unknown and suggests "agent"', () => {
		expect(() => ProfileCatalog.expand('Agent', 'Flow "f"')).toThrow(/Did you mean "agent"\?/);
	});
});

describe('ProfileCatalog.closest', () => {
	it('returns the near names only', () => {
		expect(ProfileCatalog.closest('inspct')).toEqual(['inspect']);
		expect(ProfileCatalog.closest('qqqqqqqq')).toEqual([]);
	});
});
