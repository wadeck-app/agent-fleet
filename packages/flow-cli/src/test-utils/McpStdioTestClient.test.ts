import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { McpStdioTestClient } from './McpStdioTestClient';

// A server that answers `echo` with its params, stays silent for `silent`, and exits 7 on `quit`.
const SERVER = `
const readline = require('node:readline');
process.stderr.write('server started');
readline.createInterface({ input: process.stdin }).on('line', line => {
	const request = JSON.parse(line);
	if (request.method === 'quit') process.exit(7);
	if (request.method === 'silent' || request.id === undefined) return;
	process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result: { method: request.method, params: request.params } }) + '\\n');
});
`;

describe('McpStdioTestClient', () => {
	let directory: string;
	let serverPath: string;
	let client: McpStdioTestClient | null = null;

	beforeAll(() => {
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-mcp-client-'));
		serverPath = path.join(directory, 'server.cjs');
		fs.writeFileSync(serverPath, SERVER);
	});
	afterAll(() => fs.rmSync(directory, { recursive: true, force: true }));
	afterEach(() => client?.kill());

	const start = (): McpStdioTestClient =>
		(client = new McpStdioTestClient([process.execPath, serverPath], process.env));

	it('matches each response to its request by id', async () => {
		const subject = start();
		const [first, second] = await Promise.all([
			subject.request('echo', { n: 1 }),
			subject.request('echo', { n: 2 }),
		]);
		expect(first.result).toEqual({ method: 'echo', params: { n: 1 } });
		expect(second.result).toEqual({ method: 'echo', params: { n: 2 } });
		expect(first.id).not.toBe(second.id);
	});

	it('sends a notification without an id and records nothing for it', async () => {
		const subject = start();
		subject.notify('anything', { a: 1 });
		await subject.request('echo', {});
		expect(subject.stdoutLines).toHaveLength(1);
	});

	it('initialize sends the request then the initialized notification', async () => {
		const subject = start();
		const response = await subject.initialize();
		expect(response.result.method).toBe('initialize');
	});

	it('rejects with the method name and the stderr when the server does not answer', async () => {
		const subject = start();
		await expect(subject.request('silent', {}, 200)).rejects.toThrow(/no response to 'silent'.*server started/);
	});

	it('reports the exit code and exposes everything the server wrote', async () => {
		const subject = start();
		await subject.request('echo', {});
		subject.notify('quit');
		expect(await subject.exited).toBe(7);
		expect(subject.everythingWritten).toContain('server started');
		expect(subject.everythingWritten).toContain('"method":"echo"');
	});

	it('refuses an empty command', () => {
		expect(() => new McpStdioTestClient([], {})).toThrow(/command is empty/);
	});
});
