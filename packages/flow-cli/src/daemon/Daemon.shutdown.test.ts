/**
 * Every way the daemon stops must leave nothing behind that keeps its process alive or misleads the next reader.
 *
 * Orphaned daemons (no port file, process alive, worker listener still bound) accumulated on a developer machine; each
 * test here is one way a daemon used to stay up, or leave a file pointing at a port nobody serves.
 * The OS-process level counterpart, against the real bundle, is DaemonShutdown.integration.test.ts.
 */
import { UpdateManager } from '@wadeck-app/shared-cli';
import { readPortFile } from '@wadeck-app/singleton-daemon-kit';
import { logsDirOf } from 'flow-core';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WebSocket } from 'ws';

import { FlowConfigLoader } from '../config/FlowConfig.js';
import { observeFor, pollUntil, settlesWithin } from '../test-utils/WaitHelpers';
import { Daemon } from './Daemon.js';
import { WORKER_PORT_FILE } from './publishWorkerPort.js';

const CONFIG = { ...FlowConfigLoader.DEFAULT, worker: { ...FlowConfigLoader.DEFAULT.worker, wsPort: 0 } };

let daemonDir: string;
const started: { stop: (reason?: 'idle' | 'signal') => Promise<void> }[] = [];

beforeEach(() => {
	daemonDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-daemon-shutdown-')));
	// The daemon schedules a real updater child otherwise.
	vi.spyOn(UpdateManager.prototype, 'scheduleBackgroundUpdate').mockImplementation(() => {});
});

afterEach(async () => {
	for (const handle of started.splice(0)) await handle.stop('idle');
	removeTempDirectory(daemonDir);
});

function logMessages(): string[] {
	const logFile = path.join(logsDirOf(daemonDir), `${new Date().toISOString().slice(0, 10)}.ndjson`);
	if (!fs.existsSync(logFile)) return [];
	return fs
		.readFileSync(logFile, 'utf8')
		.trim()
		.split('\n')
		.map(line => (JSON.parse(line) as { msg: string }).msg);
}

async function startDaemon(options: Parameters<typeof Daemon.start>[2] = {}) {
	const handle = await Daemon.start(CONFIG, daemonDir, { port: 0, ...options });
	started.push(handle);
	return handle;
}

async function workerPort(): Promise<number> {
	const file = path.join(daemonDir, WORKER_PORT_FILE);
	const published = await pollUntil(() => fs.existsSync(file), { timeoutMs: 10_000 });
	expect(published, `the daemon never published ${file}`).toBe(true);
	return (JSON.parse(fs.readFileSync(file, 'utf8')) as { port: number }).port;
}

/** What `flow stop` does. */
async function quitViaHttp(): Promise<void> {
	const data = await readPortFile(daemonDir);
	const token = fs.readFileSync(path.join(daemonDir, 'health_token'), 'utf8').trim();
	await new Promise<void>((resolve, reject) => {
		const req = http.request(
			{
				hostname: '127.0.0.1',
				port: data!.port,
				method: 'POST',
				path: '/quit',
				headers: { Authorization: `Bearer ${token}` },
			},
			res => {
				res.resume();
				res.on('end', resolve);
			}
		);
		req.on('error', reject);
		req.end();
	});
}

describe('idle shutdown without any worker', () => {
	// A run refused before dispatch (or `flow start` and nothing else) never causes a worker message, which used to be
	// the only thing that asked the daemon whether it was idle.
	it('stops a daemon that nothing ever used', async () => {
		await startDaemon({ idleCheckIntervalMs: 100 });

		const stopped = await pollUntil(async () => (await readPortFile(daemonDir)) === null, { timeoutMs: 10_000 });

		expect(stopped, `still running; log: ${logMessages().join(' | ')}`).toBe(true);
		expect(logMessages().some(message => message.startsWith('Daemon stopped (idle)'))).toBe(true);
	});

	it('stays up when it was started to stay up (stopWhenIdle: false)', async () => {
		await startDaemon({ idleCheckIntervalMs: 50, stopWhenIdle: false });

		await observeFor(600);

		expect(await readPortFile(daemonDir)).not.toBeNull();
	});

	it('refuses an interval that is not a positive number rather than never checking', async () => {
		await expect(startDaemon({ idleCheckIntervalMs: 0 })).rejects.toThrow(/idleCheckIntervalMs/);
	});
});

describe('start after a daemon that died without cleaning up', () => {
	it('removes what it left and says so in the log', async () => {
		fs.writeFileSync(path.join(daemonDir, 'config.port.tmp'), '{');

		await startDaemon({ stopWhenIdle: false });

		expect(fs.existsSync(path.join(daemonDir, 'config.port.tmp'))).toBe(false);
		expect(logMessages().some(message => message.includes('Removed config.port.tmp'))).toBe(true);
	});
});

describe('stop by command (flow stop)', () => {
	it('disconnects a peer that connected but never registered', async () => {
		await startDaemon({ stopWhenIdle: false });
		const peer = new WebSocket(`ws://127.0.0.1:${String(await workerPort())}`);
		await new Promise<void>((resolve, reject) => {
			peer.once('open', () => resolve());
			peer.once('error', reject);
		});
		const closed = new Promise<void>(resolve => peer.once('close', () => resolve()));

		await quitViaHttp();

		expect(
			await settlesWithin(closed, 8_000),
			'a connected socket keeps the daemon process alive after its port file is gone'
		).toBe(true);
	});

	it('removes the worker port it published, so nobody dials a port the daemon no longer serves', async () => {
		await startDaemon({ stopWhenIdle: false });
		await workerPort();

		await quitViaHttp();

		const removed = await pollUntil(() => !fs.existsSync(path.join(daemonDir, WORKER_PORT_FILE)), {
			timeoutMs: 8_000,
		});
		expect(removed).toBe(true);
	});
});
