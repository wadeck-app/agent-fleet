import type { ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.fn();
vi.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));
vi.mock('node:fs', () => ({ existsSync: (p: string) => p.includes('Worker.js') }));

const { ForkWorkerSource } = await import('./ForkWorkerSource.js');

/**
 * Pins what the daemon's fork fallback does TODAY, beyond ForkWorkerSource.test.ts and
 * ForkWorkerSource.windows-console.test.ts (which stay as they are): the exact spawn call, the exact messages, and the
 * stop path. Moving the construction behind the worker-type contract must not change any of it.
 */

function fakeChild(pid: number | undefined): ChildProcess {
	return { pid, killed: false, kill: vi.fn(), on: vi.fn(), stderr: { on: vi.fn() } } as unknown as ChildProcess;
}

const request = { daemonEndpoint: 'loopback', sourceId: 'built-in:fork', projects: [] };

beforeEach(() => {
	spawnMock.mockReset();
});

afterEach(() => {
	vi.useRealTimers();
});

describe('the fork fallback - characterization', () => {
	it('spawns this node with the worker script, with exactly the options env and stdio: no windowsHide, no shell, no cwd', async () => {
		spawnMock.mockReturnValue(fakeChild(7));
		const source = new ForkWorkerSource(100, 200, 'C:/claude.exe');

		await source.obtainWorker(request);

		const [command, args, options] = spawnMock.mock.calls[0] as [string, string[], Record<string, unknown>];
		expect(command).toBe(process.execPath);
		expect(args).toEqual(['--import', source.tsxLoaderPath, source.workerPath]);
		expect(Object.keys(options).sort()).toEqual(['env', 'stdio']);
		expect(options['stdio']).toEqual(['ignore', 'ignore', 'pipe']);
	});

	it('hands the worker an allow-listed environment: the two ports and the claude path first', async () => {
		spawnMock.mockReturnValue(fakeChild(7));

		await new ForkWorkerSource(100, () => 200, 'C:/claude.exe').obtainWorker(request);

		const env = (spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env;
		expect(env['FLOW_DAEMON_PORT']).toBe('100');
		expect(env['FLOW_WS_PORT']).toBe('200');
		expect(env['FLOW_CLAUDE_PATH']).toBe('C:/claude.exe');
		expect(Object.keys(env).slice(0, 3)).toEqual(['FLOW_DAEMON_PORT', 'FLOW_WS_PORT', 'FLOW_CLAUDE_PATH']);
		// Nothing of the daemon's own environment beyond the list (the daemon mode flag in particular).
		expect('FLOW_DAEMON_MODE' in env).toBe(false);
	});

	it('refuses a spawn without a pid with the exact message', async () => {
		spawnMock.mockReturnValue(fakeChild(undefined));

		await expect(new ForkWorkerSource(100, 200).obtainWorker(request)).rejects.toThrow(
			'ForkWorkerSource: spawn produced no pid, so no worker will join'
		);
	});

	it('logs the kill of a worker that never connects with the exact message', async () => {
		vi.useFakeTimers();
		spawnMock.mockReturnValue(fakeChild(11));
		const log = vi.fn();

		await new ForkWorkerSource(100, 200, undefined, { log }).obtainWorker(request);
		vi.advanceTimersByTime(10_000);

		expect(log).toHaveBeenCalledWith('error', 'worker pid 11 did not connect within 10000ms -- killing');
	});

	it('on stop, kills a worker still running after the grace and says so; nothing is scheduled with none running', async () => {
		vi.useFakeTimers();
		const child = fakeChild(21);
		spawnMock.mockReturnValue(child);
		const log = vi.fn();
		const source = new ForkWorkerSource(100, 200, undefined, { log });

		source.terminateRemaining(2_000);
		expect(vi.getTimerCount()).toBe(0);

		await source.obtainWorker(request);
		source.acknowledgeConnection(21);
		source.terminateRemaining(2_000);
		vi.advanceTimersByTime(2_000);

		expect(child.kill).toHaveBeenCalledWith('SIGKILL');
		expect(log).toHaveBeenCalledWith(
			'error',
			'worker pid 21 was still running 2000ms after the daemon stopped -- killing'
		);
	});
});
