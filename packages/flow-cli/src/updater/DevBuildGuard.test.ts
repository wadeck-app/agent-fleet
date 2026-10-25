import { describe, expect, it, vi } from 'vitest';

import { devBuildRefusalMessage, isCalVer, scheduleBackgroundUpdateForRelease } from './DevBuildGuard';

describe('isCalVer', () => {
	it.each(['2026.10.25-020-6cb52900', '2026.01.01-001-0123abcd', '2026.12.31-1000-abcdef01', '2026.08.23-005-a1b2c3d4'])(
		'accepts the CI release version %s',
		version => {
			expect(isCalVer(version)).toBe(true);
		}
	);

	it.each([
		'0.0.0',
		'0.0.0-dev',
		'0.0.0-local',
		'0.1.0',
		'0.0.0-test-bundling',
		// the tsx fallback of cli/version.ts
		'2026.10.25-142530-1234-DEV',
		'2026.10.25-142530-1234-6cb52900',
		// build number under 3 digits
		'2026.10.25-20-6cb52900',
		// hash: wrong length, uppercase, non-hex
		'2026.10.25-020-6cb5290',
		'2026.10.25-020-6cb529000',
		'2026.10.25-020-6CB52900',
		'2026.10.25-020-6cb5290g',
		// month / day out of range
		'2026.13.01-020-6cb52900',
		'2026.00.01-020-6cb52900',
		'2026.10.00-020-6cb52900',
		'2026.10.32-020-6cb52900',
		// surrounding text
		' 2026.10.25-020-6cb52900',
		'2026.10.25-020-6cb52900\n',
		'v2026.10.25-020-6cb52900',
		'',
	])('rejects the non-release version %j', version => {
		expect(isCalVer(version)).toBe(false);
	});

	it('rejects undefined and null', () => {
		expect(isCalVer(undefined)).toBe(false);
		expect(isCalVer(null)).toBe(false);
	});
});

describe('devBuildRefusalMessage', () => {
	it('names the version, the binary and the command to use instead', () => {
		const message = devBuildRefusalMessage('flow', '0.0.0-dev');
		expect(message).toContain('0.0.0-dev');
		expect(message).toContain('refusing to update the global install of flow');
		expect(message).toContain('`flow cli update`');
	});
});

describe('scheduleBackgroundUpdateForRelease', () => {
	it('never spawns an updater for a dev build', () => {
		const scheduleBackgroundUpdate = vi.fn();
		expect(
			scheduleBackgroundUpdateForRelease({ scheduleBackgroundUpdate }, '/b/flow.cjs', 'flow-updater.cjs', '0.0.0-dev')
		).toBe(false);
		expect(scheduleBackgroundUpdate).not.toHaveBeenCalled();
	});

	it('schedules the updater for a CalVer release', () => {
		const scheduleBackgroundUpdate = vi.fn();
		expect(
			scheduleBackgroundUpdateForRelease(
				{ scheduleBackgroundUpdate },
				'/b/flow.cjs',
				'flow-updater.cjs',
				'2026.10.25-020-6cb52900'
			)
		).toBe(true);
		expect(scheduleBackgroundUpdate).toHaveBeenCalledWith('/b/flow.cjs', 'flow-updater.cjs');
	});
});
