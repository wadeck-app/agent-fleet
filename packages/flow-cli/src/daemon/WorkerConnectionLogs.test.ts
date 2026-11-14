import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';

import { WORKER_FEATURE_WORKER_LOGS } from '../ipc/Protocol';
import { type LoggedWorker, WorkerConnectionLogs } from './WorkerConnectionLogs.js';

let dir: string;

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-connection-logs-'));
});

afterEach(() => {
	fs.rmSync(dir, { recursive: true, force: true });
});

const ws = (): WebSocket => ({}) as WebSocket;

function worker(overrides: Partial<LoggedWorker> = {}): LoggedWorker {
	return {
		workerId: 'w-1',
		pid: 7,
		version: 'sandbox-exec-m7',
		sourceId: 'sandbox-builder-1',
		labels: ['a'],
		features: [WORKER_FEATURE_WORKER_LOGS],
		ephemeral: false,
		...overrides,
	};
}

function lines(workerId = 'w-1'): string[] {
	return fs
		.readFileSync(path.join(dir, `worker-${workerId}.log`), 'utf8')
		.split('\n')
		.filter(Boolean)
		.map(line => line.replace(/^\S+ /, ''));
}

describe('WorkerConnectionLogs.open', () => {
	it('starts <dir>/worker-<workerId>.log with who connected, and asks to enable shipping for a worker declaring the feature', () => {
		const logs = new WorkerConnectionLogs(dir, text => text, vi.fn());

		expect(logs.open(ws(), worker())).toBe(true);

		expect(lines()[0]).toBe(
			'dmn connected: worker w-1, pid 7, version sandbox-exec-m7, source sandbox-builder-1, labels a'
		);
		expect(lines()[1]).toMatch(/^dmn this worker ships its own output/);
	});

	it('says, with the worker version and the fix, that a worker without the feature ships nothing, and does not enable shipping', () => {
		const logs = new WorkerConnectionLogs(dir, text => text, vi.fn());

		expect(logs.open(ws(), worker({ features: [] }))).toBe(false);

		expect(lines()[1]).toContain(
			"version sandbox-exec-m7) does not ship its own output (it does not declare 'worker-logs')"
		);
		expect(lines()[1]).toContain('flow cli update');
	});

	it('does nothing for a worker the daemon forked (its process output is captured elsewhere)', () => {
		const logs = new WorkerConnectionLogs(dir, text => text, vi.fn());
		const socket = ws();

		expect(logs.open(socket, worker({ ephemeral: true }))).toBe(false);
		logs.note(socket, 'ignored');

		expect(fs.readdirSync(dir)).toEqual([]);
	});

	it('is a no-op for the ready sent again after each step on the same connection', () => {
		const logs = new WorkerConnectionLogs(dir, text => text, vi.fn());
		const socket = ws();
		expect(logs.open(socket, worker())).toBe(true);
		expect(logs.open(socket, worker())).toBe(false);
		expect(lines().filter(line => line.startsWith('dmn connected'))).toHaveLength(1);
	});

	it('reports a worker id that cannot be a file name, once, and keeps the worker unaffected', () => {
		const log = vi.fn();
		const logs = new WorkerConnectionLogs(dir, text => text, log);

		expect(logs.open(ws(), worker({ workerId: '../evil' }))).toBe(false);

		expect(log).toHaveBeenCalledWith('error', expect.stringContaining('cannot start its log'));
	});
});

describe('WorkerConnectionLogs.ship', () => {
	it('writes the shipped lines tagged by stream, masked by the daemon', () => {
		const logs = new WorkerConnectionLogs(dir, text => text.replaceAll('hunter2-secret', '***'), vi.fn());
		const socket = ws();
		logs.open(socket, worker());

		logs.ship(socket, { type: 'worker_log', stream: 'stdout', text: '[10:00:00] [wait] token=hunter2-secret\n' });
		logs.ship(socket, { type: 'worker_log', stream: 'stderr', text: 'boom\n' });

		expect(lines().slice(2)).toEqual(['out [10:00:00] [wait] token=***', 'err boom']);
	});

	it('masks with a placeholder when the masker throws, never the raw text', () => {
		const logs = new WorkerConnectionLogs(
			dir,
			() => {
				throw new Error('masker down');
			},
			vi.fn()
		);
		const socket = ws();
		logs.open(socket, worker());
		logs.ship(socket, { type: 'worker_log', stream: 'stdout', text: 'secret-text\n' });
		expect(fs.readFileSync(path.join(dir, 'worker-w-1.log'), 'utf8')).not.toContain('secret-text');
	});

	it('drops what exceeds the per-second volume and writes one counted marker, then accepts again in the next second', () => {
		let nowMs = 1_000_000;
		const logs = new WorkerConnectionLogs(dir, text => text, vi.fn(), { maxBytesPerSecond: 100, now: () => nowMs });
		const socket = ws();
		logs.open(socket, worker());

		logs.ship(socket, { type: 'worker_log', stream: 'stdout', text: `${'a'.repeat(80)}\n` });
		// 81 + 81 > 100: dropped.
		logs.ship(socket, { type: 'worker_log', stream: 'stdout', text: `${'b'.repeat(80)}\n` });
		nowMs += 1_001;
		logs.ship(socket, { type: 'worker_log', stream: 'stdout', text: 'c\n' });

		const text = lines().join('\n');
		expect(text).not.toContain('bbbb');
		expect(text).toContain(
			"[daemon] 81 characters of this worker's output were dropped (over 100 bytes per second"
		);
		expect(lines().at(-1)).toBe('out c');
	});

	it('cuts a message over the message cap and says so', () => {
		const logs = new WorkerConnectionLogs(dir, text => text, vi.fn(), { maxBytesPerSecond: 10_000_000 });
		const socket = ws();
		logs.open(socket, worker());

		logs.ship(socket, { type: 'worker_log', stream: 'stdout', text: `${'x'.repeat(70_000)}\n` });

		expect(lines().join('\n')).toMatch(/\[daemon\] 4465 characters of this worker's output were dropped/);
	});

	it('says what the worker itself dropped before this message', () => {
		const logs = new WorkerConnectionLogs(dir, text => text, vi.fn());
		const socket = ws();
		logs.open(socket, worker());
		logs.ship(socket, { type: 'worker_log', stream: 'stdout', text: 'x\n', dropped: 1234 });
		expect(lines().join('\n')).toContain(
			'[worker] 1234 characters of its output were dropped by the worker itself'
		);
	});

	it('ignores, and says once in the daemon log, a worker that ships without having been enabled', () => {
		const log = vi.fn();
		const logs = new WorkerConnectionLogs(dir, text => text, log);
		const socket = ws();
		logs.open(socket, worker({ features: [] }));

		logs.ship(socket, { type: 'worker_log', stream: 'stdout', text: 'sneaky\n' });
		logs.ship(socket, { type: 'worker_log', stream: 'stdout', text: 'sneaky\n' });

		expect(lines().join('\n')).not.toContain('sneaky');
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith('error', expect.stringContaining('without having been enabled'));
	});

	it('reports a worker_log from an unknown connection (a forked worker, or one that never registered) without throwing', () => {
		const log = vi.fn();
		const logs = new WorkerConnectionLogs(dir, text => text, log);
		expect(() => logs.ship(ws(), { type: 'worker_log', stream: 'stdout', text: 'x' })).not.toThrow();
		expect(log).toHaveBeenCalledWith('error', expect.stringContaining('without having been enabled'));
	});

	it('refuses a malformed message instead of writing it', () => {
		const log = vi.fn();
		const logs = new WorkerConnectionLogs(dir, text => text, log);
		const socket = ws();
		logs.open(socket, worker());
		logs.ship(socket, { type: 'worker_log', stream: 'weird', text: 'x' } as never);
		logs.ship(socket, { type: 'worker_log', stream: 'stdout', text: 42 } as never);
		expect(lines()).toHaveLength(2);
		expect(log).toHaveBeenCalledTimes(1);
		expect(log).toHaveBeenCalledWith('error', expect.stringContaining('malformed worker_log'));
	});
});

describe('WorkerConnectionLogs.close', () => {
	it('writes how the connection ended, flushes an open line, and forgets the connection', () => {
		const logs = new WorkerConnectionLogs(dir, text => text, vi.fn());
		const socket = ws();
		logs.open(socket, worker());
		logs.ship(socket, { type: 'worker_log', stream: 'stderr', text: 'half line' });

		logs.close(socket, 'worker w-1 disconnected (close code 1006)');
		logs.note(socket, 'after close: ignored');
		logs.close(socket, 'twice: ignored');

		expect(lines().slice(2)).toEqual(['dmn worker w-1 disconnected (close code 1006)', 'err half line']);
	});

	it('is a no-op for a connection with no log', () => {
		const logs = new WorkerConnectionLogs(dir, text => text, vi.fn());
		expect(() => logs.close(ws(), 'x')).not.toThrow();
	});
});
