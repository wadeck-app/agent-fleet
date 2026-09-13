import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { watchForDaemon } from './DaemonWatch.js';

let dir: string;
let stop: (() => void) | undefined;

beforeEach(() => {
	dir = mkdtempSync(join(tmpdir(), 'daemon-watch-'));
});

afterEach(() => {
	stop?.();
	stop = undefined;
	rmSync(dir, { recursive: true, force: true });
});

describe('watchForDaemon', () => {
	// The point of the whole thing: the daemon publishes worker.port when it is ready to accept
	// workers. A worker that watches for it reconnects at once, instead of sleeping out a backoff
	// that can be 30s long and learning about the daemon far too late.
	it('fires when the daemon publishes its worker port', async () => {
		let fired = 0;
		stop = watchForDaemon(dir, () => {
			fired++;
		});

		writeFileSync(join(dir, 'worker.port'), JSON.stringify({ port: 4101 }), 'utf8');

		await vi.waitFor(() => expect(fired).toBeGreaterThan(0), { interval: 10, timeout: 3000 });
	});

	it('fires again when a new daemon publishes a new port', async () => {
		let fired = 0;
		stop = watchForDaemon(dir, () => {
			fired++;
		});

		writeFileSync(join(dir, 'worker.port'), JSON.stringify({ port: 4101 }), 'utf8');
		await vi.waitFor(() => expect(fired).toBeGreaterThan(0), { interval: 10, timeout: 3000 });
		const afterFirst = fired;

		writeFileSync(join(dir, 'worker.port'), JSON.stringify({ port: 4202 }), 'utf8');
		await vi.waitFor(() => expect(fired).toBeGreaterThan(afterFirst), { interval: 10, timeout: 3000 });
	});

	it('ignores other files in the directory', async () => {
		let fired = 0;
		stop = watchForDaemon(dir, () => {
			fired++;
		});

		writeFileSync(join(dir, 'config.port'), JSON.stringify({ port: 4100 }), 'utf8');
		writeFileSync(join(dir, 'health_token'), 'abc', 'utf8');

		await new Promise(resolve => setTimeout(resolve, 200));
		expect(fired).toBe(0);
	});

	it('stops firing once disposed', async () => {
		let fired = 0;
		const dispose = watchForDaemon(dir, () => {
			fired++;
		});
		dispose();

		writeFileSync(join(dir, 'worker.port'), JSON.stringify({ port: 4101 }), 'utf8');

		await new Promise(resolve => setTimeout(resolve, 200));
		expect(fired).toBe(0);
	});

	// A directory that cannot be watched must not take the worker down: the backoff is still there,
	// so the worst case is the old behaviour rather than a crash.
	it('returns a disposer even when the directory cannot be watched', () => {
		const dispose = watchForDaemon(join(dir, 'does-not-exist'), () => undefined);

		expect(() => {
			dispose();
		}).not.toThrow();
	});
});
