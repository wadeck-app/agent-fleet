/**
 * The bash and pwsh strategies resolve their binary through the injected ProcessLauncher, never on the host, when the
 * launcher runs the script somewhere else (a sandbox). node:child_process and node:fs are made to throw: any host
 * lookup fails the test.
 */
import { mockPlatform } from 'test-utils/helpers';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeProcessLauncher } from '../../test-utils/FakeProcessLauncher';
import { BashShellStrategy } from './BashShellStrategy';
import { PwshShellStrategy } from './PwshShellStrategy';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	const forbidden = (): never => {
		throw new Error('direct child_process use bypasses the ProcessLauncher seam');
	};
	return { ...actual, spawn: forbidden, spawnSync: forbidden, execSync: forbidden };
});
vi.mock('node:fs', async importOriginal => {
	const actual = await importOriginal<typeof import('node:fs')>();
	const forbidden = (): never => {
		throw new Error('host filesystem probe: the sandbox launcher must answer instead');
	};
	return { ...actual, existsSync: forbidden };
});

describe.each(['win32', 'linux'] as const)('shell strategies with a sandbox launcher, host platform %s', platform => {
	let restorePlatform: () => void;

	afterEach(() => {
		restorePlatform?.();
	});

	function sandbox(): FakeProcessLauncher {
		restorePlatform = mockPlatform(platform);
		return new FakeProcessLauncher({ isolatesEnvironment: true });
	}

	it('bash: uses the path the launcher answers, as is, without touching the host', () => {
		const launcher = sandbox();
		launcher.lookups.set('which bash', '/vm/usr/bin/bash\n');

		expect(new BashShellStrategy(launcher).resolve({ FLOW_BASH_PATH: 'C:\\host\\bash.exe' })).toBe(
			'/vm/usr/bin/bash'
		);
		expect(launcher.callsOf('lookupExecutable')).toEqual([{ method: 'lookupExecutable', command: 'which bash' }]);
	});

	it('pwsh: uses the path the launcher answers, as is, without touching the host', () => {
		const launcher = sandbox();
		launcher.lookups.set('which pwsh', '/vm/opt/pwsh');

		expect(new PwshShellStrategy(launcher).resolve({})).toBe('/vm/opt/pwsh');
		expect(launcher.callsOf('lookupExecutable')).toEqual([{ method: 'lookupExecutable', command: 'which pwsh' }]);
	});

	it('bash: a launcher that cannot find it fails with the launcher kind, the shell and what to do', () => {
		const launcher = sandbox();

		expect(() => new BashShellStrategy(launcher).resolve({})).toThrow(
			/bash not found in the sandbox launcher.*which bash.*not found.*image/s
		);
	});

	it('pwsh: a launcher that cannot find it fails with the launcher kind, the shell and what to do', () => {
		const launcher = sandbox();

		expect(() => new PwshShellStrategy(launcher).resolve({})).toThrow(
			/pwsh not found in the sandbox launcher.*which pwsh.*not found.*image/s
		);
	});

	it('an empty answer from the launcher is "not found", not an empty executable', () => {
		const launcher = sandbox();
		launcher.lookups.set('which bash', '  \n');

		expect(() => new BashShellStrategy(launcher).resolve({})).toThrow(/bash not found in the sandbox launcher/);
	});
});

describe('shell strategies with a non-isolating launcher on a POSIX host', () => {
	it('bash: the lookup goes through the launcher', () => {
		const restore = mockPlatform('linux');
		try {
			const launcher = new FakeProcessLauncher();
			launcher.lookups.set('which bash', '/fake/bash');

			expect(new BashShellStrategy(launcher).resolve({})).toBe('/fake/bash');
		} finally {
			restore();
		}
	});

	it('pwsh on Windows: where.exe goes through the launcher and the first line wins', () => {
		const restore = mockPlatform('win32');
		try {
			const launcher = new FakeProcessLauncher();
			launcher.lookups.set('where.exe pwsh.exe 2>nul', 'D:\\p\\pwsh.exe\r\nD:\\q\\pwsh.exe\r\n');

			expect(new PwshShellStrategy(launcher).resolve({})).toBe('D:\\p\\pwsh.exe');
		} finally {
			restore();
		}
	});
});
