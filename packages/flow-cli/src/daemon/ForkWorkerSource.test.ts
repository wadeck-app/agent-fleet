import type { ChildProcess } from 'node:child_process';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.fn();
const existsSyncMock = vi.fn();

vi.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));
vi.mock('node:fs', () => ({ existsSync: (...args: unknown[]) => existsSyncMock(...args) }));

const { ForkWorkerSource } = await import('./ForkWorkerSource.js');

function fakeChild(pid: number | undefined): ChildProcess {
	return {
		pid,
		killed: false,
		kill: vi.fn(),
		on: vi.fn(),
		stderr: { on: vi.fn() },
	} as unknown as ChildProcess;
}

const request = { daemonEndpoint: 'ws://127.0.0.1:1', sourceId: 'fork', projects: [] };

beforeEach(() => {
	spawnMock.mockReset();
	existsSyncMock.mockReset();
	// Default: dev worker path present.
	existsSyncMock.mockImplementation((p: string) => p.includes('Worker.js'));
});

afterEach(() => {
	vi.useRealTimers();
});

describe('ForkWorkerSource - worker path detection', () => {
	it('uses the dev worker with a tsx loader when the compiled path exists', () => {
		const source = new ForkWorkerSource(100, 200);
		expect(source.workerPath).toMatch(/Worker\.js$/);
		expect(source.tsxLoaderPath).not.toBeNull();
	});

	it('uses the bundled worker with no loader when only the bundle exists', () => {
		existsSyncMock.mockImplementation((p: string) => p.includes('worker.cjs'));
		const source = new ForkWorkerSource(100, 200);
		expect(source.workerPath).toMatch(/worker\.cjs$/);
		expect(source.tsxLoaderPath).toBeNull();
	});

	it('fails loudly naming both paths it checked when neither exists', () => {
		existsSyncMock.mockReturnValue(false);
		expect(() => new ForkWorkerSource(100, 200)).toThrow(/Worker not found/);
		expect(() => new ForkWorkerSource(100, 200)).toThrow(/worker\.cjs/);
	});
});

describe('ForkWorkerSource - obtaining a worker', () => {
	it('spawns a child and records its pid as one of its own', async () => {
		spawnMock.mockReturnValue(fakeChild(4242));
		const source = new ForkWorkerSource(100, 200);

		await source.obtainWorker(request);

		expect(spawnMock).toHaveBeenCalledTimes(1);
		expect(source.hasSpawned(4242)).toBe(true);
		expect(source.hasSpawned(9999)).toBe(false);
	});

	it('resolves the ws port lazily at spawn time', async () => {
		spawnMock.mockReturnValue(fakeChild(1));
		let port = 0;
		const source = new ForkWorkerSource(100, () => {
			port = 4321;
			return port;
		});

		await source.obtainWorker(request);

		const env = (spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env;
		expect(env['FLOW_WS_PORT']).toBe('4321');
		expect(port).toBe(4321);
	});

	// A silent failure here would consume a capacity slot forever.
	it('throws when the spawn produces no pid', async () => {
		spawnMock.mockReturnValue(fakeChild(undefined));
		const source = new ForkWorkerSource(100, 200);

		await expect(source.obtainWorker(request)).rejects.toThrow(/no pid/i);
	});

	it('passes the claude path only when one was provided', async () => {
		spawnMock.mockReturnValue(fakeChild(1));
		await new ForkWorkerSource(100, 200, 'C:/claude.exe').obtainWorker(request);
		const withPath = (spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env;
		expect(withPath['FLOW_CLAUDE_PATH']).toBe('C:/claude.exe');

		spawnMock.mockClear();
		spawnMock.mockReturnValue(fakeChild(2));
		await new ForkWorkerSource(100, 200).obtainWorker(request);
		const without = (spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env;
		expect(without['FLOW_CLAUDE_PATH']).toBeUndefined();
	});
});

describe('ForkWorkerSource - pending workers', () => {
	it('counts a spawned worker as pending until it connects', async () => {
		spawnMock.mockReturnValue(fakeChild(7));
		const source = new ForkWorkerSource(100, 200);

		await source.obtainWorker(request);
		expect(source.pendingCount).toBe(1);

		source.acknowledgeConnection(7);
		expect(source.pendingCount).toBe(0);
	});

	it('kills a worker that never connects within the timeout', async () => {
		vi.useFakeTimers();
		const child = fakeChild(11);
		spawnMock.mockReturnValue(child);
		const source = new ForkWorkerSource(100, 200);

		await source.obtainWorker(request);
		vi.advanceTimersByTime(60_000);

		expect(child.kill).toHaveBeenCalledWith('SIGKILL');
		expect(source.pendingCount).toBe(0);
	});

	it('does not kill a worker that connected in time', async () => {
		vi.useFakeTimers();
		const child = fakeChild(12);
		spawnMock.mockReturnValue(child);
		const source = new ForkWorkerSource(100, 200);

		await source.obtainWorker(request);
		source.acknowledgeConnection(12);
		vi.advanceTimersByTime(60_000);

		expect(child.kill).not.toHaveBeenCalled();
	});

	it('acknowledging an unknown pid is harmless', () => {
		const source = new ForkWorkerSource(100, 200);
		expect(() => source.acknowledgeConnection(999)).not.toThrow();
	});
});
