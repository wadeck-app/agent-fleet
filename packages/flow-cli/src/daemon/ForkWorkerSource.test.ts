import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
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

	it('forwards PATHEXT to the worker so model CLIs can resolve npm.cmd', async () => {
		const previous = process.env['PATHEXT'];
		process.env['PATHEXT'] = '.COM;.EXE;.BAT;.CMD';
		try {
			spawnMock.mockReturnValue(fakeChild(1));
			await new ForkWorkerSource(100, 200).obtainWorker(request);
			const env = (spawnMock.mock.calls[0]![2] as { env: Record<string, string> }).env;
			expect(env['PATHEXT']).toBe('.COM;.EXE;.BAT;.CMD');
		} finally {
			if (previous === undefined) delete process.env['PATHEXT'];
			else process.env['PATHEXT'] = previous;
		}
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

describe('ForkWorkerSource - exit diagnostics', () => {
	type Entry = { level: 'info' | 'error'; msg: string };

	function emittingChild(pid: number) {
		const child = new EventEmitter() as EventEmitter & {
			pid: number;
			killed: boolean;
			kill: ReturnType<typeof vi.fn>;
			stderr: EventEmitter;
		};
		child.pid = pid;
		child.killed = false;
		child.kill = vi.fn();
		child.stderr = new EventEmitter();
		return child;
	}

	async function spawnWatched(options: { maskText?: (text: string) => string } = {}) {
		const entries: Entry[] = [];
		const child = emittingChild(77);
		spawnMock.mockReturnValue(child);
		const stderrWrite = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
		const source = new ForkWorkerSource(100, 200, undefined, {
			log: (level, msg) => entries.push({ level, msg }),
			...options,
		});
		await source.obtainWorker(request);
		return { child, entries, source, stderrWrite };
	}

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('logs a crash with pid, code and the last stderr lines at error level', async () => {
		const { child, entries } = await spawnWatched();
		child.stderr.emit('data', Buffer.from('line one\n[worker] fatal: uncaughtException: kaboom\n'));

		child.emit('exit', 1, null);
		child.emit('close', 1, null);

		const text = entries.map(e => e.msg).join('\n');
		expect(entries.every(e => e.level === 'error')).toBe(true);
		expect(text).toContain('pid 77');
		expect(text).toContain('code 1');
		expect(text).toContain('kaboom');
		expect(text).toContain('line one');
	});

	it('logs a kill by signal at error level, naming the signal', async () => {
		const { child, entries } = await spawnWatched();

		child.emit('exit', null, 'SIGKILL');
		child.emit('close', null, 'SIGKILL');

		const first = entries[0]!;
		expect(first.level).toBe('error');
		expect(first.msg).toContain('SIGKILL');
		expect(first.msg).toContain('pid 77');
	});

	it('logs a clean exit at info level', async () => {
		const { child, entries } = await spawnWatched();

		child.emit('exit', 0, null);
		child.emit('close', 0, null);

		expect(entries[0]).toMatchObject({ level: 'info' });
		expect(entries[0]!.msg).toContain('code 0');
	});

	it('logs once even when exit and close both fire', async () => {
		const { child, entries } = await spawnWatched();
		child.stderr.emit('data', Buffer.from('tail\n'));

		child.emit('exit', 2, null);
		child.emit('close', 2, null);

		expect(entries.filter(e => e.msg.includes('exited'))).toHaveLength(1);
	});

	// A grandchild that inherited the stderr pipe keeps it open, so 'close' may never come.
	it('still logs shortly after exit when the stderr pipe never closes', async () => {
		vi.useFakeTimers();
		const { child, entries } = await spawnWatched();
		child.stderr.emit('data', Buffer.from('last words\n'));

		child.emit('exit', 1, null);
		expect(entries).toHaveLength(0);
		await vi.advanceTimersByTimeAsync(1_000);

		expect(entries.map(e => e.msg).join('\n')).toContain('last words');
	});

	it('masks secrets in the stderr tail with the injected masker', async () => {
		const { child, entries } = await spawnWatched({
			maskText: text => text.replaceAll('hunter2-secret', '[secret:X]'),
		});
		child.stderr.emit('data', Buffer.from('token=hunter2-secret failed\n'));

		child.emit('exit', 1, null);
		child.emit('close', 1, null);

		const text = entries.map(e => e.msg).join('\n');
		expect(text).not.toContain('hunter2-secret');
		expect(text).toContain('[secret:X]');
	});

	it('masks the ANTHROPIC_API_KEY it hands to the worker', async () => {
		const previous = process.env['ANTHROPIC_API_KEY'];
		process.env['ANTHROPIC_API_KEY'] = 'sk-ant-abcdefghijkl';
		try {
			const { child, entries } = await spawnWatched();
			child.stderr.emit('data', Buffer.from('auth failed for sk-ant-abcdefghijkl\n'));

			child.emit('exit', 1, null);
			child.emit('close', 1, null);

			expect(entries.map(e => e.msg).join('\n')).not.toContain('sk-ant-abcdefghijkl');
		} finally {
			if (previous === undefined) delete process.env['ANTHROPIC_API_KEY'];
			else process.env['ANTHROPIC_API_KEY'] = previous;
		}
	});

	it('bounds the logged tail to the last 40 lines', async () => {
		const { child, entries } = await spawnWatched();
		child.stderr.emit(
			'data',
			Buffer.from(Array.from({ length: 100 }, (_, i) => `row-${String(i)}`).join('\n') + '\n')
		);

		child.emit('exit', 1, null);
		child.emit('close', 1, null);

		const text = entries.map(e => e.msg).join('\n');
		expect(text).toContain('row-99');
		expect(text).toContain('row-60');
		expect(text).not.toContain('row-59\n');
	});

	it('logs the orphan kill of a worker that never connected through the injected log', async () => {
		vi.useFakeTimers();
		const { child, entries } = await spawnWatched();

		await vi.advanceTimersByTimeAsync(10_000);

		expect(child.kill).toHaveBeenCalledWith('SIGKILL');
		expect(entries[0]).toMatchObject({ level: 'error' });
		expect(entries[0]!.msg).toContain('pid 77');
		expect(entries[0]!.msg).toMatch(/did not connect/);
	});

	it('does not log the worker output to the daemon log while it runs', async () => {
		const { child, entries } = await spawnWatched();

		child.stderr.emit('data', Buffer.from('chatter\n'));

		expect(entries).toHaveLength(0);
	});
});
