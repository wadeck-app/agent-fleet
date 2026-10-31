/**
 * OpenCodeFlagProbe asks the resolved opencode binary what `run` accepts before a step starts, so an
 * older install fails the step with the cause instead of dying on a usage screen.
 */
import type { ChildProcess } from 'node:child_process';
import type { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import { OpenCodeFlagProbe } from './OpenCodeFlagProbe';

const HELP_WITH_AUTO = 'opencode run [message..]\n  --format  json\n  --auto  auto-approve permissions\n  -m, --model';
const HELP_WITHOUT_AUTO = 'opencode run [message..]\n  --format  json\n  -m, --model';
const resolved = { parts: ['C:/bin/opencode.exe'], needsShell: false, isMock: false };
const needAuto = [{ flag: '--auto', neededFor: 'skipPermissions: true (auto-approval of tool permissions)' }];

/** A child that, once its `close` listener is attached, runs `act` on the next tick. */
function scriptedChild(act: (child: ChildProcess) => void): ChildProcess {
	const child = createFakeChild();
	const on = child.on.bind(child);
	child.on = ((event: string, listener: (...args: unknown[]) => void) => {
		on(event, listener);
		if (event === 'close') setImmediate(() => act(child));
		return child;
	}) as typeof child.on;
	return child;
}

/** Prints `stdout` / `stderr` then closes with `code`. */
function printing(stdout: string, code = 0, stderr = ''): ChildProcess {
	return scriptedChild(child => {
		if (stdout) (child.stdout as unknown as EventEmitter).emit('data', Buffer.from(stdout));
		if (stderr) (child.stderr as unknown as EventEmitter).emit('data', Buffer.from(stderr));
		child.emit('close', code);
	});
}

function failingToStart(): ChildProcess {
	return scriptedChild(child => child.emit('error', new Error('spawn ENOENT')));
}

async function failureOf(promise: Promise<void>): Promise<Error> {
	try {
		await promise;
	} catch (error) {
		return error as Error;
	}
	throw new Error('expected the probe to fail');
}

describe('OpenCodeFlagProbe', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('passes when the help lists every required flag, asking `run --help` once', async () => {
		const fake = new FakeProcessLauncher();
		fake.queueChild(printing(HELP_WITH_AUTO));

		await new OpenCodeFlagProbe(fake).assertSupports(resolved, needAuto, {});

		expect(fake.callsOf('spawn').map(c => [c.command, c.args])).toEqual([
			['C:/bin/opencode.exe', ['run', '--help']],
		]);
	});

	it('reads the help from stderr too', async () => {
		const fake = new FakeProcessLauncher();
		fake.queueChild(printing('', 0, HELP_WITH_AUTO));

		await new OpenCodeFlagProbe(fake).assertSupports(resolved, needAuto, {});
	});

	it('does not accept a flag that is only the prefix of another one', async () => {
		const fake = new FakeProcessLauncher();
		fake.queueChild(printing('  --auto-approve  something'));
		fake.queueChild(printing('1.0.168'));

		const error = await failureOf(new OpenCodeFlagProbe(fake).assertSupports(resolved, needAuto, {}));

		expect(error.message).toContain('--auto');
	});

	it('fails before any run, naming version, path, flag, purpose and remedy, when a flag is missing', async () => {
		const fake = new FakeProcessLauncher();
		fake.queueChild(printing(HELP_WITHOUT_AUTO));
		fake.queueChild(printing('1.0.168\n'));
		fake.lookups.set(
			'where.exe opencode* 2>nul',
			'C:\\App\\nodejs\\opencode.cmd\r\nC:\\ProgramData\\chocolatey\\bin\\opencode.exe'
		);
		vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

		const error = await failureOf(new OpenCodeFlagProbe(fake).assertSupports(resolved, needAuto, {}));

		expect(error.message).toContain('C:/bin/opencode.exe');
		expect(error.message).toContain('1.0.168');
		expect(error.message).toContain('--auto');
		expect(error.message).toContain('skipPermissions');
		expect(error.message).toContain('npm i -g opencode-ai@latest');
		expect(error.message).toContain('C:\\ProgramData\\chocolatey\\bin\\opencode.exe');
		expect(fake.callsOf('spawn').map(c => c.args)).toEqual([['run', '--help'], ['--version']]);
	});

	it('does not mention other installs when only one is on PATH', async () => {
		const fake = new FakeProcessLauncher();
		fake.queueChild(printing(HELP_WITHOUT_AUTO));
		fake.queueChild(printing('1.0.168'));
		fake.lookups.set('where.exe opencode* 2>nul', 'C:\\App\\nodejs\\opencode.cmd');
		vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

		const error = await failureOf(new OpenCodeFlagProbe(fake).assertSupports(resolved, needAuto, {}));

		expect(error.message).not.toContain('Several');
	});

	it('fails loudly when the help cannot be read (non-zero exit, no output)', async () => {
		const fake = new FakeProcessLauncher();
		fake.queueChild(printing('', 1));
		fake.queueChild(printing('', 1));

		const error = await failureOf(new OpenCodeFlagProbe(fake).assertSupports(resolved, needAuto, {}));

		expect(error.message).toContain('could not read');
		expect(error.message).toContain('C:/bin/opencode.exe');
		expect(error.message).toContain('run --help');
	});

	it('fails loudly, with the system reason, when the binary cannot be started', async () => {
		const fake = new FakeProcessLauncher();
		fake.queueChild(failingToStart());
		fake.queueChild(failingToStart());

		const error = await failureOf(new OpenCodeFlagProbe(fake).assertSupports(resolved, needAuto, {}));

		expect(error.message).toContain('spawn ENOENT');
	});

	it('probes a binary path once, then answers later checks from memory', async () => {
		const fake = new FakeProcessLauncher();
		fake.queueChild(printing(HELP_WITH_AUTO));
		const probe = new OpenCodeFlagProbe(fake);

		await probe.assertSupports(resolved, needAuto, {});
		await probe.assertSupports(resolved, needAuto, {});

		expect(fake.callsOf('spawn')).toHaveLength(1);
	});

	it('probes again for another binary path', async () => {
		const fake = new FakeProcessLauncher();
		fake.queueChild(printing(HELP_WITH_AUTO));
		fake.queueChild(printing(HELP_WITH_AUTO));
		const probe = new OpenCodeFlagProbe(fake);

		await probe.assertSupports(resolved, needAuto, {});
		await probe.assertSupports({ ...resolved, parts: ['D:/other/opencode.exe'] }, needAuto, {});

		expect(fake.callsOf('spawn')).toHaveLength(2);
	});

	it('does not remember a failed read: the next step probes again', async () => {
		const fake = new FakeProcessLauncher();
		fake.queueChild(printing('', 1));
		fake.queueChild(printing('', 1));
		fake.queueChild(printing(HELP_WITH_AUTO));
		const probe = new OpenCodeFlagProbe(fake);

		await expect(probe.assertSupports(resolved, needAuto, {})).rejects.toThrow('could not read');
		await probe.assertSupports(resolved, needAuto, {});
	});

	it('spawns nothing when no flag is required', async () => {
		const fake = new FakeProcessLauncher();

		await new OpenCodeFlagProbe(fake).assertSupports(resolved, [], {});

		expect(fake.calls).toEqual([]);
	});

	it('spawns nothing for a mock binary', async () => {
		const fake = new FakeProcessLauncher();

		await new OpenCodeFlagProbe(fake).assertSupports({ ...resolved, isMock: true }, needAuto, {});

		expect(fake.calls).toEqual([]);
	});
});
