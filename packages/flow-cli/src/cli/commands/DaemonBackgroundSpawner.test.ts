import { readPortFile, writePortFile } from '@wadeck-app/singleton-daemon-kit';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { spawnDaemonBackground } from './DaemonBackgroundSpawner';

const harness = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: harness.spawn }));

let dir: string;
const servers: net.Server[] = [];

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-spawner-'));
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
