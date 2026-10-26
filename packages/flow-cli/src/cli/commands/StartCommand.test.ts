import { writePortFile } from '@wadeck-app/singleton-daemon-kit';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { startDaemonCommand } from './StartCommand';

const harness = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock('node:child_process', () => ({ spawn: harness.spawn }));

let dir: string;
const servers: net.Server[] = [];

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-start-'));
});
afterEach(async () => {
	await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))));
	removeTempDirectory(dir);
});

/** What a daemon does when it comes up: listen, then publish the port. */
async function bringUpDaemon(): Promise<void> {
	const server = net.createServer(socket => socket.destroy());
	servers.push(server);
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	await writePortFile(dir, (server.address() as net.AddressInfo).port, process.pid);
}

describe('flow start', () => {
	it('starts ONE daemon when several `flow start` run at once on a cold machine', async () => {
		harness.spawn.mockImplementation(() => {
			void delay(150).then(bringUpDaemon);
			return { unref: () => undefined };
		});
		const lines: string[] = [];

		await Promise.all([1, 2, 3, 4].map(() => startDaemonCommand(dir, line => lines.push(line))));

		expect(harness.spawn).toHaveBeenCalledTimes(1);
		expect(lines.filter(line => line.includes('daemon started'))).toHaveLength(1);
		expect(lines.filter(line => line.includes('already running'))).toHaveLength(3);
	});

	it('does not spawn when a daemon already answers', async () => {
		await bringUpDaemon();
		const lines: string[] = [];

		await startDaemonCommand(dir, line => lines.push(line));

		expect(harness.spawn).not.toHaveBeenCalled();
		expect(lines).toEqual(['[ok] daemon already running\n']);
	});
});
