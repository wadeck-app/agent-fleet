import { createDaemon } from '@wadeck-app/singleton-daemon-kit';
import { removeTempDirectory } from 'flow-core/testing';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { removeStaleDaemonFiles } from './StaleDaemonFiles.js';
import { WORKER_PORT_FILE } from './publishWorkerPort.js';

describe('removeStaleDaemonFiles', () => {
	let dir: string;

	beforeEach(() => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-stale-files-'));
	});

	afterEach(() => {
		removeTempDirectory(dir);
	});

	it('removes the worker port a dead daemon left behind, and says which files and why', async () => {
		fs.writeFileSync(path.join(dir, WORKER_PORT_FILE), JSON.stringify({ port: 47_999 }));
		fs.writeFileSync(path.join(dir, 'config.port.tmp'), '{');

		const removed = await removeStaleDaemonFiles(dir);

		expect(removed).toEqual([WORKER_PORT_FILE, 'config.port.tmp']);
		expect(fs.readdirSync(dir)).toEqual([]);
	});

	it('does nothing in a clean directory', async () => {
		expect(await removeStaleDaemonFiles(dir)).toEqual([]);
	});

	// The files of a daemon that is answering are its own, whatever their age.
	it('leaves everything alone while a daemon answers on the published port', async () => {
		const live = await createDaemon({
			configDir: dir,
			appVersion: 'test',
			port: 0,
			idleTimeout: null,
			commands: {},
		});
		try {
			fs.writeFileSync(path.join(dir, WORKER_PORT_FILE), JSON.stringify({ port: 47_999 }));

			const removed = await removeStaleDaemonFiles(dir);

			expect(removed).toEqual([]);
			expect(fs.existsSync(path.join(dir, WORKER_PORT_FILE))).toBe(true);
		} finally {
			await live.stop('signal');
		}
	});
});
