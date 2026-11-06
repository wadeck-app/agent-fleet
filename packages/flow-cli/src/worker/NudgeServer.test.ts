import { request } from 'node:http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sendNudge } from '../daemon/NudgeDispatch.js';
import { NudgeServer } from './NudgeServer.js';

const TRUSTED = 'ws://127.0.0.1:9999';

interface RawResponse {
	status: number;
	body: string;
}

interface RawOptions {
	method?: string;
	path?: string;
	headers?: Record<string, string>;
}

/** Real HTTP client. `Host` and `Origin` are caller-controlled, to play a rogue peer or a browser. */
function raw(nudgeUrl: string, payload: string, options: RawOptions = {}): Promise<RawResponse> {
	return new Promise((resolve, reject) => {
		const parsed = new URL(nudgeUrl);
		const req = request(
			{
				hostname: parsed.hostname,
				port: parsed.port,
				path: options.path ?? parsed.pathname,
				method: options.method ?? 'POST',
				headers: {
					'Content-Type': 'application/json',
					'Content-Length': Buffer.byteLength(payload),
					...options.headers,
				},
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

function post(url: string, body: unknown, headers?: Record<string, string>): Promise<RawResponse> {
	return raw(url, JSON.stringify(body), headers === undefined ? {} : { headers });
}

let server: NudgeServer | undefined;
let trusted: () => string;
let errorSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let logSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
	trusted = () => TRUSTED;
	errorSpy = vi.spyOn(console, 'error').mockReturnValue(undefined);
	warnSpy = vi.spyOn(console, 'warn').mockReturnValue(undefined);
	logSpy = vi.spyOn(console, 'log').mockReturnValue(undefined);
});

afterEach(() => {
	server?.stop();
	server = undefined;
	vi.restoreAllMocks();
});

async function startServer(): Promise<{ url: string; received: (string | undefined)[] }> {
	server = new NudgeServer(() => trusted());
	const url = await server.start();
	const received: (string | undefined)[] = [];
	server.onNotify(wsUrl => received.push(wsUrl));
	return { url, received };
}

function allLogs(): string {
	return JSON.stringify([...errorSpy.mock.calls, ...warnSpy.mock.calls, ...logSpy.mock.calls]);
}

describe('NudgeServer', () => {
	it('delivers wsUrl to the registered callback', async () => {
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl: TRUSTED });

		expect(res.status).toBe(200);
		expect(received).toEqual([TRUSTED]);
	});

	it('replaces the callback when onNotify is called again', async () => {
		const { url } = await startServer();
		const first: (string | undefined)[] = [];
		const second: (string | undefined)[] = [];

		server?.onNotify(wsUrl => first.push(wsUrl));
		server?.onNotify(wsUrl => second.push(wsUrl));
		await post(url, { wsUrl: TRUSTED });

		expect(first).toHaveLength(0);
		expect(second).toEqual([TRUSTED]);
	});

	it('does not fire when the callback is cleared', async () => {
		const { url, received } = await startServer();
		server?.onNotify(undefined);

		await post(url, { wsUrl: TRUSTED });

		expect(received).toHaveLength(0);
	});

	it('returns 400 for missing wsUrl', async () => {
		const { url } = await startServer();

		const res = await post(url, { notTheField: 'nope' });

		expect(res.status).toBe(400);
	});

	it('returns 400 for invalid JSON sent as application/json', async () => {
		const { url, received } = await startServer();

		const res = await raw(url, 'not json at all');

		expect(res.status).toBe(400);
		expect(received).toHaveLength(0);
	});

	it('returns 404 for an unknown path', async () => {
		const { url } = await startServer();

		const res = await raw(url, '', { path: '/other' });

		expect(res.status).toBe(404);
	});

	it('returns 404 for a GET on /nudge', async () => {
		const { url } = await startServer();

		const res = await raw(url, '', { method: 'GET' });

		expect(res.status).toBe(404);
	});

	it('does not crash when the callback throws', async () => {
		const { url } = await startServer();
		server?.onNotify(() => {
			throw new Error('callback error');
		});

		const res = await post(url, { wsUrl: TRUSTED });

		// Server is still standing; it responded before calling the callback
		expect(res.status).toBe(200);
		expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('callback error'));
	});
});

describe('NudgeServer request hygiene', () => {
	it('accepts a Content-Type with a charset parameter and different case', async () => {
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl: TRUSTED }, { 'Content-Type': 'Application/JSON; charset=utf-8' });

		expect(res.status).toBe(200);
		expect(received).toEqual([TRUSTED]);
	});

	it.each([
		['text/plain', 'text/plain'],
		['form-urlencoded', 'application/x-www-form-urlencoded'],
		['multipart', 'multipart/form-data; boundary=x'],
		['a lookalike', 'application/jsonp'],
	])('returns 415 for Content-Type %s even when the body is valid JSON', async (_name, contentType) => {
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl: TRUSTED }, { 'Content-Type': contentType });

		expect(res.status).toBe(415);
		expect(received).toHaveLength(0);
	});

	it('returns 403 when an Origin header is present (browser cross-origin POST)', async () => {
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl: TRUSTED }, { Origin: 'https://evil.example' });

		expect(res.status).toBe(403);
		expect(received).toHaveLength(0);
	});

	it('returns 403 for an Origin of null', async () => {
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl: TRUSTED }, { Origin: 'null' });

		expect(res.status).toBe(403);
		expect(received).toHaveLength(0);
	});

	it('returns 403 for a DNS-rebinding style Host', async () => {
		const { url, received } = await startServer();
		const port = new URL(url).port;

		const res = await post(url, { wsUrl: TRUSTED }, { Host: `evil.example:${port}` });

		expect(res.status).toBe(403);
		expect(received).toHaveLength(0);
	});

	it('returns 403 for a loopback Host with another port', async () => {
		const { url, received } = await startServer();
		const port = Number(new URL(url).port);

		const res = await post(url, { wsUrl: TRUSTED }, { Host: `127.0.0.1:${String(port + 1)}` });

		expect(res.status).toBe(403);
		expect(received).toHaveLength(0);
	});

	it('returns 403 for a Host without a port', async () => {
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl: TRUSTED }, { Host: '127.0.0.1' });

		expect(res.status).toBe(403);
		expect(received).toHaveLength(0);
	});

	it('accepts Host localhost:<port>', async () => {
		const { url, received } = await startServer();
		const port = new URL(url).port;

		const res = await post(url, { wsUrl: TRUSTED }, { Host: `localhost:${port}` });

		expect(res.status).toBe(200);
		expect(received).toEqual([TRUSTED]);
	});

	it('returns 413 above the body cap, and still serves a legit nudge afterwards', async () => {
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl: `ws://127.0.0.1:9999/${'a'.repeat(5_000)}` });
		const legit = await post(url, { wsUrl: TRUSTED });

		expect(res.status).toBe(413);
		expect(legit.status).toBe(200);
		expect(received).toEqual([TRUSTED]);
	});
});

describe('NudgeServer target pinning', () => {
	const rejected: [string, unknown][] = [
		['another host', 'ws://10.0.0.5:9999'],
		['localhost instead of the trusted IP', 'ws://localhost:9999'],
		['another port', 'ws://127.0.0.1:9998'],
		['the default port', 'ws://127.0.0.1'],
		['wss on the trusted host and port', 'wss://127.0.0.1:9999'],
		['http scheme', 'http://127.0.0.1:9999'],
		['ftp scheme', 'ftp://127.0.0.1:9999'],
		['userinfo', 'ws://user:pass@127.0.0.1:9999'],
		['a user name only', 'ws://user@127.0.0.1:9999'],
		['a userinfo that fakes the host', 'ws://127.0.0.1:9999@evil.example:80'],
		['a relative URL', '/daemon'],
		['a scheme-relative URL', '//127.0.0.1:9999'],
		['an empty string', ''],
		['not a URL at all', 'not a url'],
		['a very long host', `ws://${'a'.repeat(3_000)}.example:9999`],
	];

	it.each(rejected)('returns 403 and does not reconnect for %s', async (_name, wsUrl) => {
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl });

		expect(res.status).toBe(403);
		expect(res.body).toBe('nudge target refused');
		expect(received).toHaveLength(0);
	});

	it('refuses a non-string wsUrl with 400, not a reconnect', async () => {
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl: 42 });

		expect(res.status).toBe(400);
		expect(received).toHaveLength(0);
	});

	it('accepts a trusted address regardless of case and an explicit trailing slash', async () => {
		trusted = () => 'ws://LOCALHOST:9999';
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl: 'ws://localhost:9999/' });

		expect(res.status).toBe(200);
		expect(received).toHaveLength(1);
	});

	it('hands the callback the trusted address, never the nudged text', async () => {
		trusted = () => 'ws://127.0.0.1:9999';
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl: 'ws://127.0.0.1:9999/some/path?x=1#frag' });

		expect(res.status).toBe(200);
		expect(received).toEqual(['ws://127.0.0.1:9999']);
	});

	it('resolves the trusted address at the moment of each nudge', async () => {
		trusted = () => 'ws://127.0.0.1:9001';
		const { url, received } = await startServer();

		const before = await post(url, { wsUrl: 'ws://127.0.0.1:9002' });
		trusted = () => 'ws://127.0.0.1:9002';
		const after = await post(url, { wsUrl: 'ws://127.0.0.1:9002' });

		expect(before.status).toBe(403);
		expect(after.status).toBe(200);
		expect(received).toEqual(['ws://127.0.0.1:9002']);
	});

	it('refuses with a warning when no trusted address can be resolved', async () => {
		trusted = () => {
			throw new Error('No running flow daemon found (no "x/config.port"). Start one with "flow start".');
		};
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl: 'ws://127.0.0.1:9999' });

		expect(res.status).toBe(403);
		expect(received).toHaveLength(0);
		const logged = allLogs();
		expect(logged).toContain('127.0.0.1:9999');
		expect(logged).toContain('No running flow daemon found');
	});

	it('refuses with a warning when the trusted address is not a valid URL', async () => {
		trusted = () => 'not a url';
		const { url, received } = await startServer();

		const res = await post(url, { wsUrl: 'ws://127.0.0.1:9999' });

		expect(res.status).toBe(403);
		expect(received).toHaveLength(0);
		expect(errorSpy).toHaveBeenCalled();
	});

	it('names the nudged and trusted host:port and the fix, once per refused target', async () => {
		const { url } = await startServer();

		await post(url, { wsUrl: 'ws://10.0.0.5:7777' });
		await post(url, { wsUrl: 'ws://10.0.0.5:7777' });

		expect(errorSpy).toHaveBeenCalledTimes(1);
		const line = String(errorSpy.mock.calls[0]?.[0]);
		expect(line).toContain('10.0.0.5:7777');
		expect(line).toContain('127.0.0.1:9999');
		expect(line).toMatch(/flow stop|FLOW_DAEMON_WS_URL|wsPort/);
	});

	it('never logs the body, userinfo, path or query of a refused nudge', async () => {
		const { url } = await startServer();

		await post(url, { wsUrl: 'ws://sekrit-user:sekrit-pass@10.0.0.5:7777/sekrit-path?sekrit-query=1' });
		await post(url, { wsUrl: 'ws://127.0.0.1:9999' }, { Origin: 'https://sekrit-origin.example' });
		await post(url, { wsUrl: TRUSTED }, { Host: 'sekrit-host.example:1' });
		await post(url, { wsUrl: TRUSTED }, { 'Content-Type': 'text/sekrit' });

		const logged = allLogs();
		expect(logged).not.toContain('sekrit');
		expect(logged).toContain('10.0.0.5:7777');
	});

	it('still accepts a legitimate nudge, exactly once, after every kind of rejection', async () => {
		const { url, received } = await startServer();
		const port = new URL(url).port;

		await post(url, { wsUrl: 'ws://10.0.0.5:9999' });
		await post(url, { wsUrl: TRUSTED }, { Origin: 'https://evil.example' });
		await post(url, { wsUrl: TRUSTED }, { Host: `evil.example:${port}` });
		await post(url, { wsUrl: TRUSTED }, { 'Content-Type': 'text/plain' });
		await raw(url, 'not json');
		await post(url, { wsUrl: 'ws://u:p@127.0.0.1:9999' });
		expect(received).toHaveLength(0);

		const res = await post(url, { wsUrl: TRUSTED });

		expect(res.status).toBe(200);
		expect(received).toEqual([TRUSTED]);
	});
});

describe('daemon-side nudge (sendNudge) against a NudgeServer', () => {
	it('is accepted when the wsUrl equals the address the worker trusts', async () => {
		const { url, received } = await startServer();

		await sendNudge(url, TRUSTED);

		expect(received).toEqual([TRUSTED]);
	});

	it('is rejected with HTTP 403 when the wsUrl is any other address', async () => {
		const { url, received } = await startServer();

		await expect(sendNudge(url, 'ws://127.0.0.1:9998')).rejects.toThrow('HTTP 403');

		expect(received).toHaveLength(0);
	});
});
