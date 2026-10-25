import { spawn } from 'node:child_process';
import * as net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';

import { listListeningPorts, listOsProcesses, parseElapsed } from './OsProcessTable';

describe('parseElapsed', () => {
	it.each([
		['00:05', 5],
		['01:05', 65],
		['02:01:05', 7265],
		['5-13:00:00', 5 * 86400 + 13 * 3600],
	])('%s -> %i s', (etime, seconds) => {
		expect(parseElapsed(etime)).toBe(seconds);
	});

	it('returns undefined for something that is not an elapsed time', () => {
		expect(parseElapsed('soon')).toBeUndefined();
	});
});

describe('the real process table', () => {
	let child: ReturnType<typeof spawn> | undefined;
	let server: net.Server | undefined;

	afterEach(() => {
		if (child?.pid !== undefined) {
			try {
				process.kill(child.pid, 'SIGKILL');
			} catch {
				/* already gone */
			}
		}
		server?.close();
	});

	it('lists this process with its parent, command line and a plausible start time', () => {
		const table = listOsProcesses();

		const me = table.find(p => p.pid === process.pid);
		expect(me, 'the test process is missing from the process table').toBeDefined();
		expect(me!.ppid).toBeGreaterThan(0);
		expect(me!.commandLine).toContain('node');
		expect(me!.startedAt).toBeInstanceOf(Date);
		expect(me!.startedAt!.getTime()).toBeLessThanOrEqual(Date.now());
	}, 60_000);

	it('lists a child process spawned by this one under this pid', () => {
		child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore', windowsHide: true });

		const mine = listOsProcesses().find(p => p.pid === child!.pid);

		expect(mine?.ppid).toBe(process.pid);
	}, 60_000);

	it('reports the port this process listens on', async () => {
		server = net.createServer();
		await new Promise<void>(resolve => server!.listen(0, '127.0.0.1', resolve));
		const port = (server.address() as net.AddressInfo).port;

		const ports = listListeningPorts();

		if (ports === undefined) {
			throw new Error(
				'listListeningPorts() returned undefined: neither PowerShell nor lsof could list the listening ports here.'
			);
		}
		expect(ports.get(process.pid)).toContain(port);
	}, 60_000);
});
