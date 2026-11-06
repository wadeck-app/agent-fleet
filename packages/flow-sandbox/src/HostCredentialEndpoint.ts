import { randomBytes, timingSafeEqual } from 'node:crypto';
import * as http from 'node:http';
import type { AddressInfo } from 'node:net';

import { AwsCredentialError, type AwsCredentialErrorCode, type CredentialSource } from './AwsCredentialExporter';
import { PROFILE_ALIAS_PATTERN } from './ProfileAlias';
import { SandboxError } from './SandboxError';
import type { SandboxLog } from './SandboxLog';
import { SandboxRequestValidator } from './SandboxRequestValidator';

export interface HostCredentialEndpointOptions {
	source: CredentialSource;
	/** alias -> host AWS profile. The sandbox only ever sees the alias. */
	profiles: Readonly<Record<string, string>>;
	log: SandboxLog;
	/** Time of the issuance log lines (`Date` of the host, injected for tests). */
	wallClock: () => Date;
	/** Port to listen on. Default 0: the system picks a free one. */
	port?: number;
	/** At most this many credential exports run at once; more get 429. Default 4. */
	maxConcurrentExports?: number;
	/** Time the client has to send its request (headers and body). Default 10 s. */
	requestTimeoutMs?: number;
	/** Largest request header block. Default 8 KiB. */
	maxHeaderBytes?: number;
	/** Secret generator. Default: 32 random bytes as hex. Injected for tests only. */
	generateSecret?: () => string;
}

interface SandboxGrant {
	sandbox: string;
	secret: Buffer;
	aliases: ReadonlySet<string>;
}

interface Refusal {
	status: number;
	code: string;
	message: string;
}

type Authorization = { granted: false; refusal: Refusal } | { granted: true; grant: SandboxGrant; alias: string };

const ALIAS = PROFILE_ALIAS_PATTERN;
const BEARER = /^Bearer ([A-Za-z0-9._~+/=-]{16,512})$/;

const STATUS_BY_CODE: Record<AwsCredentialErrorCode, number> = {
	'sso-expired': 503,
	'profile-not-found': 500,
	'aws-missing': 500,
	timeout: 504,
	'aws-failed': 502,
	'aws-output-invalid': 502,
};

/**
 * HTTP server that hands short-lived AWS credentials to sandboxes. It lives inside the wrapper process.
 *
 * - Binds 127.0.0.1 only (asserted after `listen`), on a random port by default.
 * - One random bearer secret per sandbox (`registerSandbox`). The sbx proxy swaps the placeholder the VM holds
 *   for that secret, so the secret itself never enters the VM. The secret maps to the aliases the sandbox may
 *   use; every other alias, an unknown secret or the secret of another sandbox for that alias gets 403.
 * - Serves `GET /credentials?profile=<alias>` with the "process" document of the mapped host profile.
 * - Logs issuance (alias, sandbox, time) and refusals; never a credential, a bearer value or AWS output.
 * - Limits: header size, request time, no request body, concurrent exports.
 *
 * Residual (threat T-07): the agent inside the sandbox can request and use these credentials during the run.
 * The secret is injected on every request to host `localhost` (sbx cannot restrict it to a port), so only
 * wrapper-owned services may listen on ports the sandbox is allowed to reach.
 */
export class HostCredentialEndpoint {
	private readonly grants = new Map<string, SandboxGrant>();
	private readonly validator = new SandboxRequestValidator();
	private server: http.Server | undefined;
	private listeningPort: number | undefined;
	private inFlightExports = 0;

	constructor(private readonly options: HostCredentialEndpointOptions) {
		const aliases = Object.keys(options.profiles);
		if (aliases.length === 0) {
			throw new SandboxError(
				'invalid-options',
				'HostCredentialEndpoint needs at least one profile alias, for example { claude: "my-aws-profile" }.'
			);
		}
		for (const alias of aliases) {
			if (!ALIAS.test(alias)) {
				throw new SandboxError(
					'invalid-options',
					`Profile alias "${alias}" is not valid: use 1 to 64 letters, digits, "_" or "-" (it travels in a URL and in the AWS config of the VM).`
				);
			}
			if ((options.profiles[alias] ?? '') === '') {
				throw new SandboxError(
					'invalid-options',
					`Profile alias "${alias}" maps to an empty host profile name.`
				);
			}
		}
	}

	/** The port in use. Throws before `start()` so nobody builds a rule for port 0. */
	get port(): number {
		if (this.listeningPort === undefined) {
			throw new SandboxError('invalid-argument', 'HostCredentialEndpoint is not started: call start() first.');
		}
		return this.listeningPort;
	}

	async start(): Promise<number> {
		if (this.server !== undefined) {
			throw new SandboxError('invalid-argument', 'HostCredentialEndpoint is already started.');
		}
		const requestTimeoutMs = this.options.requestTimeoutMs ?? 10_000;
		const server = http.createServer(
			{
				maxHeaderSize: this.options.maxHeaderBytes ?? 8 * 1024,
				requestTimeout: requestTimeoutMs,
				headersTimeout: requestTimeoutMs,
				// Node checks the timeouts only every 30 s by default, which would make the limit meaningless.
				connectionsCheckingInterval: Math.max(50, Math.floor(requestTimeoutMs / 2)),
				keepAlive: false,
			},
			(request, response) => this.handle(request, response)
		);
		server.on('clientError', (_error, socket) => {
			// Oversized headers, bad framing or a timeout: answer 400/431 and close; never keep the socket.
			socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');
		});
		const requestedPort = this.options.port ?? 0;
		await new Promise<void>((resolve, reject) => {
			server.once('error', (error: NodeJS.ErrnoException) => {
				reject(
					error.code === 'EADDRINUSE'
						? new SandboxError(
								'invalid-options',
								`Port ${requestedPort} on 127.0.0.1 is already in use. Use port 0 to let the system pick a free port, or stop the process that owns it.`,
								{ cause: error }
							)
						: error
				);
			});
			server.listen(requestedPort, '127.0.0.1', resolve);
		});
		const address = server.address() as AddressInfo;
		if (address.address !== '127.0.0.1') {
			server.close();
			throw new SandboxError(
				'invalid-options',
				`The credential endpoint is bound to ${address.address} instead of 127.0.0.1; refusing to serve credentials on it.`
			);
		}
		this.server = server;
		this.listeningPort = address.port;
		return address.port;
	}

	async stop(): Promise<void> {
		const server = this.server;
		this.server = undefined;
		this.listeningPort = undefined;
		this.grants.clear();
		if (server === undefined) return;
		await new Promise<void>(resolve => {
			server.close(() => resolve());
			server.closeAllConnections();
		});
	}

	/**
	 * Gives a sandbox its own bearer secret and the aliases it may request. Returns the secret: hand it to sbx
	 * through a private file (PrivateSecretFile), never through a command line.
	 */
	registerSandbox(sandbox: string, aliases: readonly string[]): string {
		this.validator.name(sandbox);
		if (this.grants.has(sandbox)) {
			throw new SandboxError(
				'already-exists',
				`Sandbox "${sandbox}" already has a credential grant. Unregister it first; a second secret would silently replace the first.`,
				{ sandbox }
			);
		}
		if (aliases.length === 0) {
			throw new SandboxError(
				'invalid-argument',
				`Sandbox "${sandbox}" was given no profile alias. List at least one of: ${Object.keys(this.options.profiles).join(', ')}.`,
				{ sandbox }
			);
		}
		for (const alias of aliases) {
			if (!(alias in this.options.profiles)) {
				throw new SandboxError(
					'invalid-argument',
					`Profile alias "${alias}" is not configured. Known aliases: ${Object.keys(this.options.profiles).join(', ')}. Add it to the "profiles" option (alias -> host AWS profile).`,
					{ sandbox }
				);
			}
		}
		const secret = (this.options.generateSecret ?? (() => randomBytes(32).toString('hex')))();
		const secretBytes = Buffer.from(secret, 'utf8');
		if (!BEARER.test(`Bearer ${secret}`)) {
			throw new SandboxError(
				'invalid-argument',
				'The generated credential secret has an unusable form (16 to 512 characters of letters, digits and ._~+/=- expected).',
				{ sandbox }
			);
		}
		for (const grant of this.grants.values()) {
			if (grant.secret.equals(secretBytes)) {
				throw new SandboxError(
					'already-exists',
					'The generated credential secret collides with the secret of another sandbox; refusing to register it. Retry.',
					{ sandbox }
				);
			}
		}
		this.grants.set(sandbox, { sandbox, secret: secretBytes, aliases: new Set(aliases) });
		this.options.log.info(
			`credential grant created: sandbox=${sandbox} aliases=${[...new Set(aliases)].join(',')}`
		);
		return secret;
	}

	unregisterSandbox(sandbox: string): void {
		if (this.grants.delete(sandbox)) {
			this.options.log.info(`credential grant removed: sandbox=${sandbox}`);
		}
	}

	// ---- request handling ----

	private handle(request: http.IncomingMessage, response: http.ServerResponse): void {
		this.process(request)
			.then(
				outcome => this.send(response, outcome.status, outcome.body, request),
				(error: unknown) => {
					this.options.log.warn(
						`credential request failed unexpectedly: ${error instanceof Error ? error.constructor.name : 'unknown error'}`
					);
					this.send(
						response,
						500,
						{
							error: {
								code: 'internal-error',
								message: 'The credential endpoint failed; see the wrapper log.',
							},
						},
						request
					);
				}
			)
			.catch(() => {
				response.destroy();
			});
	}

	private async process(request: http.IncomingMessage): Promise<{ status: number; body: unknown }> {
		const authorization = this.authorize(request);
		if (!authorization.granted) {
			const { refusal } = authorization;
			return { status: refusal.status, body: { error: { code: refusal.code, message: refusal.message } } };
		}
		const { grant, alias } = authorization;
		// registerSandbox only accepts configured aliases, so the lookup cannot miss.
		const hostProfile = this.options.profiles[alias] ?? '';

		if (this.inFlightExports >= (this.options.maxConcurrentExports ?? 4)) {
			this.options.log.warn(`credential request refused (busy): sandbox=${grant.sandbox} alias=${alias}`);
			return {
				status: 429,
				body: { error: { code: 'busy', message: 'Too many credential requests at once. Retry in a second.' } },
			};
		}
		this.inFlightExports += 1;
		try {
			const credentials = await this.options.source.export(hostProfile);
			this.options.log.info(
				`credentials issued: sandbox=${grant.sandbox} alias=${alias} at=${this.options.wallClock().toISOString()}`
			);
			return { status: 200, body: credentials };
		} catch (error) {
			if (error instanceof AwsCredentialError) {
				this.options.log.warn(
					`credentials NOT issued: sandbox=${grant.sandbox} alias=${alias} reason=${error.code} - ${error.message}`
				);
				return {
					status: STATUS_BY_CODE[error.code],
					body: { error: { code: error.code, message: error.message } },
				};
			}
			throw error;
		} finally {
			this.inFlightExports -= 1;
		}
	}

	/** The sandbox and alias of an allowed request, or why it is refused. */
	private authorize(request: http.IncomingMessage): Authorization {
		const refuse = (status: number, code: string, message: string): Authorization => ({
			granted: false,
			refusal: { status, code, message },
		});
		if (request.method !== 'GET') {
			return refuse(405, 'method-not-allowed', 'Only GET /credentials?profile=<alias> is served.');
		}
		const url = new URL(request.url ?? '/', 'http://127.0.0.1');
		if (url.pathname !== '/credentials') {
			return refuse(404, 'not-found', 'Only GET /credentials?profile=<alias> is served.');
		}
		const contentLength = request.headers['content-length'];
		if (
			(contentLength !== undefined && contentLength !== '0') ||
			request.headers['transfer-encoding'] !== undefined
		) {
			return refuse(413, 'body-not-allowed', 'A credential request has no body.');
		}
		const authorization = request.headers.authorization;
		if (authorization === undefined || !BEARER.test(authorization)) {
			return refuse(
				401,
				'missing-secret',
				'Send the sandbox secret as "Authorization: Bearer <secret>". The VM script does this with FLOW_CREDENTIAL_TOKEN.'
			);
		}
		const grant = this.grantOf(authorization);
		if (grant === undefined) {
			const presented = BEARER.exec(authorization)?.[1] ?? '';
			this.options.log.warn(
				presented.startsWith('flow-ph-')
					? 'credential request refused: the bearer value is still a placeholder (flow-ph-...): the sbx proxy did not substitute it (the request did not go through the proxy, or the sandbox has no custom secret for host localhost)'
					: 'credential request refused: unknown bearer secret (another sandbox, a removed sandbox or a stale wrapper)'
			);
			return refuse(
				403,
				'unknown-secret',
				'This secret belongs to no sandbox known to this wrapper. The sandbox may have been removed or created by another run.'
			);
		}
		const alias = url.searchParams.get('profile') ?? '';
		if (!ALIAS.test(alias)) {
			return refuse(400, 'bad-profile', 'Pass ?profile=<alias> (1 to 64 letters, digits, "_" or "-").');
		}
		if (!grant.aliases.has(alias)) {
			this.options.log.warn(
				`credential request refused: sandbox=${grant.sandbox} asked for alias "${alias}" outside its set`
			);
			return refuse(
				403,
				'alias-not-allowed',
				`Alias "${alias}" is not allowed for sandbox "${grant.sandbox}". Allowed: ${[...grant.aliases].join(', ')}.`
			);
		}
		return { granted: true, grant, alias };
	}

	private grantOf(authorization: string | undefined): SandboxGrant | undefined {
		const match = authorization === undefined ? null : BEARER.exec(authorization);
		if (match?.[1] === undefined) return undefined;
		const presented = Buffer.from(match[1], 'utf8');
		let found: SandboxGrant | undefined;
		// Every grant is compared (constant time per comparison) so the loop does not reveal which one matched.
		for (const grant of this.grants.values()) {
			if (grant.secret.length === presented.length && timingSafeEqual(grant.secret, presented)) {
				found = grant;
			}
		}
		return found;
	}

	private send(response: http.ServerResponse, status: number, body: unknown, request: http.IncomingMessage): void {
		const payload = JSON.stringify(body);
		response.writeHead(status, {
			'Content-Type': 'application/json',
			'Content-Length': Buffer.byteLength(payload),
			'Cache-Control': 'no-store',
			Connection: 'close',
			...(status === 429 ? { 'Retry-After': '1' } : {}),
		});
		response.end(payload);
		if (request.headers['content-length'] !== undefined && request.headers['content-length'] !== '0') {
			request.destroy();
		}
	}
}
