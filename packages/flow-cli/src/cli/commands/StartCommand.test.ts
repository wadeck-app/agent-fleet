import { writePortFile } from '@wadeck-app/singleton-daemon-kit';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { armLauncherScriptLeakGuard } from '../../test-utils/LauncherScriptLeakGuard';
import { startDaemonCommand } from './StartCommand';

const harness = vi.hoisted(() => ({ spawn: vi.fn(), tmpdirOverride: null as string | null }));
vi.mock('node:child_process', () => ({ spawn: harness.spawn }));
// The spawner writes its launcher script to os.tmpdir(); the mocked wscript never runs it, so it would never delete itself.
vi.mock('node:os', async importOriginal => {
	const actual = await importOriginal<typeof import('node:os')>();
	return { ...actual, tmpdir: () => harness.tmpdirOverride ?? actual.tmpdir() };
});

armLauncherScriptLeakGuard();

let dir: string;
const servers: net.Server[] = [];

beforeEach(() => {
	harness.tmpdirOverride = null;
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-start-'));
	harness.tmpdirOverride = dir;
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

describe('flow start when the daemon cannot start', () => {
	it('prints the real cause and where to look on stderr, and exits 3', async () => {
		const stderr: string[] = [];
		const exit = vi.spyOn(process, 'exit').mockImplementation(code => {
			throw new Error(`exit ${String(code)}`);
		});
		const spawnFails = () =>
			Promise.reject(
				new Error('The daemon failed to start: "/p/.flow/config.yml" is no longer read.\nMove it: mv a b')
			);

		await expect(
			startDaemonCommand(
				dir,
				() => undefined,
				spawnFails,
				text => stderr.push(text)
			)
		).rejects.toThrow('exit 3');

		expect(exit).toHaveBeenCalledWith(3);
		const printed = stderr.join('');
		expect(printed).toContain('Daemon could not be started');
		expect(printed).toContain('is no longer read');
		expect(printed).toContain('Move it: mv a b');
		expect(printed).toContain('flow logs');
		expect(printed).not.toMatch(/\bat .*:\d+:\d+/);
		exit.mockRestore();
	});
});
