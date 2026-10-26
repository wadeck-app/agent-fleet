/**
 * Characterization of OpenCodeModelProvider's process calls: the exact options of both `spawn` sites, the
 * environment isolation, what `kill()` does and the `where.exe`/`which` binary lookup.
 *
 * Pins today's behaviour so that routing these calls through a process-launcher seam (plan
 * .claude/plans/2026-10-25_docker-sandbox-worker.md, C4) is provably behavior-preserving. Notably,
 * `kill()` ends the whole opencode process tree (ProcessTreeKiller, like ClaudeLauncher) and the background spawn sets
 * `windowsHide: true` while the interactive one must not (console inheritance, d032e7e).
 * Coordination: the managed-serve plan (.claude/plans/2026-10-04_01-25_opencode-managed-serve-lifecycle.md)
 * will add a second spawn (`opencode serve`) in this class; extend this file when it lands.
 */
import * as child_process from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { LaunchOptions } from './ModelProvider';
import { OpenCodeModelProvider } from './OpenCodeModelProvider';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: vi.fn(), spawnSync: vi.fn(), execSync: vi.fn() };
});
vi.mock('node:fs', async () => {
	const actual = await vi.importActual<typeof import('node:fs')>('node:fs');
	return { ...actual, writeFileSync: vi.fn(), chmodSync: vi.fn(), unlinkSync: vi.fn() };
});

const SECRET_NAME = 'FLOW_C4_CHARACTERIZATION_SECRET';

interface MockChild extends EventEmitter {
	pid: number;
	kill: ReturnType<typeof vi.fn>;
	stdin: { write: ReturnType<typeof vi.fn>; end: ReturnType<typeof vi.fn> };
	stdout: EventEmitter;
	stderr: EventEmitter;
}

function makeChild(): MockChild {
	const child = new EventEmitter() as MockChild;
	child.pid = 5678;
	child.kill = vi.fn();
	child.stdin = { write: vi.fn(), end: vi.fn() };
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	return child;
}

function baseOptions(overrides: Partial<LaunchOptions> = {}): LaunchOptions {
	return { workingDir: '/workspace', prompt: 'do something', stepId: 'step-1', ...overrides };
}

function spawnCall(): { command: string; args: string[]; options: Record<string, unknown> } {
	expect(child_process.spawn).toHaveBeenCalledOnce();
	const [command, args, options] = vi.mocked(child_process.spawn).mock.calls[0] as unknown as [
		string,
		string[],
		Record<string, unknown>,
	];
	return { command, args, options };
}

describe('OpenCodeModelProvider -- process call contract', () => {
	let provider: OpenCodeModelProvider;
	let child: MockChild;
	const originalMockPath = process.env['OPENCODE_MOCK_PATH'];

	beforeEach(() => {
		vi.clearAllMocks();
		process.env[SECRET_NAME] = 'leak-me';
		process.env['OPENCODE_MOCK_PATH'] = '/mock/opencode';
		provider = new OpenCodeModelProvider();
		child = makeChild();
		vi.mocked(child_process.spawn).mockReturnValue(child as unknown as child_process.ChildProcess);
	});

	afterEach(() => {
		delete process.env[SECRET_NAME];
		if (originalMockPath === undefined) delete process.env['OPENCODE_MOCK_PATH'];
		else process.env['OPENCODE_MOCK_PATH'] = originalMockPath;
		vi.restoreAllMocks();
	});

	describe('launchBackground', () => {
		async function launch(overrides: Partial<LaunchOptions> = {}): Promise<void> {
			const promise = provider.launchBackground(baseOptions(overrides));
			child.emit('exit', 0);
			await promise;
		}

		it('spawns with exactly cwd, stdio [ignore, pipe, pipe], shell, windowsHide:true and env', async () => {
			await launch();

			const { command, args, options } = spawnCall();
			expect(command).toBe('/mock/opencode');
			expect(args.slice(0, 2)).toEqual(['run', 'do something']);
			expect(Object.keys(options).sort()).toEqual(['cwd', 'env', 'shell', 'stdio', 'windowsHide']);
			expect(options['cwd']).toBe('/workspace');
			expect(options['stdio']).toEqual(['ignore', 'pipe', 'pipe']);
			expect(options['windowsHide']).toBe(true);
			expect(options['shell']).toBe(false);
		});

		it('isolates the environment and gives the process its own XDG_CONFIG_HOME under the temp dir', async () => {
			await launch({ env: { STEP_VAR: 'v' } });

			const env = spawnCall().options['env'] as Record<string, string>;
			expect(env['STEP_VAR']).toBe('v');
			expect(env[SECRET_NAME]).toBeUndefined();
			expect(env['PATH'] ?? env['Path']).toBeDefined();
			expect(env['XDG_CONFIG_HOME']).toMatch(/opencode-run-/);
			expect(path.dirname(env['XDG_CONFIG_HOME']!)).toBe(os.tmpdir());
			// Consumed by copyGlobalConfig; the CLI itself must not re-read it.
			expect(env['OPENCODE_CONFIG']).toBeUndefined();
			expect(Object.values(env).every(value => typeof value === 'string')).toBe(true);
		});

		it('hands the process to onProcessStarted', async () => {
			const onProcessStarted = vi.fn();
			await launch({ onProcessStarted });
			expect(onProcessStarted).toHaveBeenCalledWith(child);
		});

		it('settles on `exit`, not `close` (the opencode backend keeps the pipes open)', async () => {
			const promise = provider.launchBackground(baseOptions());
			child.emit('exit', 3);
			await expect(promise).resolves.toMatchObject({ exitCode: 3 });
		});

		it('kill() while running ends the whole process tree with taskkill /T /F on Windows, not child.kill()', async () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
			vi.mocked(child_process.spawnSync).mockReturnValue({
				status: 0,
				stdout: '',
				stderr: '',
			} as unknown as ReturnType<typeof child_process.spawnSync>);
			const promise = provider.launchBackground(baseOptions());
			provider.kill();
			expect(child_process.spawnSync).toHaveBeenCalledOnce();
			expect(child_process.spawnSync).toHaveBeenCalledWith('taskkill', ['/PID', '5678', '/T', '/F'], {
				encoding: 'utf8',
				windowsHide: true,
			});
			expect(child.kill).not.toHaveBeenCalled();

			child.emit('exit', 0);
			await promise;
		});

		it('kill() while running SIGKILLs the process and its descendants on POSIX, not child.kill()', async () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
			// pgrep: 5678 has the child 9001, which has none.
			vi.mocked(child_process.spawnSync).mockImplementation(((_command: string, args: string[]) => ({
				status: 0,
				stdout: args[1] === '5678' ? '9001\n' : '',
				stderr: '',
			})) as unknown as typeof child_process.spawnSync);
			const processKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
			const promise = provider.launchBackground(baseOptions());
			provider.kill();
			expect(processKill.mock.calls).toEqual([
				[9001, 'SIGKILL'],
				[5678, 'SIGKILL'],
			]);
			expect(child.kill).not.toHaveBeenCalled();

			child.emit('exit', 0);
			await promise;
		});

		it('does not call child.kill() after a normal exit', async () => {
			await launch();
			expect(child.kill).not.toHaveBeenCalled();
		});

		it('a spawn error rejects the launch', async () => {
			const promise = provider.launchBackground(baseOptions());
			child.emit('error', new Error('ENOENT'));
			await expect(promise).rejects.toThrow('ENOENT');
		});
	});

	describe('launchInteractive', () => {
		it('spawns with exactly cwd, stdio:inherit, shell and env -- and no windowsHide', async () => {
			const promise = provider.launchInteractive(baseOptions());
			child.emit('exit', 0);
			await promise;

			const { command, options } = spawnCall();
			expect(command).toBe('/mock/opencode');
			expect(Object.keys(options).sort()).toEqual(['cwd', 'env', 'shell', 'stdio']);
			expect(options['cwd']).toBe('/workspace');
			expect(options['stdio']).toBe('inherit');
			expect(options['shell']).toBe(false);
			const env = options['env'] as Record<string, string>;
			expect(env[SECRET_NAME]).toBeUndefined();
			expect(env['XDG_CONFIG_HOME']).toMatch(/opencode-run-/);
		});
	});

	describe('binary lookup (OPENCODE_MOCK_PATH unset)', () => {
		beforeEach(() => {
			delete process.env['OPENCODE_MOCK_PATH'];
		});

		async function launchBackground(): Promise<void> {
			const promise = provider.launchBackground(baseOptions());
			child.emit('exit', 0);
			await promise;
		}

		it('on POSIX runs `which opencode` with utf8 + windowsHide and spawns its answer', async () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
			vi.mocked(child_process.execSync).mockReturnValue('/usr/local/bin/opencode\n');

			await launchBackground();

			expect(child_process.execSync).toHaveBeenCalledWith('which opencode', {
				encoding: 'utf8',
				windowsHide: true,
			});
			expect(spawnCall().command).toBe('/usr/local/bin/opencode');
			expect(spawnCall().options['shell']).toBe(false);
		});

		it('on POSIX falls back to the bare name without a shell when the lookup fails', async () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
			vi.mocked(child_process.execSync).mockImplementation(() => {
				throw new Error('not found');
			});

			await launchBackground();

			expect(spawnCall().command).toBe('opencode');
			expect(spawnCall().options['shell']).toBe(false);
		});

		it('on Windows runs `where.exe opencode.cmd 2>nul` with utf8 + windowsHide and falls back to a shell', async () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
			vi.mocked(child_process.execSync).mockImplementation(() => {
				throw new Error('not found');
			});

			await launchBackground();

			expect(child_process.execSync).toHaveBeenCalledWith('where.exe opencode.cmd 2>nul', {
				encoding: 'utf8',
				windowsHide: true,
			});
			expect(spawnCall().command).toBe('opencode');
			expect(spawnCall().options['shell']).toBe(true);
		});
	});
});
