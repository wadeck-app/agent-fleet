/**
 * resolveOpenCodeCommand is the single place that decides which opencode binary a step runs, shared by
 * the provider and by the flag contract test so both always look at the same install.
 */
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { FakeProcessLauncher } from '../test-utils/FakeProcessLauncher';
import { resolveOpenCodeCommand } from './OpenCodeBinaryResolver';

describe('resolveOpenCodeCommand', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('OPENCODE_MOCK_PATH ending in .mjs runs through node, without a shell', () => {
		const fake = new FakeProcessLauncher();

		expect(resolveOpenCodeCommand({ OPENCODE_MOCK_PATH: '/m/mock.mjs' }, fake)).toEqual({
			parts: ['node', '/m/mock.mjs'],
			needsShell: false,
			isMock: true,
		});
		expect(fake.calls).toEqual([]);
	});

	it('OPENCODE_MOCK_PATH of another kind is the command itself', () => {
		expect(resolveOpenCodeCommand({ OPENCODE_MOCK_PATH: '/m/opencode' }, new FakeProcessLauncher())).toEqual({
			parts: ['/m/opencode'],
			needsShell: false,
			isMock: true,
		});
	});

	it('on POSIX uses the answer of `which opencode`', () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
		const fake = new FakeProcessLauncher();
		fake.lookups.set('which opencode', '/usr/bin/opencode');

		expect(resolveOpenCodeCommand({}, fake)).toEqual({
			parts: ['/usr/bin/opencode'],
			needsShell: false,
			isMock: false,
		});
	});

	it('on POSIX falls back to the bare name when the lookup fails', () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');

		expect(resolveOpenCodeCommand({}, new FakeProcessLauncher())).toEqual({
			parts: ['opencode'],
			needsShell: false,
			isMock: false,
		});
	});

	it('on Windows prefers the opencode.exe next to the npm shim', () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opencode-resolver-'));
		try {
			const exe = path.join(dir, 'node_modules', 'opencode-ai', 'bin', 'opencode.exe');
			fs.mkdirSync(path.dirname(exe), { recursive: true });
			fs.writeFileSync(exe, '');
			const fake = new FakeProcessLauncher();
			fake.lookups.set(
				'where.exe opencode.cmd 2>nul',
				`${path.join(dir, 'opencode.cmd')}\r\nC:\\other\\opencode.cmd`
			);

			expect(resolveOpenCodeCommand({}, fake)).toEqual({ parts: [exe], needsShell: false, isMock: false });
		} finally {
			fs.rmSync(dir, { recursive: true, force: true });
		}
	});

	it('on Windows falls back to a shell when no exe is found', () => {
		vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');

		expect(resolveOpenCodeCommand({}, new FakeProcessLauncher())).toEqual({
			parts: ['opencode'],
			needsShell: true,
			isMock: false,
		});
	});
});
