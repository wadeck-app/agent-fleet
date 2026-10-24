import { describe, expect, it } from 'vitest';

import { compareSemanticVersions, highestSemanticVersion, isSemanticVersion } from './SemanticVersion.js';

describe('isSemanticVersion', () => {
	it.each(['0.0.0', '1.2.3', '10.20.30', '1.0.0-alpha', '1.0.0-alpha.1', '1.0.0-0.3.7', '1.0.0-x-y-z.--'])(
		'accepts %s',
		version => {
			expect(isSemanticVersion(version)).toBe(true);
		}
	);

	it.each([
		'',
		'1',
		'1.0',
		'01.0.0',
		'1.0.0.0',
		'v1.0.0',
		'1.0.0-',
		'1.0.0-01',
		'1.0.0+build',
		' 1.0.0',
		'1.0.0-a..b',
	])('rejects %j', version => {
		expect(isSemanticVersion(version)).toBe(false);
	});
});

describe('compareSemanticVersions', () => {
	it('orders numerically, not lexically', () => {
		expect(compareSemanticVersions('1.10.0', '1.9.0')).toBeGreaterThan(0);
		expect(compareSemanticVersions('2.0.0', '10.0.0')).toBeLessThan(0);
		expect(compareSemanticVersions('1.2.3', '1.2.3')).toBe(0);
	});

	it('follows the semver 2.0.0 prerelease precedence chain', () => {
		const ascending = [
			'1.0.0-alpha',
			'1.0.0-alpha.1',
			'1.0.0-alpha.beta',
			'1.0.0-beta',
			'1.0.0-beta.2',
			'1.0.0-beta.11',
			'1.0.0-rc.1',
			'1.0.0',
		];
		for (let i = 1; i < ascending.length; i++) {
			expect(compareSemanticVersions(ascending[i - 1]!, ascending[i]!)).toBeLessThan(0);
			expect(compareSemanticVersions(ascending[i]!, ascending[i - 1]!)).toBeGreaterThan(0);
		}
	});

	it('refuses an invalid version with an actionable message', () => {
		expect(() => compareSemanticVersions('1.0', '1.0.0')).toThrow(
			/'1\.0' is not a valid semantic version.*MAJOR\.MINOR\.PATCH/
		);
	});
});

describe('highestSemanticVersion', () => {
	it('picks the highest, prerelease below its release', () => {
		expect(highestSemanticVersion(['1.0.0', '1.10.0', '1.9.0', '2.0.0-rc.1'])).toBe('2.0.0-rc.1');
		expect(highestSemanticVersion(['2.0.0-rc.1', '2.0.0'])).toBe('2.0.0');
	});

	it('returns undefined for an empty list', () => {
		expect(highestSemanticVersion([])).toBeUndefined();
	});
});
