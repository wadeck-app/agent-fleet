import { request } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { NudgeServer } from './NudgeServer.js';

async function post(url: string, body: unknown): Promise<{ status: number; body: string }> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(url);
		const payload = JSON.stringify(body);

		const req = request(
			{
				hostname: parsed.hostname,
				port: parsed.port,
				path: parsed.pathname,
				method: 'POST',
				headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
			},
			res => {
				let data = '';
				res.on('data', (chunk: Buffer) => {
					data += chunk.toString('utf8');
				});
				res.on('end', () => {
					resolve({ status: res.statusCode ?? 0, body: data });
				});
			}
		);
		req.on('error', reject);
		req.end(payload);
	});
}

let server: NudgeServer | undefined;
afterEach(async () => {
	server?.stop();
	server = undefined;
});

describe('NudgeServer', () => {
	it('delivers wsUrl to the registered callback', async () => {
		server = new NudgeServer();
		const url = await server.start();

		const received: (string | undefined)[] = [];
		server.onNotify(wsUrl => received.push(wsUrl));

		const res = await post(url, { wsUrl: 'ws://127.0.0.1:9999' });

		expect(res.status).toBe(200);
		expect(received).toEqual(['ws://127.0.0.1:9999']);
	});

	it('replaces the callback when onNotify is called again', async () => {
		server = new NudgeServer();
		const url = await server.start();

		const first: (string | undefined)[] = [];
		const second: (string | undefined)[] = [];

		server.onNotify(wsUrl => first.push(wsUrl));
		server.onNotify(wsUrl => second.push(wsUrl));

		await post(url, { wsUrl: 'ws://127.0.0.1:8888' });

		expect(first).toHaveLength(0);
		expect(second).toEqual(['ws://127.0.0.1:8888']);
	});

	it('does not fire when the callback is cleared', async () => {
		server = new NudgeServer();
		const url = await server.start();

		const received: (string | undefined)[] = [];
		server.onNotify(wsUrl => received.push(wsUrl));
		server.onNotify(undefined);

		await post(url, { wsUrl: 'ws://127.0.0.1:7777' });

		expect(received).toHaveLength(0);
	});

	it('returns 400 for missing wsUrl', async () => {
		server = new NudgeServer();
		const url = await server.start();
		server.onNotify(() => undefined);

		const res = await post(url, { notTheField: 'nope' });

		expect(res.status).toBe(400);
	});

	it('returns 400 for invalid JSON', async () => {
		server = new NudgeServer();
		const nudgeUrl = await server.start();

		const res = await new Promise<{ status: number }>((resolve, reject) => {
			const parsed = new URL(nudgeUrl);
			const body = 'not json at all';
			const req = request(
				{
					hostname: parsed.hostname,
					port: parsed.port,
					path: parsed.pathname,
					method: 'POST',
					headers: { 'Content-Type': 'text/plain', 'Content-Length': Buffer.byteLength(body) },
				},
				res => {
					res.resume();
					resolve({ status: res.statusCode ?? 0 });
				}
			);
			req.on('error', reject);
			req.end(body);
		});

		expect(res.status).toBe(400);
	});

	it('returns 404 for an unknown path', async () => {
		server = new NudgeServer();
		const nudgeUrl = await server.start();
		const baseUrl = nudgeUrl.replace('/nudge', '/other');

		const res = await new Promise<{ status: number }>((resolve, reject) => {
			const parsed = new URL(baseUrl);
			const req = request(
				{ hostname: parsed.hostname, port: parsed.port, path: parsed.pathname, method: 'POST' },
				res => {
					res.resume();
					resolve({ status: res.statusCode ?? 0 });
				}
			);
			req.on('error', reject);
			req.end();
		});

		expect(res.status).toBe(404);
	});

	it('does not crash when the callback throws', async () => {
		server = new NudgeServer();
		const url = await server.start();
		const consoleSpy = vi.spyOn(console, 'error').mockReturnValue(undefined);

		server.onNotify(() => {
			throw new Error('callback error');
		});

		const res = await post(url, { wsUrl: 'ws://127.0.0.1:6666' });

		// Server is still standing; it responded before calling the callback
		expect(res.status).toBe(200);
		expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('callback error'));
		consoleSpy.mockRestore();
	});
});
