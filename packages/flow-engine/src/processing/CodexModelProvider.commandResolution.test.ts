/**
 * Characterization of the host command resolution of CodexModelProvider (default launcher, not isolating): what is
 * spawned when the lookup answers and when it fails, on both platforms. Pinned before the sandbox-launcher change
 * (.claude/plans/2026-11-13_model-command-resolution.md) so the host behaviour provably stays the same.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import { CodexModelProvider } from './CodexModelProvider';

const request = { workingDir: '/workspace', prompt: 'do something', stepId: 'step-1' };

async function spawnedCommand(
	fake: FakeProcessLauncher
): Promise<{ command: string; args: readonly string[]; shell: boolean }> {
	const child = createFakeChild(1234);
	fake.queueChild(child);
	const done = new CodexModelProvider(fake).launchBackground(request);
	child.emit('exit', 0);
	await done;
	const [call] = fake.callsOf('spawn');
	return { command: call!.command, args: call!.args ?? [], shell: call!.options.shell === true };
}

describe('CodexModelProvider host command resolution (default launcher)', () => {
	const originalMockPath = process.env['CODEX_MOCK_PATH'];

	beforeEach(() => {
		delete process.env['CODEX_MOCK_PATH'];
	});

	afterEach(() => {
		if (originalMockPath === undefined) delete process.env['CODEX_MOCK_PATH'];
		else process.env['CODEX_MOCK_PATH'] = originalMockPath;
		vi.restoreAllMocks();
	});

	it('on Windows spawns node + the codex.js found next to codex.cmd, without a shell', async () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-resolution-'));
		try {
			const codexJs = path.join(dir, 'node_modules', '@openai', 'codex', 'bin', 'codex.js');
			fs.mkdirSync(path.dirname(codexJs), { recursive: true });
			fs.writeFileSync(codexJs, '');
			const fake = new FakeProcessLauncher();
			fake.lookups.set('where.exe codex.cmd 2>nul', `${path.join(dir, 'codex.cmd')}\r\nC:\\other\\codex.cmd`);

			const spawned = await spawnedCommand(fake);

			expect(spawned.command).toBe(process.execPath);
			expect(spawned.args[0]).toBe(codexJs);
			expect(spawned.shell).toBe(false);
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it('on Windows falls back to the bare name through a shell when codex.js is not found', async () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

		const spawned = await spawnedCommand(new FakeProcessLauncher());

		expect(spawned.command).toBe('codex');
		expect(spawned.shell).toBe(true);
	});

	it('on POSIX spawns the answer of `which codex`', async () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
		const fake = new FakeProcessLauncher();
		fake.lookups.set('which codex', '/usr/local/bin/codex');

		const spawned = await spawnedCommand(fake);

		expect(spawned.command).toBe('/usr/local/bin/codex');
		expect(spawned.shell).toBe(false);
	});

	it('on POSIX falls back to the bare name, without a shell, when the lookup fails', async () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

		const spawned = await spawnedCommand(new FakeProcessLauncher());

		expect(spawned.command).toBe('codex');
		expect(spawned.shell).toBe(false);
	});
});
