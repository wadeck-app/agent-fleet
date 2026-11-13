/**
 * With a launcher that runs processes somewhere else (a sandbox: `isolatesEnvironment`), the codex, opencode and
 * claude commands come ONLY from `launcher.lookupExecutable('which <tool>')`, whatever the host platform. node:fs
 * `existsSync` and node:child_process are made to throw: any host probe fails the test.
 * Plan: .claude/plans/2026-11-13_model-command-resolution.md
 */
import { mockPlatform } from 'test-utils/helpers';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FakeProcessLauncher, createFakeChild } from '../test-utils/FakeProcessLauncher';
import { ClaudeLauncher } from './ClaudeLauncher';
import { CodexModelProvider } from './CodexModelProvider';
import { resolveOpenCodeCommand } from './OpenCodeBinaryResolver';

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

const request = { workingDir: '/workspace', prompt: 'do something', stepId: 'step-1' };

describe.each(['win32', 'linux'] as const)(
	'model command resolution with a sandbox launcher, host platform %s',
	platform => {
		let restorePlatform: () => void;
		const originalMockPath = process.env['CODEX_MOCK_PATH'];

		beforeEach(() => {
			delete process.env['CODEX_MOCK_PATH'];
			restorePlatform = mockPlatform(platform);
		});

		afterEach(() => {
			restorePlatform();
			if (originalMockPath === undefined) delete process.env['CODEX_MOCK_PATH'];
			else process.env['CODEX_MOCK_PATH'] = originalMockPath;
			vi.restoreAllMocks();
		});

		function sandbox(): FakeProcessLauncher {
			return new FakeProcessLauncher({ isolatesEnvironment: true });
		}

		it('codex: spawns the answer of `which codex`, without a shell', async () => {
			const launcher = sandbox();
			launcher.lookups.set('which codex', '/vm/usr/bin/codex\n');
			const child = createFakeChild(1234);
			launcher.queueChild(child);

			const done = new CodexModelProvider(launcher).launchBackground(request);
			child.emit('exit', 0);
			await done;

			expect(launcher.callsOf('lookupExecutable')).toEqual([
				{ method: 'lookupExecutable', command: 'which codex' },
			]);
			const [call] = launcher.callsOf('spawn');
			expect(call!.command).toBe('/vm/usr/bin/codex');
			expect(call!.options.shell).toBe(false);
		});

		it('codex: a failed lookup fails with the launcher kind, the tool and what to do, and spawns nothing', async () => {
			const launcher = sandbox();

			await expect(new CodexModelProvider(launcher).launchBackground(request)).rejects.toThrow(
				/codex not found in the sandbox launcher.*which codex.*not found.*image/s
			);
			expect(launcher.callsOf('spawn')).toEqual([]);
		});

		it('codex: CODEX_MOCK_PATH still wins, without any lookup', async () => {
			const launcher = sandbox();
			const child = createFakeChild(1234);
			launcher.queueChild(child);

			const done = new CodexModelProvider(launcher).launchBackground({
				...request,
				env: { CODEX_MOCK_PATH: '/mock/codex' },
			});
			child.emit('exit', 0);
			await done;

			expect(launcher.callsOf('lookupExecutable')).toEqual([]);
			expect(launcher.callsOf('spawn')[0]!.command).toBe('/mock/codex');
		});

		it('opencode: uses the answer of `which opencode`, without a shell', () => {
			const launcher = sandbox();
			launcher.lookups.set('which opencode', '/vm/usr/bin/opencode');

			expect(resolveOpenCodeCommand({}, launcher)).toEqual({
				parts: ['/vm/usr/bin/opencode'],
				needsShell: false,
				isMock: false,
			});
			expect(launcher.callsOf('lookupExecutable')).toEqual([
				{ method: 'lookupExecutable', command: 'which opencode' },
			]);
		});

		it('opencode: a failed lookup fails with the launcher kind, the tool and what to do', () => {
			expect(() => resolveOpenCodeCommand({}, sandbox())).toThrow(
				/opencode not found in the sandbox launcher.*which opencode.*not found.*image/s
			);
		});

		it('opencode: OPENCODE_MOCK_PATH still wins, without any lookup', () => {
			const launcher = sandbox();

			expect(resolveOpenCodeCommand({ OPENCODE_MOCK_PATH: '/m/opencode' }, launcher).parts).toEqual([
				'/m/opencode',
			]);
			expect(launcher.callsOf('lookupExecutable')).toEqual([]);
		});

		it('claude: uses the answer of `which claude`', () => {
			const launcher = sandbox();
			launcher.lookups.set('which claude', '/vm/usr/bin/claude');

			expect(new ClaudeLauncher(launcher).findClaudePath({})).toBe('/vm/usr/bin/claude');
			expect(launcher.callsOf('lookupExecutable')).toEqual([
				{ method: 'lookupExecutable', command: 'which claude' },
			]);
		});

		it('claude: a failed lookup fails with the launcher kind, the tool and what to do, no bare-name fallback', () => {
			expect(() => new ClaudeLauncher(sandbox()).findClaudePath({})).toThrow(
				/claude not found in the sandbox launcher.*which claude.*not found.*image/s
			);
		});

		it('claude: CLAUDE_MOCK_PATH still wins, without any lookup', () => {
			const launcher = sandbox();

			expect(new ClaudeLauncher(launcher).findClaudePath({ CLAUDE_MOCK_PATH: '/m/claude' })).toBe('/m/claude');
			expect(launcher.callsOf('lookupExecutable')).toEqual([]);
		});
	}
);
