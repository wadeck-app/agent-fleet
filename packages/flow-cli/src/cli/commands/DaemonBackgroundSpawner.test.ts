import { readPortFile, writePortFile } from '@wadeck-app/singleton-daemon-kit';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { recordDaemonStartError } from '../../daemon/DaemonStartError';
import { spawnDaemonBackground } from './DaemonBackgroundSpawner';

const harness = vi.hoisted(() => ({ spawn: vi.fn(), tmpdirOverride: null as string | null }));
vi.mock('node:child_process', () => ({ spawn: harness.spawn }));
// The launcher script is written to os.tmpdir(); the mocked wscript never runs it, so it would never delete itself.
vi.mock('node:os', async importOriginal => {
	const actual = await importOriginal<typeof import('node:os')>();
	return { ...actual, tmpdir: () => harness.tmpdirOverride ?? actual.tmpdir() };
});

let dir: string;
const servers: net.Server[] = [];

beforeEach(() => {
	harness.tmpdirOverride = null;
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-spawner-'));
	harness.tmpdirOverride = dir;
});
afterEach(async () => {
	await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))));
	removeTempDirectory(dir);
});

/** What a daemon does when it comes up: listen, then publish the port. */
async function bringUpDaemon(): Promise<number> {
	const server = net.createServer(socket => socket.destroy());
	servers.push(server);
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	const port = (server.address() as net.AddressInfo).port;
	await writePortFile(dir, port, process.pid);
	return port;
}

describe('spawnDaemonBackground', () => {
	it('does not spawn, nor touch the port file, when a daemon is already live', async () => {
		const port = await bringUpDaemon();

		await spawnDaemonBackground(dir, 2000);

		expect(harness.spawn).not.toHaveBeenCalled();
		expect((await readPortFile(dir))?.port).toBe(port);
	});

	it('starts ONE daemon for concurrent callers on a cold directory', async () => {
		// The spawned process takes a moment to come up, like a real daemon.
		harness.spawn.mockImplementation(() => {
			void delay(150).then(bringUpDaemon);
			return { unref: () => undefined };
		});

		await Promise.all([1, 2, 3, 4].map(() => spawnDaemonBackground(dir, 5000)));

		expect(harness.spawn).toHaveBeenCalledTimes(1);
	});

	it('replaces a stale port file (nothing listening) by a fresh daemon', async () => {
		await writePortFile(dir, 1, process.pid);
		harness.spawn.mockImplementation(() => {
			void delay(50).then(bringUpDaemon);
			return { unref: () => undefined };
		});

		await spawnDaemonBackground(dir, 5000);

		expect(harness.spawn).toHaveBeenCalledTimes(1);
		expect((await readPortFile(dir))?.port).not.toBe(1);
	});
});

describe('spawnDaemonBackground when the daemon dies while starting', () => {
	it('fails at once with the recorded cause instead of waiting for the timeout', async () => {
		harness.spawn.mockImplementation(() => {
			void delay(100).then(() =>
				recordDaemonStartError(dir, new Error('"/p/.flow/config.yml" is no longer read.\nMove it: mv a b'), {})
			);
			return { unref: () => undefined };
		});
		const startedAt = Date.now();

		const failure = await spawnDaemonBackground(dir, 5000).catch((err: unknown) => err as Error);

		expect(failure).toBeInstanceOf(Error);
		expect((failure as Error).message).toContain('is no longer read');
		expect((failure as Error).message).toContain('Move it: mv a b');
		expect((failure as Error).message).not.toContain('did not start within');
		expect(Date.now() - startedAt).toBeLessThan(3000);
	});

	it('ignores an error recorded by an earlier failed start', async () => {
		recordDaemonStartError(dir, new Error('old failure'), {});
		harness.spawn.mockImplementation(() => {
			void delay(50).then(bringUpDaemon);
			return { unref: () => undefined };
		});

		await expect(spawnDaemonBackground(dir, 5000)).resolves.toBe(true);
	});

	it('keeps the timeout message, with where to look, when no cause was recorded', async () => {
		harness.spawn.mockImplementation(() => ({ unref: () => undefined }));

		const failure = await spawnDaemonBackground(dir, 300).catch((err: unknown) => err as Error);

		expect((failure as Error).message).toContain('did not start within 300ms');
		expect((failure as Error).message).toContain('flow logs');
	});
});
