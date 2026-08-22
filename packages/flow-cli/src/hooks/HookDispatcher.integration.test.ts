import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { HookDispatcher } from 'shared-cli/HookDispatcher';

// Real integration tests — no mocks of execFile or http.request.

let tempFile: string | null = null;

afterEach(() => {
	if (tempFile !== null && fs.existsSync(tempFile)) {
		fs.unlinkSync(tempFile);
		tempFile = null;
	}
});

describe('HookDispatcher (integration)', () => {
	describe('CLI hook', () => {
		it('writes the payload env var to a temp file via a real node subprocess', async () => {
			tempFile = path.join(os.tmpdir(), `hook-test-${Date.now()}.txt`);

			const dispatcher = new HookDispatcher({
				onFlowStart: [
					{
						type: 'cli',
						command: 'node',
						args: [
							'-e',
							"require('fs').appendFileSync(process.env.OUT_FILE, process.env.EXECUTION_ID + '\\n')",
						],
						// OUT_FILE must be in hook.env so it is forwarded to the subprocess
						env: { OUT_FILE: tempFile },
					},
				],
			});

			await dispatcher.dispatch('onFlowStart', { executionId: 'test-123' });

			expect(fs.existsSync(tempFile)).toBe(true);
			const contents = fs.readFileSync(tempFile, 'utf-8');
			expect(contents.trim()).toBe('test-123');
		}, 15_000);
	});

	describe('HTTP hook — negative (ECONNREFUSED)', () => {
		it('resolves without throwing when the server actively refuses the connection', async () => {
			// Port 1 is in the well-known reserved range and is always refused.
			let capturedError: unknown = null;

			const dispatcher = new HookDispatcher({
				onFlowEnd: [{ type: 'http', url: 'http://127.0.0.1:1/hook' }],
			});

			await expect(
				dispatcher.dispatch('onFlowEnd', { executionId: 'x' }, err => {
					capturedError = err;
				})
			).resolves.toBeUndefined();

			// The onError callback must have been invoked with a connection error.
			expect(capturedError).toBeInstanceOf(Error);
			expect((capturedError as NodeJS.ErrnoException).code).toMatch(/^ECONNREFUSED|^EADDRNOTAVAIL/);
		}, 15_000);
	});

	describe('HTTP hook — positive (real local server)', () => {
		it('POSTs the correct JSON body to a real local HTTP server', async () => {
			// Spin up a minimal server on a dynamic port.
			let receivedBody: unknown = null;
			const server = http.createServer((req, res) => {
				let data = '';
				req.on('data', chunk => {
					data += chunk;
				});
				req.on('end', () => {
					// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
					receivedBody = JSON.parse(data);
					res.writeHead(200);
					res.end();
				});
			});

			await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));

			const address = server.address() as { port: number };
			const port = address.port;

			const dispatcher = new HookDispatcher({
				onFlowStart: [
					{
						type: 'http',
						url: `http://127.0.0.1:${port}/hook`,
						method: 'POST',
					},
				],
			});

			try {
				await dispatcher.dispatch('onFlowStart', { executionId: 'abc' });

				expect(receivedBody).toEqual({ executionId: 'abc' });
			} finally {
				await new Promise<void>((resolve, reject) => server.close(err => (err ? reject(err) : resolve())));
			}
		}, 15_000);
	});
});
