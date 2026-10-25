import { writePortFile } from '@wadeck-app/singleton-daemon-kit';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { findLiveDaemon } from './LiveDaemonProbe';

let dir: string;
let server: net.Server | undefined;

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-live-probe-'));
});
afterEach(async () => {
	await new Promise<void>(resolve => (server ? server.close(() => resolve()) : resolve()));
	server = undefined;
	removeTempDirectory(dir);
});

async function listen(): Promise<number> {
	server = net.createServer(socket => socket.destroy());
	await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
	return (server.address() as net.AddressInfo).port;
}

describe('findLiveDaemon', () => {
	it('is null without a port file', async () => {
		expect(await findLiveDaemon(dir)).toBeNull();
	});

	it('returns the pid and port of a daemon that answers on its published port', async () => {
		const port = await listen();
		await writePortFile(dir, port, process.pid);

		expect(await findLiveDaemon(dir)).toEqual({ pid: process.pid, port });
	});

	it('is null when nothing listens on the published port (stale file)', async () => {
		const port = await listen();
		await new Promise<void>(resolve => server!.close(() => resolve()));
		server = undefined;
		await writePortFile(dir, port, process.pid);

		expect(await findLiveDaemon(dir)).toBeNull();
	});
});
