import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import { checkNudgeTarget, hostPortOf } from './NudgeTargetCheck.js';
import type { ReconnectNotifier } from './ReconnectNotifier.js';

const BODY_TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES = 4_096;
/** Distinct refusal reasons logged; beyond this a flood of rogue requests cannot flood the log. */
const MAX_LOGGED_REFUSALS = 32;

class BodyTooLargeError extends Error {}

/**
 * HTTP server that receives a "nudge" from the daemon when it is ready to accept workers.
 *
 * The daemon sends a POST to `<nudgeUrl>` with `{ wsUrl }` in the body. The worker
 * connects immediately instead of waiting for its backoff timer to fire.
 *
 * Advantages over the file-watch approach:
 * - No shared filesystem is needed: the daemon dials the URL. (A remote worker would also need a trusted address that is not loopback; not supported yet.)
 * - The body carries the address, but only as a check: the worker dials the address it already trusts.
 *
 * The server binds to 127.0.0.1 by default. For a worker on another machine, bind to
 * 0.0.0.0 and publish the real address (not yet exposed via config; this is the foundation).
 *
 * The nudge is advisory and unauthenticated, so it is never trusted to say where to connect:
 * - the request must look like it came from the daemon, not from a browser (JSON content type, no
 *   `Origin`, `Host` equal to this server's own loopback address -- which defeats DNS rebinding);
 * - the nudged `wsUrl` must name the address the worker already trusts (`resolveTrustedWsUrl`,
 *   evaluated at the moment of the nudge). The worker then dials that trusted address, not the nudged text.
 *   Otherwise any local process could redirect the worker, and its credential, to a rogue daemon.
 *
 * The server is `unref()`'d -- it does not keep the Node process alive. The reconnect timer
 * already does that deliberately (D#51).
 */
export class NudgeServer implements ReconnectNotifier {
	private callback: ((wsUrl: string | undefined) => void) | undefined;
	private readonly server: Server;
	private started = false;
	private port = 0;
	private readonly loggedRefusals = new Set<string>();

	/**
	 * @param resolveTrustedWsUrl returns the WebSocket address of the daemon this worker trusts (see
	 *        `resolveDaemonWsUrl`); throws when there is none. Called on every nudge.
	 */
	constructor(private readonly resolveTrustedWsUrl: () => string) {
		this.server = createServer((req, res) => {
			void this.handleRequest(req, res);
		});
		this.server.unref();
	}

	/**
	 * Binds the server and returns the URL workers should publish in the registry.
	 *
	 * Binds to port 0 so the OS assigns a free port -- no collision is possible.
	 * Safe to call only once; calling again after stop() is not supported.
	 */
	start(): Promise<string> {
		return new Promise((resolve, reject) => {
			this.server.once('error', reject);
			this.server.listen(0, '127.0.0.1', () => {
				this.server.removeListener('error', reject);
				const addr = this.server.address();
				if (addr === null || typeof addr === 'string') {
					reject(new Error('NudgeServer: unexpected address after listen'));
					return;
				}
				this.started = true;
				this.port = addr.port;
				resolve(`http://127.0.0.1:${String(addr.port)}/nudge`);
			});
		});
	}

	onNotify(callback: ((wsUrl: string | undefined) => void) | undefined): void {
		this.callback = callback;
	}

	stop(): void {
		this.callback = undefined;
		if (this.started) {
			this.server.close();
			this.started = false;
		}
	}

	private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
		if (req.method !== 'POST' || req.url !== '/nudge') {
			res.writeHead(404);
			res.end();
			return;
		}

		// A browser adds Origin to every cross-origin POST; the daemon never does.
		if (req.headers.origin !== undefined) {
			this.refuse(res, 403, 'origin', 'a request carrying an Origin header (a browser page, not the daemon)');
			return;
		}
		if (!this.isOwnHost(req.headers.host)) {
			this.refuse(res, 403, 'host', 'a request whose Host header is not the loopback address of this worker');
			return;
		}
		if (!isJsonContentType(req.headers['content-type'])) {
			this.refuse(res, 415, 'content-type', 'a request whose Content-Type is not application/json');
			return;
		}

		let raw: string;
		try {
			raw = await readBody(req);
		} catch (err) {
			if (err instanceof BodyTooLargeError) {
				this.refuse(res, 413, 'too-large', `a request body over ${String(MAX_BODY_BYTES)} bytes`);
				return;
			}
			safeRespond(res, 500, 'body read error');
			console.error(`[nudge] body read error: ${String(err)}`);
			return;
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(raw);
		} catch {
			safeRespond(res, 400, 'invalid JSON');
			return;
		}

		if (
			typeof parsed !== 'object' ||
			parsed === null ||
			!('wsUrl' in parsed) ||
			typeof (parsed as { wsUrl: unknown }).wsUrl !== 'string'
		) {
			safeRespond(res, 400, 'missing wsUrl string');
			return;
		}

		const { wsUrl } = parsed as { wsUrl: string };
		const trustedWsUrl = this.trustedAddress(wsUrl, res);
		if (trustedWsUrl === undefined) {
			return;
		}
		// Respond before firing the callback: the daemon's POST must not block waiting for
		// the WebSocket handshake to complete (the daemon may be the one the worker dials).
		safeRespond(res, 200, 'ok');

		try {
			this.callback?.(trustedWsUrl);
		} catch (err) {
			console.error(`[nudge] callback error: ${String(err)}`);
		}
	}

	/** The trusted address when the nudged one matches it; otherwise answers 403, logs once, and returns undefined. */
	private trustedAddress(nudgedWsUrl: string, res: ServerResponse): string | undefined {
		let trusted: string;
		try {
			trusted = this.resolveTrustedWsUrl();
		} catch (err) {
			// The reason comes from our own resolver (paths and fixes), never from the request.
			const reason = err instanceof Error ? err.message : String(err);
			const nudged = hostPortOf(nudgedWsUrl);
			this.refuse(
				res,
				403,
				`target:${nudged ?? 'unparseable'}`,
				`a nudge to ${nudged ?? 'an unparseable address'}: this worker has no trusted daemon address to compare it with (${reason})`
			);
			return undefined;
		}
		const verdict = checkNudgeTarget(nudgedWsUrl, trusted);
		if (verdict.accepted) {
			return trusted;
		}
		const nudged = verdict.nudgedHostPort ?? 'an unparseable address';
		const trustedShown = verdict.trustedHostPort ?? 'an unparseable address';
		this.refuse(
			res,
			403,
			`target:${nudged}`,
			`a nudge to ${nudged}: this worker only follows a nudge to the daemon address it already trusts (${trustedShown}). If the daemon really is at ${nudged}, set FLOW_DAEMON_WS_URL or worker.wsPort to it (restart the worker), or run "flow stop" then "flow start" so both agree on the port`
		);
		return undefined;
	}

	private refuse(res: ServerResponse, status: number, key: string, what: string): void {
		const fixedBody = status === 403 && key.startsWith('target:') ? 'nudge target refused' : 'nudge refused';
		safeRespond(res, status, fixedBody);
		if (this.loggedRefusals.has(key) || this.loggedRefusals.size >= MAX_LOGGED_REFUSALS) {
			return;
		}
		this.loggedRefusals.add(key);
		console.error(`[nudge] refused ${what}. The worker was not redirected.`);
	}

	private isOwnHost(host: string | undefined): boolean {
		if (host === undefined) {
			return false;
		}
		const lower = host.toLowerCase();
		const port = String(this.port);
		return lower === `127.0.0.1:${port}` || lower === `localhost:${port}`;
	}
}

function isJsonContentType(header: string | undefined): boolean {
	if (header === undefined) {
		return false;
	}
	return (header.split(';')[0] ?? '').trim().toLowerCase() === 'application/json';
}

function readBody(req: IncomingMessage): Promise<string> {
	return new Promise((resolve, reject) => {
		let body = '';
		let settled = false;

		const settle = (fn: () => void): void => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			fn();
		};

		const timer = setTimeout(() => {
			settle(() => reject(new Error(`body read timed out after ${BODY_TIMEOUT_MS}ms`)));
		}, BODY_TIMEOUT_MS);

		req.on('data', (chunk: Buffer) => {
			if (settled) return;
			body += chunk.toString('utf8');
			if (body.length > MAX_BODY_BYTES) {
				settle(() => reject(new BodyTooLargeError('body exceeds maximum size')));
			}
		});

		req.on('end', () => {
			settle(() => resolve(body));
		});

		req.on('error', err => {
			settle(() => reject(err));
		});
	});
}

function safeRespond(res: ServerResponse, status: number, body: string): void {
	try {
		if (!res.headersSent) {
			res.writeHead(status);
			res.end(body);
		}
	} catch {
		// The connection may have already closed; there is nothing to do.
	}
}
