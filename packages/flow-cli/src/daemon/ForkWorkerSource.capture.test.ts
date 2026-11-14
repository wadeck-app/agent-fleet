import type { ChildProcess } from 'node:child_process';
import { EventEmitter } from 'node:events';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const spawnMock = vi.fn();

vi.mock('node:child_process', () => ({ spawn: (...args: unknown[]) => spawnMock(...args) }));
// Real file system (the capture writes files); only the worker script lookup is faked.
vi.mock('node:fs', async importOriginal => {
	const actual = await importOriginal<typeof import('node:fs')>();
	return { ...actual, existsSync: (p: string) => p.includes('Worker.js') || actual.existsSync(p) };
});

const fs = await import('node:fs');
const { ForkWorkerSource } = await import('./ForkWorkerSource.js');

const request = { daemonEndpoint: 'ws://127.0.0.1:1', sourceId: 'fork', projects: [] };

function emittingChild(pid: number) {
	const child = new EventEmitter() as EventEmitter & {
		pid: number;
		killed: boolean;
		kill: ReturnType<typeof vi.fn>;
		stdout: EventEmitter;
		stderr: EventEmitter;
	};
	child.pid = pid;
	child.killed = false;
	child.kill = vi.fn();
	child.stdout = new EventEmitter();
	child.stderr = new EventEmitter();
	return child as unknown as ChildProcess & { stdout: EventEmitter; stderr: EventEmitter };
}

let dir: string;

beforeEach(() => {
	spawnMock.mockReset();
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fork-capture-'));
	vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
});

afterEach(() => {
	vi.restoreAllMocks();
	fs.rmSync(dir, { recursive: true, force: true });
});

describe('ForkWorkerSource - captured worker output', () => {
	it('writes stdout and stderr to <workerLogsDir>/worker-<pid>.log and pipes stdout', async () => {
		const child = emittingChild(321);
		spawnMock.mockReturnValue(child);
		const source = new ForkWorkerSource(100, 200, undefined, { log: vi.fn(), workerLogsDir: dir });
		await source.obtainWorker(request);

		expect(spawnMock.mock.calls[0]![2].stdio).toEqual(['ignore', 'pipe', 'pipe']);
		child.stdout.emit('data', Buffer.from('from stdout\n'));
		child.stderr.emit('data', Buffer.from('from stderr\n'));

		const content = fs.readFileSync(path.join(dir, 'worker-321.log'), 'utf8');
		expect(content).toMatch(/ out from stdout\n/);
		expect(content).toMatch(/ err from stderr\n/);
	});

	it('masks the captured lines with the same masker as the stderr tail', async () => {
		const child = emittingChild(322);
		spawnMock.mockReturnValue(child);
		const source = new ForkWorkerSource(100, 200, undefined, {
			log: vi.fn(),
			workerLogsDir: dir,
			maskText: text => text.replaceAll('hunter2-secret', '[masked]'),
		});
		await source.obtainWorker(request);

		child.stdout.emit('data', Buffer.from('token=hunter2-secret\n'));
		child.stderr.emit('data', Buffer.from('again hunter2-secret\n'));

		const content = fs.readFileSync(path.join(dir, 'worker-322.log'), 'utf8');
		expect(content).toContain('out token=[masked]');
		expect(content).toContain('err again [masked]');
		expect(content).not.toContain('hunter2');
	});

	it('flushes an unfinished last line when the worker exits', async () => {
		const child = emittingChild(323);
		spawnMock.mockReturnValue(child);
		const source = new ForkWorkerSource(100, 200, undefined, { log: vi.fn(), workerLogsDir: dir });
		await source.obtainWorker(request);

		child.stderr.emit('data', Buffer.from('last words'));
		child.emit('exit', 1, null);
		child.emit('close', 1, null);

		expect(fs.readFileSync(path.join(dir, 'worker-323.log'), 'utf8')).toMatch(/ err last words\n$/);
	});

	it('still spawns the worker and logs the problem when the output file cannot be created', async () => {
		const blocker = path.join(dir, 'blocker');
		fs.writeFileSync(blocker, '');
		const child = emittingChild(324);
		spawnMock.mockReturnValue(child);
		const log = vi.fn();
		const source = new ForkWorkerSource(100, 200, undefined, { log, workerLogsDir: path.join(blocker, 'x') });

		await expect(source.obtainWorker(request)).resolves.toBeUndefined();
		child.stdout.emit('data', Buffer.from('lost\n'));

		expect(source.hasSpawned(324)).toBe(true);
		expect(log).toHaveBeenCalledWith('error', expect.stringContaining('will not be captured'));
	});

	it('keeps stdout ignored and writes nothing when no directory is configured', async () => {
		const child = emittingChild(325);
		spawnMock.mockReturnValue(child);
		const source = new ForkWorkerSource(100, 200, undefined, { log: vi.fn() });
		await source.obtainWorker(request);

		expect(spawnMock.mock.calls[0]![2].stdio).toEqual(['ignore', 'ignore', 'pipe']);
		expect(fs.readdirSync(dir)).toEqual([]);
	});
});
