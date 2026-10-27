/**
 * ScriptExecutor starts and ends processes only through the injected ProcessLauncher (C4 seam).
 * Real child_process functions throw, so a direct use fails the test.
 */
import type { ChildProcess } from 'node:child_process';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import { findDirectProcessApiUses } from '../test-utils/assertNoDirectProcessApi';
import { ScriptExecutor } from './ScriptExecutor';
import { BashShellStrategy } from './shell/BashShellStrategy';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	const forbidden = (): never => {
		throw new Error('direct child_process use bypasses the ProcessLauncher seam');
	};
	return { ...actual, spawn: forbidden, spawnSync: forbidden, execSync: forbidden };
});

describe('ScriptExecutor -- ProcessLauncher seam', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	function launcherWithChild(): { launcher: FakeProcessLauncher; child: ChildProcess } {
		const launcher = new FakeProcessLauncher();
		const child = createFakeChild(555);
		launcher.queueChild(child);
		return { launcher, child };
	}

	it('has no direct child_process or ProcessTreeKiller import', () => {
		expect(findDirectProcessApiUses(path.join(__dirname, 'ScriptExecutor.ts'))).toEqual([]);
	});

	it('the generic path spawns through the launcher', async () => {
		const { launcher, child } = launcherWithChild();

		const done = new ScriptExecutor(launcher).execute({ script: 'echo hi', shell: true, workingDir: '/work' });
		child.emit('close', 0);
		const result = await done;

		expect(result.success).toBe(true);
		const [spawnCall] = launcher.callsOf('spawn');
		expect(launcher.calls).toHaveLength(1);
		expect(spawnCall?.command).toBe('echo hi');
		expect(spawnCall?.options.cwd).toBe('/work');
	});

	it('the explicit shell kind path spawns the resolved binary through the launcher', async () => {
		vi.spyOn(BashShellStrategy.prototype, 'resolve').mockReturnValue('/resolved/bash');
		const { launcher, child } = launcherWithChild();

		const done = new ScriptExecutor(launcher).execute({ script: 'echo hi', shellKind: 'bash' });
		child.emit('close', 0);
		await done;

		expect(launcher.callsOf('spawn').map(call => call.command)).toEqual(['/resolved/bash']);
	});

	it('a timeout kills the tree through the same launcher', async () => {
		const { launcher, child } = launcherWithChild();

		const done = new ScriptExecutor(launcher).execute({ script: 'sleep 9', shell: true, timeout: 20 });
		await vi.waitFor(() => expect(launcher.callsOf('killTree')).toHaveLength(1));
		child.emit('close', null);
		const result = await done;

		expect(result.success).toBe(false);
		expect(launcher.callsOf('killTree')[0]).toEqual({ method: 'killTree', pid: 555, signal: 'SIGTERM' });
		expect(launcher.callsOf('snapshotDescendants')).toHaveLength(1);
	});
});
