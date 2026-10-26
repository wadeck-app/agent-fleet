/**
 * Characterization of CodexModelProvider's process calls: the exact options of both `spawn` sites, the
 * environment isolation, what `kill()` does and the `where.exe`/`which` binary lookup.
 *
 * Pins today's behaviour so that routing these calls through a process-launcher seam (plan
 * .claude/plans/2026-10-25_docker-sandbox-worker.md, C4) is provably behavior-preserving. Notably,
 * `kill()` ends only the codex process itself (no tree kill) and the background spawn sets
 * `windowsHide: true` while the interactive one must not (console inheritance, d032e7e).
 */
import * as child_process from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { CodexModelProvider } from './CodexModelProvider';
import type { LaunchOptions } from './ModelProvider';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: vi.fn(), spawnSync: vi.fn(), execSync: vi.fn() };
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
	child.pid = 1234;
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

describe('CodexModelProvider -- process call contract', () => {
	let provider: CodexModelProvider;
	let child: MockChild;
	const originalMockPath = process.env['CODEX_MOCK_PATH'];

	beforeEach(() => {
		vi.clearAllMocks();
		process.env[SECRET_NAME] = 'leak-me';
		process.env['CODEX_MOCK_PATH'] = '/mock/codex';
		provider = new CodexModelProvider();
		child = makeChild();
		vi.mocked(child_process.spawn).mockReturnValue(child as unknown as child_process.ChildProcess);
	});

	afterEach(() => {
		delete process.env[SECRET_NAME];
		if (originalMockPath === undefined) delete process.env['CODEX_MOCK_PATH'];
		else process.env['CODEX_MOCK_PATH'] = originalMockPath;
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

			const { command, options } = spawnCall();
			expect(command).toBe('/mock/codex');
			expect(Object.keys(options).sort()).toEqual(['cwd', 'env', 'shell', 'stdio', 'windowsHide']);
			expect(options['cwd']).toBe('/workspace');
			expect(options['stdio']).toEqual(['ignore', 'pipe', 'pipe']);
			expect(options['windowsHide']).toBe(true);
			expect(options['shell']).toBe(false);
		});

		it('runs `exec --json` and passes the prompt last, after a -- separator', async () => {
			await launch({ prompt: 'the prompt' });

			const { args } = spawnCall();
			expect(args).toContain('exec');
			expect(args).toContain('--json');
			expect(args.slice(-2)).toEqual(['--', 'the prompt']);
		});

		it('isolates the environment: the step env is passed, other process variables are not', async () => {
			await launch({ env: { STEP_VAR: 'v' } });

			const env = spawnCall().options['env'] as Record<string, string>;
			expect(env['STEP_VAR']).toBe('v');
			expect(env[SECRET_NAME]).toBeUndefined();
			expect(Object.values(env).every(value => typeof value === 'string')).toBe(true);
		});

		it('hands the process to onProcessStarted', async () => {
			const onProcessStarted = vi.fn();
			await launch({ onProcessStarted });
			expect(onProcessStarted).toHaveBeenCalledWith(child);
		});

		it('kill() while running calls child.kill() once with no signal and no tree kill', async () => {
			const promise = provider.launchBackground(baseOptions());
			provider.kill();
			expect(child.kill).toHaveBeenCalledOnce();
			expect(child.kill).toHaveBeenCalledWith();
			expect(child_process.spawnSync).not.toHaveBeenCalled();

			child.emit('exit', 0);
			await promise;
		});

		it('does not call child.kill() after a normal exit', async () => {
			await launch();
			// The exit handler clears the reference first, so the cleanup `kill()` finds nothing.
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
			expect(command).toBe('/mock/codex');
			expect(Object.keys(options).sort()).toEqual(['cwd', 'env', 'shell', 'stdio']);
			expect(options['cwd']).toBe('/workspace');
			expect(options['stdio']).toBe('inherit');
			expect(options['shell']).toBe(false);
			expect((options['env'] as Record<string, string>)[SECRET_NAME]).toBeUndefined();
		});
	});

	describe('binary lookup (CODEX_MOCK_PATH unset)', () => {
		beforeEach(() => {
			delete process.env['CODEX_MOCK_PATH'];
		});

		async function launchBackground(): Promise<void> {
			const promise = provider.launchBackground(baseOptions());
			child.emit('exit', 0);
			await promise;
		}

		it('on POSIX runs `which codex` with utf8 + windowsHide and spawns its answer', async () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
			vi.mocked(child_process.execSync).mockReturnValue('/usr/local/bin/codex\n');

			await launchBackground();

			expect(child_process.execSync).toHaveBeenCalledWith('which codex', { encoding: 'utf8', windowsHide: true });
			expect(spawnCall().command).toBe('/usr/local/bin/codex');
		});

		it('on Windows runs `where.exe codex.cmd 2>nul` with utf8 + windowsHide', async () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
			vi.mocked(child_process.execSync).mockReturnValue('C:\\npm\\codex.cmd\r\n');

			await launchBackground();

			expect(child_process.execSync).toHaveBeenCalledWith('where.exe codex.cmd 2>nul', {
				encoding: 'utf8',
				windowsHide: true,
			});
		});
	});
});
