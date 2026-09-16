import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';

import type { ReconnectNotifier } from './ReconnectNotifier.js';

const BODY_TIMEOUT_MS = 5_000;
const MAX_BODY_BYTES = 4_096;

/**
 * HTTP server that receives a "nudge" from the daemon when it is ready to accept workers.
 *
 * The daemon sends a POST to `<nudgeUrl>` with `{ wsUrl }` in the body. The worker
 * connects immediately instead of waiting for its backoff timer to fire.
 *
 * Advantages over the file-watch approach:
 * - Works for remote workers: the daemon dials the URL, so no shared filesystem is needed.
 * - The URL is delivered in the body, so the worker does not need to read `worker.port`.
 *
 * The server binds to 127.0.0.1 by default. For a worker on another machine, bind to
 * 0.0.0.0 and publish the real address (not yet exposed via config; this is the foundation).
 *
 * The server is `unref()`'d -- it does not keep the Node process alive. The reconnect timer
 * already does that deliberately (D#51).
 */
export class NudgeServer implements ReconnectNotifier {
	private callback: ((wsUrl: string | undefined) => void) | undefined;
	private readonly server: Server;
	private started = false;

	constructor() {
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

		let raw: string;
		try {
			raw = await readBody(req);
		} catch (err) {
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
		// Respond before firing the callback: the daemon's POST must not block waiting for
		// the WebSocket handshake to complete (the daemon may be the one the worker dials).
		safeRespond(res, 200, 'ok');

		try {
			this.callback?.(wsUrl);
		} catch (err) {
			console.error(`[nudge] callback error: ${String(err)}`);
		}
	}
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
			body += chunk.toString('utf8');
			if (body.length > MAX_BODY_BYTES) {
				settle(() => reject(new Error('body exceeds maximum size')));
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
