import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WORKER_PORT_FILE, publishWorkerPort } from './publishWorkerPort.js';

describe('publishWorkerPort', () => {
	let tmpDir: string;

	beforeEach(() => {
		tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-worker-port-'));
	});

	afterEach(() => {
		vi.restoreAllMocks();
		fs.rmSync(tmpDir, { recursive: true, force: true });
	});

	it('writes the bound port as JSON', () => {
		publishWorkerPort(tmpDir, 4321);

		expect(JSON.parse(fs.readFileSync(path.join(tmpDir, WORKER_PORT_FILE), 'utf8'))).toEqual({ port: 4321 });
	});

	it('says so on stderr when the port cannot be written', () => {
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		publishWorkerPort(path.join(tmpDir, 'missing', 'dir'), 4321);

		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining('Externally launched workers will not be able to connect.')
		);
	});
});
