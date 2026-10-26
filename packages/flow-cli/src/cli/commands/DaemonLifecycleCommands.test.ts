import { writePortFile } from '@wadeck-app/singleton-daemon-kit';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as http from 'node:http';
import type * as net from 'node:net';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { printDaemonPid, runStatusCommand, runStopCommand } from './DaemonLifecycleCommands';

const daemon = vi.hoisted(() => ({ isRunning: vi.fn(), version: vi.fn() }));
vi.mock('flow-core', async importOriginal => ({
	...(await importOriginal<typeof import('flow-core')>()),
	createRemoteDaemonClient: () => ({ isRunning: daemon.isRunning, version: daemon.version }),
}));

let dir: string;
let out: string[];
let err: string[];
const servers: http.Server[] = [];

beforeEach(() => {
	dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-lifecycle-'));
	out = [];
	err = [];
	vi.spyOn(process.stdout, 'write').mockImplementation(text => {
		out.push(String(text));
		return true;
	});
	vi.spyOn(process.stderr, 'write').mockImplementation(text => {
		err.push(String(text));
		return true;
	});
	vi.spyOn(process, 'exit').mockImplementation(code => {
		throw new Error(`exit ${String(code)}`);
	});
});

async function closeServers(): Promise<void> {
	await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))));
}

afterEach(async () => {
	vi.restoreAllMocks();
	daemon.isRunning.mockReset();
	daemon.version.mockReset();
	await closeServers();
	removeTempDirectory(dir);
});

const errno = (code: string, message = 'x'): Error => Object.assign(new Error(message), { code });

async function publishDaemon(handler: http.RequestListener): Promise<void> {
	const server = http.createServer(handler);
	servers.push(server);
	await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
	await writePortFile(dir, (server.address() as net.AddressInfo).port, process.pid);
	fs.writeFileSync(path.join(dir, 'health_token'), 'tok');
}

describe('flow stop', () => {
	it('says the daemon is not running, exit 2, when there is no port file', async () => {
		await expect(runStopCommand(dir)).rejects.toThrow('exit 2');
		expect(out.join('')).toContain('daemon not running');
	});

	it('stops a running daemon', async () => {
		await publishDaemon((_req, res) => res.end('ok'));
		await runStopCommand(dir);
		expect(out.join('')).toContain('[ok] daemon stopped');
	});

	it('treats a daemon that hangs up on the quit request as not running, exit 2', async () => {
		await publishDaemon(req => req.socket.destroy());
		await expect(runStopCommand(dir)).rejects.toThrow('exit 2');
		expect(out.join('') + err.join('')).toContain('daemon not running');
	});

	it('treats a refused connection (stale port file) as not running, exit 2', async () => {
		await publishDaemon((_req, res) => res.end('ok'));
		await closeServers();
		await expect(runStopCommand(dir)).rejects.toThrow('exit 2');
		expect(out.join('') + err.join('')).toContain('daemon not running');
	});
});

describe('flow status', () => {
	it('reports stopped when no daemon is serving, including a closing one', async () => {
		daemon.isRunning.mockRejectedValue(errno('ECONNRESET', 'socket hang up'));
		await runStatusCommand(dir, false);
		expect(out.join('')).toBe('[flow] stopped\n');
	});

	it('reports a daemon that fails for another reason with the cause, exit 1', async () => {
		daemon.isRunning.mockRejectedValue(new Error('health check exploded'));
		await expect(runStatusCommand(dir, false)).rejects.toThrow('exit 1');
		expect(err.join('')).toContain('health check exploded');
		expect(err.join('')).toContain('flow logs');
	});

	it('prints the cause on stderr when only the version query fails, and still reports running', async () => {
		daemon.isRunning.mockResolvedValue(true);
		daemon.version.mockRejectedValue(new Error('version exploded'));
		await runStatusCommand(dir, false);
		expect(out.join('')).toContain('running (version query failed)');
		expect(err.join('')).toContain('version exploded');
	});

	it('prints the running state as JSON', async () => {
		daemon.isRunning.mockResolvedValue(true);
		daemon.version.mockResolvedValue({ version: '1.2.3', pid: 42 });
		await runStatusCommand(dir, true);
		expect(JSON.parse(out.join(''))).toEqual({ running: true, version: '1.2.3', pid: 42 });
	});
});

describe('flow --pid', () => {
	it('prints the pid', async () => {
		daemon.version.mockResolvedValue({ version: '1', pid: 7 });
		await printDaemonPid(dir);
		expect(out.join('')).toBe('pid=7\n');
	});

	it('says not running, exit 2, when no daemon is serving', async () => {
		daemon.version.mockRejectedValue(errno('EPIPE'));
		await expect(printDaemonPid(dir)).rejects.toThrow('exit 2');
		expect(out.join('')).toContain('daemon not running');
	});

	it('prints the cause, exit 1, for any other failure', async () => {
		daemon.version.mockRejectedValue(new Error('version exploded'));
		await expect(printDaemonPid(dir)).rejects.toThrow('exit 1');
		expect(err.join('')).toContain('version exploded');
	});
});
