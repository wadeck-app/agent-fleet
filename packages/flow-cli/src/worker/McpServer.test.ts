import * as http from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { InjectedStep } from '../ipc/Protocol.js';
import { McpServer } from './McpServer.js';

function postLargeBody(port: number, size: number): Promise<void> {
	return new Promise((resolve, reject) => {
		const req = http.request(
			{
				hostname: '127.0.0.1',
				port,
				path: '/mcp',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': size,
				},
			},
			res => {
				res.resume();
				res.on('end', () => resolve());
			}
		);
		req.on('error', reject);
		const chunkSize = Math.min(size, 64 * 1024);
		const chunk = Buffer.alloc(chunkSize, 'x');
		let written = 0;
		function writeNext() {
			while (written < size) {
				const remaining = size - written;
				const toWrite = chunk.subarray(0, Math.min(remaining, chunkSize));
				written += toWrite.length;
				if (!req.write(toWrite)) {
					req.once('drain', writeNext);
					return;
				}
			}
			req.end();
		}
		writeNext();
	});
}

function postMcp(port: number, body: unknown): Promise<{ status: number; data: unknown }> {
	return new Promise((resolve, reject) => {
		const bodyStr = JSON.stringify(body);
		const req = http.request(
			{
				hostname: '127.0.0.1',
				port,
				path: '/mcp',
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(bodyStr),
				},
			},
			res => {
				let data = '';
				res.on('data', chunk => {
					data += String(chunk);
				});
				res.on('end', () => {
					resolve({ status: res.statusCode ?? 0, data: JSON.parse(data) });
				});
			}
		);
		req.on('error', reject);
		req.write(bodyStr);
		req.end();
	});
}

describe('McpServer', () => {
	let server: McpServer;
	let port: number;
	let onInjectSteps: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		onInjectSteps = vi.fn().mockResolvedValue(undefined) as unknown as ReturnType<typeof vi.fn>;
		server = new McpServer('exec-test', onInjectSteps as unknown as (steps: InjectedStep[]) => Promise<void>);
		const result = await server.start();
		port = result.port;
	});

	afterEach(async () => {
		await server.stop();
	});

	it('starts on a random port and returns a config path', async () => {
		expect(port).toBeGreaterThan(0);
	});

	it('responds to initialize with capabilities', async () => {
		const res = await postMcp(port, {
			jsonrpc: '2.0',
			method: 'initialize',
			params: { clientInfo: { name: 'test' } },
			id: 1,
		});
		expect(res.status).toBe(200);
		const data = res.data as { result: { protocolVersion: string; capabilities: unknown; serverInfo: unknown } };
		expect(data.result.protocolVersion).toBe('2024-11-05');
		expect(data.result.serverInfo).toMatchObject({ name: 'flow-mcp' });
	});

	it('responds to tools/list with provideSteps', async () => {
		const res = await postMcp(port, {
			jsonrpc: '2.0',
			method: 'tools/list',
			params: {},
			id: 2,
		});
		expect(res.status).toBe(200);
		const data = res.data as { result: { tools: Array<{ name: string }> } };
		expect(data.result.tools).toHaveLength(1);
		expect(data.result.tools[0]!.name).toBe('provideSteps');
	});

	it('calls onInjectSteps and returns injected ids on provideSteps tool call', async () => {
		const steps: InjectedStep[] = [
			{ id: 'new-step-1', type: 'script' },
			{ id: 'new-step-2', type: 'model' },
		];
		const res = await postMcp(port, {
			jsonrpc: '2.0',
			method: 'tools/call',
			params: {
				name: 'provideSteps',
				arguments: { steps },
			},
			id: 3,
		});
		expect(res.status).toBe(200);
		const data = res.data as {
			result: { content: Array<{ type: string; text: string }> };
		};
		expect(data.result.content[0]!.type).toBe('text');
		const parsed = JSON.parse(data.result.content[0]!.text) as { injected: string[] };
		expect(parsed.injected).toEqual(['new-step-1', 'new-step-2']);
		expect(onInjectSteps).toHaveBeenCalledWith(steps);
	});

	it('returns MCP error when onInjectSteps throws', async () => {
		onInjectSteps.mockRejectedValue(new Error('Step id already exists'));
		const res = await postMcp(port, {
			jsonrpc: '2.0',
			method: 'tools/call',
			params: {
				name: 'provideSteps',
				arguments: { steps: [{ id: 'dup', type: 'script' }] },
			},
			id: 4,
		});
		const data = res.data as { error: { code: number; message: string } };
		expect(data.error.code).toBe(-32603);
		expect(data.error.message).toContain('Step id already exists');
	});

	it('returns error for user_intervention step type', async () => {
		const res = await postMcp(port, {
			jsonrpc: '2.0',
			method: 'tools/call',
			params: {
				name: 'provideSteps',
				arguments: { steps: [{ id: 'bad', type: 'user_intervention' }] },
			},
			id: 5,
		});
		const data = res.data as { error: { message: string } };
		expect(data.error.message).toContain('user_intervention');
	});

	it('returns 404 for unknown paths', async () => {
		const res = await new Promise<{ status: number }>((resolve, reject) => {
			const req = http.request({ hostname: '127.0.0.1', port, path: '/unknown', method: 'GET' }, res => {
				res.resume();
				res.on('end', () => resolve({ status: res.statusCode ?? 0 }));
			});
			req.on('error', reject);
			req.end();
		});
		expect(res.status).toBe(404);
	});

	it('returns error for unknown method', async () => {
		const res = await postMcp(port, {
			jsonrpc: '2.0',
			method: 'unknown/method',
			id: 6,
		});
		const data = res.data as { error: { code: number } };
		expect(data.error.code).toBe(-32601);
	});

	it('rejects bodies larger than 1 MiB', async () => {
		await expect(postLargeBody(port, 1024 * 1024 + 1)).rejects.toThrow();
	});
});
