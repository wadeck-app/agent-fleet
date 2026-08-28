import { VersionValidation } from '@wadeck-app/shared-cli/VersionValidation';

describe('VersionValidation', () => {
	describe('VERSION_RE', () => {
		it.each(['1.0.0', '2.3.4'])('matches valid semver: %s', v => {
			expect(VersionValidation.VERSION_RE.test(v)).toBe(true);
		});

		it.each(['1.0.0-alpha.1', '2026.08.20-319-abc1234'])('matches pre-release: %s', v => {
			expect(VersionValidation.VERSION_RE.test(v)).toBe(true);
		});

		it('matches build metadata: 1.0.0+build.1', () => {
			expect(VersionValidation.VERSION_RE.test('1.0.0+build.1')).toBe(true);
		});

		it.each(['', 'abc', '1.0', '1.0.0.0', 'v1.0.0', '1.0.0 ', '../etc'])('rejects invalid version: %s', v => {
			expect(VersionValidation.VERSION_RE.test(v)).toBe(false);
		});
	});

	describe('validate', () => {
		it('returns the version string on success', () => {
			expect(VersionValidation.validate('1.2.3')).toBe('1.2.3');
		});

		it('returns pre-release version string on success', () => {
			expect(VersionValidation.validate('2026.08.20-319-abc1234')).toBe('2026.08.20-319-abc1234');
		});

		it.each(['', 'abc', '1.0', 'v1.0.0'])('throws with message "Invalid version string: ..." for: %s', v => {
			expect(() => VersionValidation.validate(v)).toThrow(`Invalid version string: "${v}"`);
		});
	});
});
