/**
 * The provider checks, before spawning `opencode run`, that the resolved binary lists the flags it is
 * about to send. The binary is a real path here (OPENCODE_MOCK_PATH unset), the launcher is a fake.
 */
import type { ChildProcess } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import { OpenCodeModelProvider } from './OpenCodeModelProvider';

const request = { workingDir: '/workspace', prompt: 'do something', stepId: 'step-1' };

function printing(stdout: string): ChildProcess {
	const child = createFakeChild();
	const on = child.on.bind(child);
	child.on = ((event: string, listener: (...args: unknown[]) => void) => {
		on(event, listener);
		if (event === 'close') {
			setImmediate(() => {
				(child.stdout as unknown as EventEmitter).emit('data', Buffer.from(stdout));
				child.emit('close', 0);
			});
		}
		return child;
	}) as typeof child.on;
	return child;
}

describe('OpenCodeModelProvider -- flag probe before the run', () => {
	const originalMockPath = process.env['OPENCODE_MOCK_PATH'];
	let fake: FakeProcessLauncher;

	beforeEach(() => {
		delete process.env['OPENCODE_MOCK_PATH'];
		vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
		fake = new FakeProcessLauncher();
		fake.lookups.set('which opencode', '/usr/bin/opencode');
	});

	afterEach(() => {
		if (originalMockPath !== undefined) process.env['OPENCODE_MOCK_PATH'] = originalMockPath;
		vi.restoreAllMocks();
	});

	async function runWith(provider: OpenCodeModelProvider, skipPermissions: boolean | undefined): Promise<void> {
		const runChild = createFakeChild(4242);
		fake.queueChild(runChild);
		const done = provider.launchBackground({ ...request, skipPermissions });
		// The probe awaits before the run is spawned: let it happen
		await vi.waitFor(() => expect(fake.callsOf('spawn').some(c => c.args?.[1] === request.prompt)).toBe(true));
		runChild.emit('exit', 0);
		await done;
	}

	it('fails the step before spawning the run when the binary lacks --auto', async () => {
		fake.queueChild(printing('opencode run\n  --format json'));
		fake.queueChild(printing('1.0.168'));
		const provider = new OpenCodeModelProvider({ processLauncher: fake });

		await expect(provider.launchBackground({ ...request, skipPermissions: true })).rejects.toThrow(
			/--auto[\s\S]*skipPermissions[\s\S]*1\.0\.168|1\.0\.168[\s\S]*\/usr\/bin\/opencode/
		);

		expect(fake.callsOf('spawn').map(c => c.args)).toEqual([['run', '--help'], ['--version']]);
	});

	it('runs normally when the binary lists --auto, probing once across several steps', async () => {
		fake.queueChild(printing('opencode run\n  --format json\n  --auto'));
		const provider = new OpenCodeModelProvider({ processLauncher: fake });

		await runWith(provider, true);
		await runWith(provider, true);

		const spawns = fake.callsOf('spawn').map(c => c.args);
		expect(spawns.filter(args => args?.[1] === '--help')).toHaveLength(1);
		expect(spawns.filter(args => args?.includes('--auto'))).toHaveLength(2);
	});

	it('does not probe when skipPermissions is not true', async () => {
		const provider = new OpenCodeModelProvider({ processLauncher: fake });

		await runWith(provider, false);

		expect(fake.callsOf('spawn').map(c => c.args?.[1])).not.toContain('--help');
	});

	it('does not probe a mock binary even with skipPermissions', async () => {
		process.env['OPENCODE_MOCK_PATH'] = '/mock/opencode';
		const provider = new OpenCodeModelProvider({ processLauncher: fake });

		await runWith(provider, true);

		expect(fake.callsOf('spawn').map(c => c.args?.[1])).not.toContain('--help');
	});

	it('fails the step when the help cannot be read', async () => {
		const silent = createFakeChild();
		const on = silent.on.bind(silent);
		silent.on = ((event: string, listener: (...args: unknown[]) => void) => {
			on(event, listener);
			if (event === 'close') setImmediate(() => silent.emit('close', 1));
			return silent;
		}) as typeof silent.on;
		fake.queueChild(silent);
		fake.queueChild(printing(''));
		const provider = new OpenCodeModelProvider({ processLauncher: fake });

		await expect(provider.launchBackground({ ...request, skipPermissions: true })).rejects.toThrow(
			'could not read'
		);
	});
});
