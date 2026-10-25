import { readFileSync } from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import { type WebSocket, WebSocketServer as WsServer } from 'ws';

import type { WorkerToDaemon } from '../ipc/Protocol';
import { MAX_WORKER_FRAME_BYTES } from '../ipc/WorkerFrameLimit';
import { admitTransport, resolveBindAddress } from './TransportPolicy.js';

export type MessageHandler = (ws: WebSocket, message: WorkerToDaemon) => void;
/** `code` and `reason` are what the peer (or the transport) closed with; 1006 means no close frame arrived. */
export type CloseHandler = (ws: WebSocket, code: number, reason: string) => void;

/** Where connection diagnostics go. The daemon is detached with stdio ignored, so stderr is not enough. */
export type ConnectionLog = (level: 'info' | 'error', message: string) => void;

const NORMAL_CLOSE_CODES = new Set([1000, 1001]);
const CLOSE_CODE_MESSAGE_TOO_BIG = 1009;

function stderrLog(level: 'info' | 'error', message: string): void {
	process.stderr.write(`[WebSocketServer] ${level}: ${message}\n`);
}

export interface WebSocketServerOptions {
	/** Receives connection errors, closes and refusals. Stderr when omitted (tests); the daemon passes its log. */
	log?: ConnectionLog;
	/** Address to bind. Loopback when omitted. */
	bindAddress?: string;
	/** Paths to the PEM certificate and key that make this listener TLS. */
	tls?: { cert: string; key: string } | null;
	/**
	 * Binds the listener to a port. Defaults to `server.listen(port, address)`. Injected by tests to exercise the
	 * port scan (taken, reserved, exhausted) without depending on which ports the machine has free.
	 */
	bind?: PortBinder;
	/**
	 * How long close() lets connected peers finish the close handshake before terminating them. Short by default: the
	 * daemon is going away and an open connection is what would keep its process alive.
	 */
	closeGraceMs?: number;
}

/** Starts listening; reports success through the server's 'listening' event and failure through its 'error' event. */
export type PortBinder = (server: http.Server | https.Server, port: number, address: string) => void;

/** Errors that mean "not this port": taken (EADDRINUSE) or inside a Windows excluded/reserved range (EACCES). */
const SKIPPABLE_BIND_ERRORS = new Set(['EADDRINUSE', 'EACCES']);

/** See {@link WebSocketServerOptions.closeGraceMs}. */
const DEFAULT_CLOSE_GRACE_MS = 2_000;

/** Thrown by start() when close() came first: no listener was (or will be) bound. */
export class WebSocketServerClosedError extends Error {
	constructor() {
		super('The WebSocket server was closed before it finished binding a port; no listener was left open.');
		this.name = 'WebSocketServerClosedError';
	}
}

const defaultBind: PortBinder = (server, port, address) => {
	server.listen(port, address);
};

/**
 * The daemon's worker listener.
 *
 * Plaintext on loopback, TLS when configured, and it **refuses** any unencrypted connection
 * from a non-loopback peer rather than serving it (P-5). Authentication of the peer itself is
 * separate and happens on `ready` (S7); this is only about the channel.
 */
export class WebSocketServer {
	private readonly wss: WsServer;
	private readonly httpServer: http.Server | https.Server;
	private readonly bindAddress: string;
	private _port: number;
	private closed = false;
	private readonly log: ConnectionLog;
	private readonly bind: PortBinder;
	private readonly closeGraceMs: number;

	constructor(
		port: number,
		private readonly onMessage: MessageHandler,
		private readonly onClose: CloseHandler,
		options: WebSocketServerOptions = {}
	) {
		this._port = port;
		// Resolved before anything binds, so a wide address with no certificate fails at
		// startup instead of opening a port that refuses every peer it accepts.
		this.bindAddress = resolveBindAddress(options.bindAddress, { hasTls: options.tls != null });
		this.httpServer =
			options.tls != null
				? https.createServer({
						// Read here rather than accepted inline: a key pasted into config is a key
						// committed to version control.
						cert: readFileSync(options.tls.cert, 'utf8'),
						key: readFileSync(options.tls.key, 'utf8'),
					})
				: http.createServer();
		// maxPayload: 1 MiB -- consistent with McpServer.readBody() cap.
		// The ws default (100 MiB) would allow a rogue local process to exhaust daemon memory.
		this.log = options.log ?? stderrLog;
		this.bind = options.bind ?? defaultBind;
		this.closeGraceMs = options.closeGraceMs ?? DEFAULT_CLOSE_GRACE_MS;
		this.wss = new WsServer({ server: this.httpServer, maxPayload: MAX_WORKER_FRAME_BYTES });
		this.wss.on('connection', (ws: WebSocket) => this.handleConnection(ws));
		// ws re-emits httpServer errors; without a handler Node.js throws unhandled 'error'
		// and crashes the daemon. EADDRINUSE during port scan is handled by tryBind -- suppress here.
		this.wss.on('error', () => {});
	}

	/**
	 * Bind to the requested port, retrying up to 10 increments on EADDRINUSE (e.g. TIME_WAIT) or EACCES (Windows excluded port ranges).
	 *
	 * When the whole range is taken, an OS-assigned port is bound instead of failing: the bound port is published for
	 * workers to read, so any free one serves, while a daemon with no listener accepts runs it can never execute.
	 * Callers compare the returned port with the requested one to report the move.
	 */
	start(): Promise<number> {
		return new Promise((resolve, reject) => {
			const tryBind = (p: number, attemptsLeft: number): void => {
				// Checked before every attempt: a close() that landed between two of them must not be undone by the next one.
				if (this.closed) {
					reject(new WebSocketServerClosedError());
					return;
				}
				this.httpServer.once('error', (err: NodeJS.ErrnoException) => {
					const skippable = err.code !== undefined && SKIPPABLE_BIND_ERRORS.has(err.code);
					if (skippable && attemptsLeft > 0) {
						tryBind(p + 1, attemptsLeft - 1);
					} else if (skippable && p !== 0) {
						tryBind(0, 0);
					} else {
						reject(err);
					}
				});
				this.httpServer.once('listening', () => {
					if (this.closed) {
						reject(new WebSocketServerClosedError());
						return;
					}
					// Read back from the socket rather than trusting the number we asked for. With
					// port 0 the OS picks one, and recording the request would publish "0" for every
					// worker to dial. Any other divergence is worth inheriting rather than guessing.
					const address = this.httpServer.address();
					this._port = typeof address === 'object' && address !== null ? address.port : p;
					resolve(this._port);
				});
				this.bind(this.httpServer, p, this.bindAddress);
			};
			tryBind(this._port, 10);
		});
	}

	get port(): number {
		return this._port;
	}

	private handleConnection(ws: WebSocket): void {
		// P-5, checked before a single message is read: an unencrypted peer that is not on this
		// machine is closed, not warned about. Nothing it sent is acted on, because the first
		// thing it would send is a credential.
		const socket = (ws as unknown as { _socket?: { remoteAddress?: string; encrypted?: boolean } })._socket;
		const decision = admitTransport({
			...(socket?.remoteAddress !== undefined ? { remoteAddress: socket.remoteAddress } : {}),
			encrypted: socket?.encrypted === true,
		});
		if (!decision.ok) {
			this.log('error', decision.reason);
			ws.terminate();
			return;
		}

		ws.on('message', (data: Buffer) => {
			let message: WorkerToDaemon;
			try {
				message = JSON.parse(data.toString()) as WorkerToDaemon;
			} catch {
				return;
			}
			this.onMessage(ws, message);
		});
		ws.on('close', (code: number, reason: Buffer) => {
			const reasonText = reason.toString();
			const hint =
				code === CLOSE_CODE_MESSAGE_TOO_BIG
					? `; a frame exceeded the ${String(MAX_WORKER_FRAME_BYTES)}-byte limit`
					: '';
			this.log(
				NORMAL_CLOSE_CODES.has(code) ? 'info' : 'error',
				`worker connection closed (code ${String(code)}, reason "${reasonText}")${hint}`
			);
			this.onClose(ws, code, reasonText);
		});
		ws.on('error', (err: Error) => {
			const tooBig = (err as NodeJS.ErrnoException).code === 'WS_ERR_UNSUPPORTED_MESSAGE_LENGTH';
			this.log(
				'error',
				`connection error: ${String(err)}${tooBig ? ` (a frame exceeded the ${String(MAX_WORKER_FRAME_BYTES)}-byte limit; the worker sent too much data in one message)` : ''}`
			);
			ws.terminate();
		});
	}

	/**
	 * Stops listening AND disconnects every peer. Safe to call more than once: every stop path closes the listener, and
	 * some reach it twice.
	 *
	 * Peers are closed here because nobody else can be relied on to: `ws` leaves existing connections open on close(), the
	 * registries only know the peers that registered, and a connected socket is a referenced handle. One forgotten peer
	 * (a worker that never sent `ready`, a relay, a wedged forked worker ignoring `done`) kept a daemon that had already
	 * deleted its port file alive indefinitely. Peers get the close handshake first and are terminated after a short grace.
	 */
	close(): void {
		if (this.closed) {
			return;
		}
		this.closed = true;
		this.wss.close();
		this.httpServer.close();
		const peers = [...this.wss.clients];
		for (const peer of peers) {
			peer.close(1001, 'daemon stopping');
		}
		if (peers.length > 0) {
			// Unref'd: the sockets keep the loop alive until they are gone, so the timer still fires when it matters and
			// never delays an exit that is otherwise possible.
			setTimeout(() => {
				for (const peer of peers) {
					peer.terminate();
				}
			}, this.closeGraceMs).unref();
		}
	}
}
