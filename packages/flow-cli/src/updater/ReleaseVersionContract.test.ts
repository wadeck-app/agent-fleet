import { isReleaseVersion } from '@wadeck-app/shared-cli/ReleaseVersion';
import { describe, expect, it } from 'vitest';

// Pins the shared-cli >= 2026.10.25-044 requirement: 043 treated registry versions with an unpadded
// month/day (npm strips leading zeros from CalVer segments) as dev builds, so a real release refused to update.
describe('shared-cli isReleaseVersion contract', () => {
	it.each(['2026.9.1-028-abcdef12', '2026.10.3-035-1e4adce3', '2026.10.25-044-51609e11', '2026.09.01-028-abcdef12'])(
		'accepts the release version %s',
		version => {
			expect(isReleaseVersion(version)).toBe(true);
		}
	);

	it.each(['0.0.0-dev', '0.0.0-test-bundling', '2026.10.25-142530-1234-DEV', ''])(
		'rejects the dev version %j',
		version => {
			expect(isReleaseVersion(version)).toBe(false);
		}
	);
});
