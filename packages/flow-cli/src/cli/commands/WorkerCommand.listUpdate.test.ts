import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Characterization of `flow worker list` / `flow worker update` paths not covered by
// WorkerCommand.test.ts (--json, fatal list errors, update failure reporting, label parsing).
class DaemonNotRunningError extends Error {}

const baseWorker = {
	pid: 1,
	state: 'idle' as const,
	labels: [],
	attachedProjects: [],
	hasUserInterface: false,
	ephemeral: true,
	shellCapabilities: [],
};

describe('flow worker list / update (characterization)', () => {
	let logSpy: ReturnType<typeof vi.spyOn>;
	let errorSpy: ReturnType<typeof vi.spyOn>;
	let exitSpy: ReturnType<typeof vi.spyOn>;

	beforeEach(() => {
		vi.resetModules();
		logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
		errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
		exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
			throw new Error('process.exit called');
		});
	});

	afterEach(() => {
		vi.restoreAllMocks();
		vi.resetModules();
	});

	async function run(kit: Record<string, unknown>, args: string[]): Promise<void> {
		vi.doMock('@wadeck-app/singleton-daemon-kit', () => ({ DaemonNotRunningError, ...kit }));
		const { registerWorkerCommand } = await import('./WorkerCommand');
		const program = new Command();
		program.exitOverride();
		const workerCommand = new Command('worker');
		program.addCommand(workerCommand);
		registerWorkerCommand(workerCommand);
		await program.parseAsync(['node', 'test', 'worker', ...args]);
	}

	const logged = (): string => logSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');
	const errored = (): string => errorSpy.mock.calls.map((call: unknown[]) => call.join(' ')).join('\n');

	it('list --json prints the workers as indented JSON', async () => {
		await run(
			{ createDaemonClient: () => ({ send: async () => Promise.resolve([{ ...baseWorker, workerId: 'w1' }]) }) },
			['list', '--json']
		);

		const parsed = JSON.parse(logged()) as { workerId: string }[];
		expect(parsed.map(w => w.workerId)).toEqual(['w1']);
		expect(logged()).toContain('\n  {');
	});

	it('list exits 1 with the message when the daemon does not know the command', async () => {
		await expect(
			run(
				{
					createDaemonClient: () => ({
						send: async () => Promise.reject(new Error('unknown command: workers')),
					}),
				},
				['list']
			)
		).rejects.toThrow('process.exit called');

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errored()).toContain('does not support "flow worker list"');
	});

	it('update says no daemon is running when the daemon cannot be reached', async () => {
		await expect(
			run(
				{
					createDaemonClient: () => ({
						send: async () => Promise.reject(new DaemonNotRunningError('no port file')),
					}),
				},
				['update', 'w1', '--labels', 'npm']
			)
		).rejects.toThrow('process.exit called');

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errored()).toContain('No daemon is running, so there is no live worker to update.');
	});

	it('update reports the outdated daemon when it does not know updateWorker', async () => {
		await expect(
			run(
				{
					createDaemonClient: () => ({
						send: async () => Promise.reject(new Error('unknown command: updateWorker')),
					}),
				},
				['update', 'w1', '--labels', 'npm']
			)
		).rejects.toThrow('process.exit called');

		expect(exitSpy).toHaveBeenCalledWith(1);
		expect(errored()).toContain('flow worker update');
		expect(errored()).toMatch(/restart|older|outdated|update/i);
	});

	it('update prints (none) for empty labels and shells, and trims/splits --labels', async () => {
		const send = vi.fn().mockResolvedValue({ ...baseWorker, workerId: 'w1', labels: [], shellCapabilities: [] });
		await run({ createDaemonClient: () => ({ send }) }, ['update', 'w1', '--labels', ' a , b ']);

		expect(send).toHaveBeenCalledWith('updateWorker', { workerId: 'w1', labels: ['a', 'b'] });
		expect(logged()).toContain('labels : (none)');
		expect(logged()).toContain('shells : (none)');
	});

	it('update with an empty --labels string clears the labels', async () => {
		const send = vi.fn().mockResolvedValue({ ...baseWorker, workerId: 'w1' });
		await run({ createDaemonClient: () => ({ send }) }, ['update', 'w1', '--labels', '']);

		expect(send).toHaveBeenCalledWith('updateWorker', { workerId: 'w1', labels: [] });
	});
});
