import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WORKER_PORT_FILE, publishWorkerPort, removeWorkerPort } from './publishWorkerPort.js';

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

	describe('removeWorkerPort', () => {
		it('removes the file when it names the given port', () => {
			publishWorkerPort(tmpDir, 4321);

			removeWorkerPort(tmpDir, 4321);

			expect(fs.existsSync(path.join(tmpDir, WORKER_PORT_FILE))).toBe(false);
		});

		// A daemon that replaced this one may have published already; removing its file would strand every worker.
		it("keeps a file that names another daemon's port", () => {
			publishWorkerPort(tmpDir, 5555);

			removeWorkerPort(tmpDir, 4321);

			expect(JSON.parse(fs.readFileSync(path.join(tmpDir, WORKER_PORT_FILE), 'utf8'))).toEqual({ port: 5555 });
		});

		it('is a no-op when there is no file', () => {
			expect(() => removeWorkerPort(tmpDir, 4321)).not.toThrow();
		});

		it('says so on stderr when the file cannot be read as a worker port, and leaves it', () => {
			const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
			fs.writeFileSync(path.join(tmpDir, WORKER_PORT_FILE), 'not json');

			removeWorkerPort(tmpDir, 4321);

			expect(stderr).toHaveBeenCalledWith(expect.stringContaining(WORKER_PORT_FILE));
			expect(fs.existsSync(path.join(tmpDir, WORKER_PORT_FILE))).toBe(true);
		});
	});

	it('says so on stderr when the port cannot be written', () => {
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		publishWorkerPort(path.join(tmpDir, 'missing', 'dir'), 4321);

		expect(stderr).toHaveBeenCalledWith(
			expect.stringContaining('Externally launched workers will not be able to connect.')
		);
	});
});
