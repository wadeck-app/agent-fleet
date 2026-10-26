/**
 * Characterization of ClaudeLauncher's process calls: the exact options of both `spawn` sites, the
 * environment isolation, the `where`/`which` binary lookup and the end-of-turn tree kill.
 *
 * Pins today's behaviour so that routing these calls through a process-launcher seam (plan
 * .claude/plans/2026-10-25_docker-sandbox-worker.md, C4) is provably behavior-preserving.
 * `windowsHide`/`detached` are absent on purpose (console inheritance, d032e7e): see
 * ClaudeLauncher.windows-console.test.ts.
 */
import * as child_process from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ClaudeLauncher } from './ClaudeLauncher';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: vi.fn(), spawnSync: vi.fn(), execSync: vi.fn() };
});

const SECRET_NAME = 'FLOW_C4_CHARACTERIZATION_SECRET';

interface MockStdin {
	write: ReturnType<typeof vi.fn>;
	end: ReturnType<typeof vi.fn>;
}

interface MockPipe extends EventEmitter {
	destroy: ReturnType<typeof vi.fn>;
}

interface MockChild extends EventEmitter {
	pid: number;
	kill: ReturnType<typeof vi.fn>;
	stdin: MockStdin;
	stdout: MockPipe;
	stderr: MockPipe;
}

function makeChild(): MockChild {
	const child = new EventEmitter() as MockChild;
	child.pid = 777;
	child.kill = vi.fn();
	child.stdin = { write: vi.fn(), end: vi.fn() };
	child.stdout = Object.assign(new EventEmitter(), { destroy: vi.fn() });
	child.stderr = Object.assign(new EventEmitter(), { destroy: vi.fn() });
	return child;
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

describe('ClaudeLauncher -- process call contract', () => {
	let launcher: ClaudeLauncher;
	let child: MockChild;
	const originalMockPath = process.env['CLAUDE_MOCK_PATH'];

	beforeEach(() => {
		vi.clearAllMocks();
		process.env[SECRET_NAME] = 'leak-me';
		process.env['CLAUDE_MOCK_PATH'] = '/mock/claude';
		launcher = new ClaudeLauncher();
		child = makeChild();
		vi.mocked(child_process.spawn).mockReturnValue(child as unknown as child_process.ChildProcess);
	});

	afterEach(() => {
		delete process.env[SECRET_NAME];
		if (originalMockPath === undefined) delete process.env['CLAUDE_MOCK_PATH'];
		else process.env['CLAUDE_MOCK_PATH'] = originalMockPath;
		vi.restoreAllMocks();
	});

	describe('launchBackground', () => {
		async function launch(extra: Record<string, unknown> = {}): Promise<void> {
			const promise = launcher.launchBackground({ workingDir: '/work', prompt: 'hello', stepId: 's1', ...extra });
			child.emit('close', 0);
			await promise;
		}

		it('spawns the mock binary with exactly cwd, stdio (three pipes), shell:false and env', async () => {
			await launch();

			const { command, options } = spawnCall();
			expect(command).toBe('/mock/claude');
			expect(Object.keys(options).sort()).toEqual(['cwd', 'env', 'shell', 'stdio']);
			expect(options['cwd']).toBe('/work');
			expect(options['shell']).toBe(false);
			expect(options['stdio']).toEqual(['pipe', 'pipe', 'pipe']);
		});

		it('writes the prompt to stdin and closes it', async () => {
			await launch({ prompt: 'the prompt' });
			expect(child.stdin.write).toHaveBeenCalledWith('the prompt');
			expect(child.stdin.end).toHaveBeenCalledOnce();
		});

		it('isolates the environment by default: PATH kept, other process variables dropped, step env added', async () => {
			await launch({ env: { STEP_VAR: 'v' } });

			const env = spawnCall().options['env'] as Record<string, string>;
			expect(env['PATH'] ?? env['Path']).toBeDefined();
			expect(env['STEP_VAR']).toBe('v');
			expect(env[SECRET_NAME]).toBeUndefined();
			expect(Object.values(env).every(value => typeof value === 'string')).toBe(true);
		});

		it('forwards ANTHROPIC_API_KEY explicitly when the process has one', async () => {
			process.env['ANTHROPIC_API_KEY'] = 'key-123';
			try {
				await launch();
				expect((spawnCall().options['env'] as Record<string, string>)['ANTHROPIC_API_KEY']).toBe('key-123');
			} finally {
				delete process.env['ANTHROPIC_API_KEY'];
			}
		});

		it('inherits the whole process environment only when isolateEnv is false', async () => {
			await launch({ isolateEnv: false });
			expect((spawnCall().options['env'] as Record<string, string>)[SECRET_NAME]).toBe('leak-me');
		});

		it('hands the process to onProcessStarted', async () => {
			const onProcessStarted = vi.fn();
			await launch({ onProcessStarted });
			expect(onProcessStarted).toHaveBeenCalledWith(child);
		});

		describe('end-of-turn kill', () => {
			beforeEach(() => {
				vi.useFakeTimers();
			});
			afterEach(() => {
				vi.useRealTimers();
			});

			it('on Windows, ends a process that outlived its final result with `taskkill /PID <pid> /T /F`', async () => {
				vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
				vi.spyOn(console, 'warn').mockImplementation(() => {});
				vi.mocked(child_process.spawnSync).mockReturnValue({
					status: 0,
					stdout: '',
					stderr: '',
					error: undefined,
				} as unknown as ReturnType<typeof child_process.spawnSync>);

				const promise = launcher.launchBackground({
					workingDir: '/work',
					prompt: 'hello',
					stepId: 's1',
					streamJson: true,
					resultGraceMs: 100,
				});
				child.stdout.emit(
					'data',
					Buffer.from('{"type":"result","subtype":"success","is_error":false,"result":"ok"}\n')
				);
				await vi.advanceTimersByTimeAsync(100);
				const result = await promise;

				expect(result.endedAfterResult).toEqual({ graceMs: 100 });
				expect(vi.mocked(child_process.spawnSync).mock.calls).toEqual([
					['taskkill', ['/PID', '777', '/T', '/F'], { encoding: 'utf8', windowsHide: true }],
				]);
				// The pipes are cut so a surviving grandchild cannot keep the launch pending.
				expect(child.stdout.destroy).toHaveBeenCalled();
				expect(child.stderr.destroy).toHaveBeenCalled();
			});
		});
	});

	describe('launchInteractive', () => {
		async function launch(): Promise<void> {
			const promise = launcher.launchInteractive({ workingDir: '/work', prompt: 'hello', stepId: 's1' });
			child.emit('close', 0);
			await promise;
		}

		it('spawns with exactly cwd, stdio:inherit, shell:false and env', async () => {
			await launch();

			const { command, options } = spawnCall();
			expect(command).toBe('/mock/claude');
			expect(Object.keys(options).sort()).toEqual(['cwd', 'env', 'shell', 'stdio']);
			expect(options['cwd']).toBe('/work');
			expect(options['shell']).toBe(false);
			expect(options['stdio']).toBe('inherit');
		});

		it('isolates the environment by default', async () => {
			await launch();
			expect((spawnCall().options['env'] as Record<string, string>)[SECRET_NAME]).toBeUndefined();
		});
	});

	describe('findClaudePath (binary lookup)', () => {
		beforeEach(() => {
			delete process.env['CLAUDE_MOCK_PATH'];
		});

		it('on POSIX runs `which claude` with utf8 + windowsHide', () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
			vi.mocked(child_process.execSync).mockReturnValue('/usr/bin/claude\n');

			expect(launcher.findClaudePath({})).toBe('/usr/bin/claude');
			expect(child_process.execSync).toHaveBeenCalledWith('which claude', {
				encoding: 'utf8',
				windowsHide: true,
			});
		});

		it('on Windows runs `where claude` and prefers a .cmd, then a .bat, then the first hit', () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
			vi.mocked(child_process.execSync).mockReturnValue('C:\\bin\\claude\nC:\\bin\\claude.cmd\n');
			expect(launcher.findClaudePath({})).toBe('C:\\bin\\claude.cmd');
			expect(child_process.execSync).toHaveBeenCalledWith('where claude', {
				encoding: 'utf8',
				windowsHide: true,
			});

			vi.mocked(child_process.execSync).mockReturnValue('C:\\bin\\claude\nC:\\bin\\claude.bat\n');
			expect(launcher.findClaudePath({})).toBe('C:\\bin\\claude.bat');

			vi.mocked(child_process.execSync).mockReturnValue('C:\\bin\\claude\n');
			expect(launcher.findClaudePath({})).toBe('C:\\bin\\claude');
		});

		it('warns and falls back to the bare name when the lookup fails', () => {
			vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
			const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
			vi.mocked(child_process.execSync).mockImplementation(() => {
				throw new Error('not found');
			});

			expect(launcher.findClaudePath({})).toBe('claude');
			expect(warn).toHaveBeenCalledWith('Could not find claude in PATH, using "claude" as fallback');
		});

		it('CLAUDE_MOCK_PATH in the given env short-circuits the lookup', () => {
			expect(launcher.findClaudePath({ CLAUDE_MOCK_PATH: '/m/claude' })).toBe('/m/claude');
			expect(child_process.execSync).not.toHaveBeenCalled();
		});
	});
});
