import * as http from 'node:http';
import * as net from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
	AwsCredentialError,
	type AwsCredentialErrorCode,
	AwsCredentialExporter,
	type AwsProcessCredentials,
	type CredentialSource,
} from './AwsCredentialExporter';
import { HostCredentialEndpoint, type HostCredentialEndpointOptions } from './HostCredentialEndpoint';
import { failure, rejection } from './testing/ExpectedFailures';
import { RecordingSandboxLog } from './testing/RecordingSandboxLog';
import { ScriptedCommandRunner } from './testing/ScriptedCommandRunner';

const DOCUMENT: AwsProcessCredentials = {
	Version: 1,
	AccessKeyId: 'ASIAEXAMPLEKEYID',
	SecretAccessKey: 'example-secret-access-key',
	SessionToken: 'example-session-token',
	Expiration: '2026-10-26T22:00:00Z',
};
const CREDENTIAL_TEXTS = [DOCUMENT.AccessKeyId, DOCUMENT.SecretAccessKey, DOCUMENT.SessionToken ?? ''];

class RecordingSource implements CredentialSource {
	readonly exported: string[] = [];
	async export(hostProfile: string): Promise<AwsProcessCredentials> {
		this.exported.push(hostProfile);
		return Promise.resolve(DOCUMENT);
	}
}

interface HttpResult {
	status: number;
	headers: http.IncomingHttpHeaders;
	body: string;
}

function request(
	port: number,
	target: string,
	options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<HttpResult> {
	return new Promise((resolve, reject) => {
		const outgoing = http.request(
			{
				host: '127.0.0.1',
				port,
				path: target,
				method: options.method ?? 'GET',
				headers: options.headers,
				agent: false,
			},
			response => {
				let body = '';
				response.setEncoding('utf8');
				response.on('data', (chunk: string) => (body += chunk));
				response.on('end', () =>
					resolve({ status: response.statusCode ?? 0, headers: response.headers, body })
				);
			}
		);
		outgoing.on('error', reject);
		outgoing.end(options.body);
	});
}

function bearer(secret: string): Record<string, string> {
	return { Authorization: `Bearer ${secret}` };
}

const endpoints: HostCredentialEndpoint[] = [];

afterEach(async () => {
	vi.restoreAllMocks();
	for (const endpoint of endpoints.splice(0)) await endpoint.stop();
});

interface Fixture {
	endpoint: HostCredentialEndpoint;
	log: RecordingSandboxLog;
	source: RecordingSource;
	port: number;
}

function build(overrides: Partial<HostCredentialEndpointOptions> = {}): HostCredentialEndpoint {
	return new HostCredentialEndpoint({
		source: new RecordingSource(),
		profiles: { claude: 'p' },
		log: new RecordingSandboxLog(),
		wallClock: () => new Date(0),
		...overrides,
	});
}

async function started(overrides: Partial<HostCredentialEndpointOptions> = {}): Promise<Fixture> {
	const log = new RecordingSandboxLog();
	const source = new RecordingSource();
	const endpoint = new HostCredentialEndpoint({
		source,
		profiles: { claude: 'host-claude', codex: 'host-codex' },
		log,
		wallClock: () => new Date('2026-10-26T20:00:00.000Z'),
		...overrides,
	});
	endpoints.push(endpoint);
	const port = await endpoint.start();
	return { endpoint, log, source, port };
}

function parse(result: HttpResult): { error: { code: string; message: string } } {
	return JSON.parse(result.body) as { error: { code: string; message: string } };
}

describe('HostCredentialEndpoint construction', () => {
	it('refuses an empty profile map, an alias that cannot travel in a URL and an empty host profile, and gives no port before start', () => {
		const empty = failure(() => build({ profiles: {} }));
		expect(empty.kind).toBe('invalid-options');
		expect(empty.message).toBe(
			'HostCredentialEndpoint needs at least one profile alias, for example { claude: "my-aws-profile" }.'
		);

		const badAlias = failure(() => build({ profiles: { 'bad alias': 'p' } }));
		expect(badAlias.kind).toBe('invalid-options');
		expect(badAlias.message).toContain('Profile alias "bad alias" is not valid');

		expect(failure(() => build({ profiles: { claude: '' } })).message).toBe(
			'Profile alias "claude" maps to an empty host profile name.'
		);
		expect(failure(() => build().port).message).toBe('HostCredentialEndpoint is not started: call start() first.');
	});
});

describe('HostCredentialEndpoint network binding', () => {
	it('listens on 127.0.0.1 only, reports the system-picked port, and does not answer on the IPv6 loopback', async () => {
		const listen = vi.spyOn(http.Server.prototype, 'listen');

		const { endpoint, port } = await started();

		expect(listen).toHaveBeenCalledTimes(1);
		expect(listen.mock.calls[0]?.slice(0, 2)).toEqual([0, '127.0.0.1']);
		expect(port).toBeGreaterThan(0);
		expect(endpoint.port).toBe(port);

		const attempt = await new Promise<string>(resolve => {
			const socket = net.createConnection({ host: '::1', port });
			socket.once('connect', () => {
				socket.destroy();
				resolve('connected');
			});
			socket.once('error', (error: NodeJS.ErrnoException) => resolve(error.code ?? 'error'));
		});
		expect(['ECONNREFUSED', 'EADDRNOTAVAIL']).toContain(attempt);
	});

	it('refuses to serve when the server ends up on another address, and releases it', async () => {
		vi.spyOn(net.Server.prototype, 'address').mockReturnValue({ address: '0.0.0.0', family: 'IPv4', port: 4242 });
		const endpoint = build();
		endpoints.push(endpoint);

		const error = await rejection(endpoint.start());

		expect(error.message).toBe(
			'The credential endpoint is bound to 0.0.0.0 instead of 127.0.0.1; refusing to serve credentials on it.'
		);
		expect(() => endpoint.port).toThrow('not started');
	});

	it('cannot be started twice, says what to do when a fixed port is taken, and stop before start is a no-op', async () => {
		const first = await started();

		expect((await rejection(first.endpoint.start())).message).toBe('HostCredentialEndpoint is already started.');

		const second = build({ port: first.port });
		const error = await rejection(second.start());
		expect(error.message).toBe(
			`Port ${first.port} on 127.0.0.1 is already in use. Use port 0 to let the system pick a free port, or stop the process that owns it.`
		);

		await expect(build().stop()).resolves.toBeUndefined();
	});

	it('closes the port on stop, forgets every secret, and a restart on the same port rejects the old secret', async () => {
		const first = await started();
		const oldSecret = first.endpoint.registerSandbox('box-1', ['claude']);
		await first.endpoint.stop();
		const closed = await request(first.port, '/credentials?profile=claude', { headers: bearer(oldSecret) }).then(
			() => 'answered',
			(error: NodeJS.ErrnoException) => error.code
		);
		expect(closed).toBe('ECONNREFUSED');

		const second = await started({ port: first.port });
		const newSecret = second.endpoint.registerSandbox('box-1', ['claude']);
		const stale = await request(second.port, '/credentials?profile=claude', { headers: bearer(oldSecret) });
		const fresh = await request(second.port, '/credentials?profile=claude', { headers: bearer(newSecret) });

		expect(second.port).toBe(first.port);
		expect(newSecret).not.toBe(oldSecret);
		expect(stale.status).toBe(403);
		expect(fresh.status).toBe(200);
		expect(second.source.exported).toEqual(['host-claude']);
	});
});

describe('HostCredentialEndpoint registerSandbox', () => {
	it('gives each sandbox a different 64-hex-character secret and logs the grant without the secret', async () => {
		const { endpoint, log } = await started();

		const first = endpoint.registerSandbox('box-1', ['claude']);
		const second = endpoint.registerSandbox('box-2', ['claude']);

		expect(first).toMatch(/^[0-9a-f]{64}$/);
		expect(second).toMatch(/^[0-9a-f]{64}$/);
		expect(first).not.toBe(second);
		expect(log.lines).toEqual([
			'info: credential grant created: sandbox=box-1 aliases=claude',
			'info: credential grant created: sandbox=box-2 aliases=claude',
		]);
		expect(log.text()).not.toContain(first);
		expect(log.text()).not.toContain(second);
	});

	it('refuses an invalid sandbox name, a second grant (no silent replacement), an empty or unknown alias list', async () => {
		const { endpoint } = await started();

		expect(failure(() => endpoint.registerSandbox('x', ['claude'])).kind).toBe('invalid-argument');

		endpoint.registerSandbox('box-1', ['claude']);
		const duplicate = failure(() => endpoint.registerSandbox('box-1', ['codex']));
		expect(duplicate.kind).toBe('already-exists');
		expect(duplicate.message).toContain('Unregister it first');

		expect(failure(() => endpoint.registerSandbox('box-2', [])).message).toBe(
			'Sandbox "box-2" was given no profile alias. List at least one of: claude, codex.'
		);
		expect(failure(() => endpoint.registerSandbox('box-2', ['claude', 'nope'])).message).toBe(
			'Profile alias "nope" is not configured. Known aliases: claude, codex. Add it to the "profiles" option (alias -> host AWS profile).'
		);
	});

	it('refuses a secret that collides with the secret of another sandbox and a generated secret that is too short', async () => {
		const colliding = await started({ generateSecret: () => 'a'.repeat(32) });
		colliding.endpoint.registerSandbox('box-1', ['claude']);
		const collision = failure(() => colliding.endpoint.registerSandbox('box-2', ['claude']));
		expect(collision.kind).toBe('already-exists');
		expect(collision.message).toContain('collides with the secret of another sandbox');

		const short = await started({ generateSecret: () => 'short' });
		const tooShort = failure(() => short.endpoint.registerSandbox('box-1', ['claude']));
		expect(tooShort.kind).toBe('invalid-argument');
		expect(tooShort.message).toContain('unusable form');
	});

	it('stops honouring the secret after unregister and logs the removal once', async () => {
		const { endpoint, port, log } = await started();
		const secret = endpoint.registerSandbox('box-1', ['claude']);

		endpoint.unregisterSandbox('box-1');
		endpoint.unregisterSandbox('box-1');
		const result = await request(port, '/credentials?profile=claude', { headers: bearer(secret) });

		expect(result.status).toBe(403);
		expect(log.lines.filter(line => line.includes('grant removed'))).toEqual([
			'info: credential grant removed: sandbox=box-1',
		]);
	});
});

describe('HostCredentialEndpoint serving', () => {
	it('returns the credential document of the mapped host profile, each alias to its own profile, and logs the issuance', async () => {
		const { endpoint, port, source, log } = await started();
		const secret = endpoint.registerSandbox('box-1', ['claude', 'codex']);

		const result = await request(port, '/credentials?profile=claude', { headers: bearer(secret) });

		expect(result.status).toBe(200);
		expect(result.headers['content-type']).toBe('application/json');
		expect(result.headers['cache-control']).toBe('no-store');
		expect(JSON.parse(result.body)).toEqual(DOCUMENT);
		expect(source.exported).toEqual(['host-claude']);
		expect(log.lines).toContain('info: credentials issued: sandbox=box-1 alias=claude at=2026-10-26T20:00:00.000Z');

		await request(port, '/credentials?profile=codex', { headers: bearer(secret) });
		expect(source.exported).toEqual(['host-claude', 'host-codex']);
	});

	it('runs the AWS CLI export for the mapped profile through the injected command runner', async () => {
		const runner = new ScriptedCommandRunner([{ exitCode: 0, stdout: JSON.stringify(DOCUMENT), stderr: '' }]);
		const { endpoint, port } = await started({
			source: new AwsCredentialExporter({ commandRunner: runner }),
		});
		const secret = endpoint.registerSandbox('box-1', ['claude']);

		const result = await request(port, '/credentials?profile=claude', { headers: bearer(secret) });

		expect(result.status).toBe(200);
		expect(runner.requests.map(call => [call.command, ...call.args])).toEqual([
			['aws', 'configure', 'export-credentials', '--profile', 'host-claude', '--format', 'process'],
		]);
	});

	it('scopes the secret per sandbox: it cannot ask for the alias only another sandbox has, nor for an alias no profile maps to', async () => {
		const { endpoint, port, source, log } = await started();
		const secretOne = endpoint.registerSandbox('box-1', ['claude']);
		const secretTwo = endpoint.registerSandbox('box-2', ['codex']);

		const crossOne = await request(port, '/credentials?profile=codex', { headers: bearer(secretOne) });
		const crossTwo = await request(port, '/credentials?profile=claude', { headers: bearer(secretTwo) });
		const own = await request(port, '/credentials?profile=codex', { headers: bearer(secretTwo) });
		const ghost = await request(port, '/credentials?profile=ghost', { headers: bearer(secretOne) });

		expect(crossOne.status).toBe(403);
		expect(parse(crossOne).error).toEqual({
			code: 'alias-not-allowed',
			message: 'Alias "codex" is not allowed for sandbox "box-1". Allowed: claude.',
		});
		expect(crossTwo.status).toBe(403);
		expect(own.status).toBe(200);
		expect(ghost.status).toBe(403);
		expect(parse(ghost).error.code).toBe('alias-not-allowed');
		expect(source.exported).toEqual(['host-codex']);
		expect(log.lines).toContain(
			'warn: credential request refused: sandbox=box-1 asked for alias "codex" outside its set'
		);
	});

	it('gives 400 for a missing, empty, traversal or too long alias, without calling the source', async () => {
		const { endpoint, port, source } = await started();
		const secret = endpoint.registerSandbox('box-1', ['claude']);
		const targets: [string, string][] = [
			['missing', '/credentials'],
			['empty', '/credentials?profile='],
			['a path traversal', '/credentials?profile=..%2F..%2Fetc'],
			['too long', `/credentials?profile=${'a'.repeat(65)}`],
		];

		for (const [label, target] of targets) {
			const result = await request(port, target, { headers: bearer(secret) });

			expect(result.status, label).toBe(400);
			expect(parse(result).error.code, label).toBe('bad-profile');
		}
		expect(source.exported).toEqual([]);
	});

	it('gives 401 without a usable Authorization header and never calls the source', async () => {
		const { endpoint, port, source } = await started();
		endpoint.registerSandbox('box-1', ['claude']);
		const cases: [string, Record<string, string>][] = [
			['no Authorization header', {}],
			['a header that is not Bearer', { Authorization: 'Basic abcdefghijklmnopqrstuvwx' }],
			['a Bearer value that is too short', { Authorization: 'Bearer abc' }],
		];

		for (const [label, headers] of cases) {
			const result = await request(port, '/credentials?profile=claude', { headers });

			expect(result.status, label).toBe(401);
			expect(parse(result).error.code, label).toBe('missing-secret');
		}
		expect(source.exported).toEqual([]);
	});

	it('gives 403 for a secret that belongs to no sandbox (wrong, placeholder, one character off), and logs it without the value', async () => {
		const { endpoint, port, source, log } = await started();
		const secret = endpoint.registerSandbox('box-1', ['claude']);
		const wrong = 'f'.repeat(64);
		const placeholder = `flow-ph-${'a'.repeat(32)}`;
		const almost = `${secret.slice(0, -1)}${secret.endsWith('0') ? '1' : '0'}`;

		for (const presented of [wrong, placeholder, almost]) {
			const result = await request(port, '/credentials?profile=claude', { headers: bearer(presented) });

			expect(result.status, presented).toBe(403);
			expect(parse(result).error.code, presented).toBe('unknown-secret');
		}

		expect(source.exported).toEqual([]);
		expect(log.lines).toContain(
			'warn: credential request refused: unknown bearer secret (another sandbox, a removed sandbox or a stale wrapper)'
		);
		expect(log.text()).toContain('the bearer value is still a placeholder');
		for (const forbidden of [wrong, placeholder, almost, secret]) expect(log.text()).not.toContain(forbidden);
	});

	it('answers an expired SSO session with 503 and the command to run, without logging in or logging AWS output', async () => {
		const runner = new ScriptedCommandRunner([
			{
				exitCode: 255,
				stdout: '',
				stderr: 'Error when retrieving token from sso: Token has expired and refresh failed',
			},
		]);
		const { endpoint, port, log } = await started({ source: new AwsCredentialExporter({ commandRunner: runner }) });
		const secret = endpoint.registerSandbox('box-1', ['claude']);

		const result = await request(port, '/credentials?profile=claude', { headers: bearer(secret) });

		expect(result.status).toBe(503);
		expect(parse(result).error).toEqual({
			code: 'sso-expired',
			message:
				'The AWS SSO session of profile "host-claude" has expired or was never started. ' +
				'Run "aws sso login --profile host-claude" on the host, then retry. The wrapper never logs in by itself.',
		});
		expect(runner.requests.map(call => call.args.slice(0, 2))).toEqual([['configure', 'export-credentials']]);
		expect(log.text()).toContain('credentials NOT issued: sandbox=box-1 alias=claude reason=sso-expired');
		expect(log.text()).not.toContain('Token has expired');
	});

	it('maps every export error code to its HTTP status with its message', async () => {
		const expected: [AwsCredentialErrorCode, number][] = [
			['sso-expired', 503],
			['profile-not-found', 500],
			['aws-missing', 500],
			['timeout', 504],
			['aws-failed', 502],
			['aws-output-invalid', 502],
		];
		let failing: AwsCredentialErrorCode = 'sso-expired';
		const source: CredentialSource = {
			export: () => Promise.reject(new AwsCredentialError(failing, `message for ${failing}`)),
		};
		const { endpoint, port } = await started({ source });
		const secret = endpoint.registerSandbox('box-1', ['claude']);

		for (const [code, status] of expected) {
			failing = code;
			const result = await request(port, '/credentials?profile=claude', { headers: bearer(secret) });

			expect(result.status, code).toBe(status);
			expect(parse(result).error, code).toEqual({ code, message: `message for ${code}` });
		}
	});

	it('hides the text of an unexpected failure from the sandbox and from the log', async () => {
		const source: CredentialSource = {
			export: () => Promise.reject(new TypeError('boom AKIALEAKYLEAKYLEAKY')),
		};
		const { endpoint, port, log } = await started({ source });
		const secret = endpoint.registerSandbox('box-1', ['claude']);

		const result = await request(port, '/credentials?profile=claude', { headers: bearer(secret) });

		expect(result.status).toBe(500);
		expect(parse(result).error).toEqual({
			code: 'internal-error',
			message: 'The credential endpoint failed; see the wrapper log.',
		});
		expect(log.lines).toEqual([
			'info: credential grant created: sandbox=box-1 aliases=claude',
			'warn: credential request failed unexpectedly: TypeError',
		]);
	});

	it('never writes a credential or a bearer value to the log, on success or failure', async () => {
		const { endpoint, port, log } = await started();
		const secret = endpoint.registerSandbox('box-1', ['claude']);

		await request(port, '/credentials?profile=claude', { headers: bearer(secret) });
		await request(port, '/credentials?profile=codex', { headers: bearer(secret) });
		await request(port, '/credentials?profile=claude', { headers: bearer('0'.repeat(64)) });

		expect(log.lines.length).toBeGreaterThanOrEqual(4);
		for (const forbidden of [...CREDENTIAL_TEXTS, secret, '0'.repeat(64), 'Bearer']) {
			expect(log.text()).not.toContain(forbidden);
		}
	});

	it('serves only GET /credentials: other methods, other paths and any request body are refused before the source', async () => {
		const { endpoint, port, source } = await started();
		const secret = endpoint.registerSandbox('box-1', ['claude']);

		const post = await request(port, '/credentials?profile=claude', { method: 'POST', headers: bearer(secret) });
		const other = await request(port, '/other?profile=claude', { headers: bearer(secret) });
		const sized = await request(port, '/credentials?profile=claude', {
			headers: { ...bearer(secret), 'Content-Length': '5' },
			body: 'hello',
		});
		const chunked = await request(port, '/credentials?profile=claude', {
			headers: { ...bearer(secret), 'Transfer-Encoding': 'chunked' },
			body: 'hello',
		});

		expect(post.status).toBe(405);
		expect(parse(post).error.code).toBe('method-not-allowed');
		expect(other.status).toBe(404);
		expect(parse(other).error.code).toBe('not-found');
		expect(sized.status).toBe(413);
		expect(parse(sized).error.code).toBe('body-not-allowed');
		expect(chunked.status).toBe(413);
		expect(source.exported).toEqual([]);
	});

	it('answers 429 while the maximum number of exports is running, then serves again', async () => {
		let release: () => void = () => undefined;
		const gate = new Promise<void>(resolve => {
			release = resolve;
		});
		let exportStarted: () => void = () => undefined;
		const exportRunning = new Promise<void>(resolve => {
			exportStarted = resolve;
		});
		const source: CredentialSource = {
			export: async () => {
				exportStarted();
				await gate;
				return DOCUMENT;
			},
		};
		const { endpoint, port, log } = await started({ source, maxConcurrentExports: 1 });
		const secret = endpoint.registerSandbox('box-1', ['claude']);

		const slow = request(port, '/credentials?profile=claude', { headers: bearer(secret) });
		await exportRunning;
		const busy = await request(port, '/credentials?profile=claude', { headers: bearer(secret) });
		release();
		const first = await slow;
		const after = await request(port, '/credentials?profile=claude', { headers: bearer(secret) });

		expect(busy.status).toBe(429);
		expect(busy.headers['retry-after']).toBe('1');
		expect(parse(busy).error.code).toBe('busy');
		expect(first.status).toBe(200);
		expect(after.status).toBe(200);
		expect(log.lines).toContain('warn: credential request refused (busy): sandbox=box-1 alias=claude');
	});
});

describe('HostCredentialEndpoint request limits', () => {
	function raw(port: number, text: string): Promise<string> {
		return new Promise((resolve, reject) => {
			const socket = net.createConnection({ host: '127.0.0.1', port });
			let received = '';
			socket.setEncoding('utf8');
			socket.on('data', (chunk: string) => (received += chunk));
			socket.on('close', () => resolve(received));
			socket.on('error', reject);
			socket.write(text);
		});
	}

	it('closes the connection with 400 when the header block is larger than the limit', async () => {
		const { port, source } = await started({ maxHeaderBytes: 1024 });

		const answer = await raw(
			port,
			`GET /credentials?profile=claude HTTP/1.1\r\nHost: x\r\nX-Padding: ${'a'.repeat(4096)}\r\n\r\n`
		);

		expect(answer.startsWith('HTTP/1.1 400 Bad Request')).toBe(true);
		expect(source.exported).toEqual([]);
	});

	it('closes a connection that never finishes its headers within the request time limit', async () => {
		const { port } = await started({ requestTimeoutMs: 200 });

		const startedAt = Date.now();
		const answer = await raw(port, 'GET /credentials?profile=claude HTTP/1.1\r\nHost: x\r\n');

		expect(Date.now() - startedAt).toBeLessThan(5000);
		expect(answer).toMatch(/^HTTP\/1\.1 (400|408) /);
	});
});
