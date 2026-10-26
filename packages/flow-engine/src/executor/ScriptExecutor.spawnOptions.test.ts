/**
 * Characterization of the exact options ScriptExecutor hands to `child_process.spawn`.
 *
 * Pins today's behaviour so that routing the spawn through a process-launcher seam (plan
 * .claude/plans/2026-10-25_docker-sandbox-worker.md, C4) can be proven behavior-preserving: same command,
 * same arguments, same option keys and values, same environment isolation. A key being added or removed
 * is a deliberate change and must fail here.
 *
 * `windowsHide`/`detached` are absent on purpose (console inheritance, d032e7e): see
 * ScriptExecutor.windows-console.test.ts for the reason.
 */
import * as child_process from 'node:child_process';
import { EventEmitter } from 'node:events';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScriptExecutor } from './ScriptExecutor';
import { BashShellStrategy } from './shell/BashShellStrategy';
import { CmdShellStrategy } from './shell/CmdShellStrategy';
import { PwshShellStrategy } from './shell/PwshShellStrategy';

vi.mock('node:child_process', async importOriginal => {
	const actual = await importOriginal<typeof import('node:child_process')>();
	return { ...actual, spawn: vi.fn(), spawnSync: vi.fn(), execSync: vi.fn() };
});

const SECRET_NAME = 'FLOW_C4_CHARACTERIZATION_SECRET';

interface MockChild extends EventEmitter {
	stdout: EventEmitter;
	stderr: EventEmitter;
	pid: number;
	kill: () => void;
}

function makeMockChild(): MockChild {
	const child = new EventEmitter() as MockChild;
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	child.pid = 4321;
	child.kill = vi.fn();
	return child;
}

describe('ScriptExecutor -- spawn call contract', () => {
	let executor: ScriptExecutor;
	let child: MockChild;

	beforeEach(() => {
		vi.clearAllMocks();
		process.env[SECRET_NAME] = 'leak-me';
		executor = new ScriptExecutor();
		child = makeMockChild();
		vi.mocked(child_process.spawn).mockReturnValue(child as unknown as child_process.ChildProcess);
	});

	afterEach(() => {
		delete process.env[SECRET_NAME];
		vi.restoreAllMocks();
	});

	async function run(options: Parameters<ScriptExecutor['execute']>[0]): Promise<void> {
		const promise = executor.execute(options);
		child.emit('close', 0);
		await promise;
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

	describe('generic path (no explicit shell kind)', () => {
		it('spawns the script text itself with no args and exactly cwd, env, shell and stdio', async () => {
			await run({ script: 'echo hi', workingDir: '/work' });

			const { command, args, options } = spawnCall();
			expect(command).toBe('echo hi');
			expect(args).toEqual([]);
			expect(Object.keys(options).sort()).toEqual(['cwd', 'env', 'shell', 'stdio']);
			expect(options['cwd']).toBe('/work');
			expect(options['shell']).toBe(true);
			expect(options['stdio']).toEqual(['ignore', 'pipe', 'pipe']);
		});

		it('passes an explicit shell value straight through', async () => {
			await run({ script: 'echo hi', workingDir: '/work', shell: false });
			expect(spawnCall().options['shell']).toBe(false);
		});

		it('defaults the working directory to process.cwd()', async () => {
			await run({ script: 'echo hi' });
			expect(spawnCall().options['cwd']).toBe(process.cwd());
		});

		it('isolates the environment by default: PATH is kept, other process variables are not, step env is added', async () => {
			await run({ script: 'echo hi', env: { STEP_VAR: 'v' } });

			const env = spawnCall().options['env'] as Record<string, string>;
			expect(env['PATH'] ?? env['Path']).toBeDefined();
			expect(env['STEP_VAR']).toBe('v');
			expect(env[SECRET_NAME]).toBeUndefined();
		});

		it('inherits the whole process environment only when isolateEnv is false', async () => {
			await run({ script: 'echo hi', isolateEnv: false });
			expect((spawnCall().options['env'] as Record<string, string>)[SECRET_NAME]).toBe('leak-me');
		});

		it('never passes undefined env values to spawn', async () => {
			await run({ script: 'echo hi', env: { STEP_VAR: 'v' } });
			const env = spawnCall().options['env'] as Record<string, unknown>;
			expect(Object.values(env).every(value => typeof value === 'string')).toBe(true);
		});
	});

	describe('explicit shell kind (temp script file)', () => {
		(
			[
				['bash', BashShellStrategy],
				['cmd', CmdShellStrategy],
				['pwsh', PwshShellStrategy],
			] as const
		).forEach(([shellKind, strategyClass]) => {
			it(`${shellKind}: spawns the resolved binary with the script file and exactly cwd, env and stdio`, async () => {
				vi.spyOn(strategyClass.prototype, 'resolve').mockReturnValue(`/resolved/${shellKind}`);

				await run({ script: 'echo hi', shellKind, workingDir: '/work' });

				const { command, args, options } = spawnCall();
				expect(command).toBe(`/resolved/${shellKind}`);
				// The script file is the last argument for all three kinds.
				expect(args[args.length - 1]).toMatch(/agent-fleet-script-.*\.(sh|bat|ps1)$/);
				expect(Object.keys(options).sort()).toEqual(['cwd', 'env', 'stdio']);
				expect(options['cwd']).toBe('/work');
				expect(options['stdio']).toEqual(['ignore', 'pipe', 'pipe']);
				expect((options['env'] as Record<string, string>)[SECRET_NAME]).toBeUndefined();
			});
		});

		it('bash: strict adds extra shell arguments before the script file, strict:false does not', async () => {
			vi.spyOn(BashShellStrategy.prototype, 'resolve').mockReturnValue('/resolved/bash');

			await run({ script: 'echo hi', shellKind: 'bash' });
			const strictArgs = spawnCall().args;

			vi.clearAllMocks();
			child = makeMockChild();
			vi.mocked(child_process.spawn).mockReturnValue(child as unknown as child_process.ChildProcess);
			await run({ script: 'echo hi', shellKind: 'bash', strict: false });
			const lenientArgs = spawnCall().args;

			expect(strictArgs.length).toBeGreaterThan(lenientArgs.length);
		});
	});
});
