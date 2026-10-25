import { UpdateManager } from '@wadeck-app/shared-cli';
import { readPortFile } from '@wadeck-app/singleton-daemon-kit';
import { executionsDirOf, logsDirOf } from 'flow-core';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowConfigLoader } from '../config/FlowConfig.js';
import { ExecutionStore } from '../storage/ExecutionStore';
import { Daemon } from './Daemon.js';

const CONFIG = { ...FlowConfigLoader.DEFAULT, worker: { ...FlowConfigLoader.DEFAULT.worker, wsPort: 0 } };

let tmpDir: string;
const started: { stop: (reason?: 'idle' | 'signal') => Promise<void> }[] = [];

beforeEach(() => {
	tmpDir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-daemon-singleton-')));
	// The daemon schedules a real updater child otherwise.
	vi.spyOn(UpdateManager.prototype, 'scheduleBackgroundUpdate').mockImplementation(() => {});
});

afterEach(async () => {
	for (const handle of started.splice(0)) await handle.stop('idle');
	removeTempDirectory(tmpDir);
});

function logMessages(): string[] {
	const logFile = path.join(logsDirOf(tmpDir), `${new Date().toISOString().slice(0, 10)}.ndjson`);
	if (!fs.existsSync(logFile)) return [];
	return fs
		.readFileSync(logFile, 'utf8')
		.trim()
		.split('\n')
		.map(line => (JSON.parse(line) as { msg: string }).msg);
}

async function startDaemon(existingDaemon: 'yield' | 'takeover') {
	const handle = await Daemon.start(CONFIG, tmpDir, { port: 0, existingDaemon });
	started.push(handle);
	return handle;
}

describe('Daemon singleton ownership', () => {
	it('a daemon started while another one is live leaves it, and its executions, untouched', async () => {
		const incumbent = await startDaemon('yield');
		const portFileBefore = await readPortFile(tmpDir);
		// What the live daemon accepted a moment before the second one came up.
		const store = new ExecutionStore(executionsDirOf(tmpDir), 30);
		store.create({ executionId: 'live0001', flowFile: 'flows/a.yaml', flowId: 'a', stepIds: ['s'] });
		store.markStepRunning('live0001', 's');

		const loser = await startDaemon('yield');

		expect(store.read('live0001').status).toBe('running');
		expect(await readPortFile(tmpDir)).toEqual(portFileBefore);
		expect(loser.port).toBe(incumbent.port);
		const messages = logMessages();
		expect(messages.filter(m => m.startsWith('Daemon started'))).toHaveLength(1);
		expect(messages.filter(m => m.startsWith('Reconciled'))).toHaveLength(1);
		const yielded = messages.filter(m => m.includes('already owns'));
		expect(yielded).toHaveLength(1);
		expect(yielded[0]).toContain(`pid ${String(process.pid)}`);
		expect(yielded[0]).toContain(`port ${String(incumbent.port)}`);
	});

	it('concurrent cold starts leave exactly one daemon that did its start-up work', async () => {
		await Promise.all(Array.from({ length: 4 }, () => startDaemon('yield')));

		const messages = logMessages();
		expect(messages.filter(m => m.startsWith('Daemon started'))).toHaveLength(1);
		expect(messages.filter(m => m.startsWith('Reconciled'))).toHaveLength(1);
		expect(messages.filter(m => m.includes('already owns'))).toHaveLength(3);
	});

	it('a daemon asked to take over still replaces the live one', async () => {
		await startDaemon('yield');
		const replacement = await startDaemon('takeover');

		const info = await readPortFile(tmpDir);
		expect(info?.port).toBe(replacement.port);
		expect(logMessages().filter(m => m.startsWith('Daemon started'))).toHaveLength(2);
	});

	it('logs the pid of the daemon that stops, whatever the reason', async () => {
		const handle = await startDaemon('yield');

		await handle.stop('signal');

		expect(logMessages()).toContain(`Daemon stopped (signal) (pid ${String(process.pid)})`);
	});
});
