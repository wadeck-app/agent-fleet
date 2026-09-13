import { readFileSync } from 'node:fs';
import * as http from 'node:http';
import * as https from 'node:https';
import { type WebSocket, WebSocketServer as WsServer } from 'ws';

import type { WorkerToDaemon } from '../ipc/Protocol';
import { admitTransport, resolveBindAddress } from './TransportPolicy.js';

export type MessageHandler = (ws: WebSocket, message: WorkerToDaemon) => void;
export type CloseHandler = (ws: WebSocket) => void;

export interface WebSocketServerOptions {
	/** Address to bind. Loopback when omitted. */
	bindAddress?: string;
	/** Paths to the PEM certificate and key that make this listener TLS. */
	tls?: { cert: string; key: string } | null;
}

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
		this.wss = new WsServer({ server: this.httpServer, maxPayload: 1024 * 1024 });
		this.wss.on('connection', (ws: WebSocket) => this.handleConnection(ws));
		// ws re-emits httpServer errors; without a handler Node.js throws unhandled 'error'
		// and crashes the daemon. EADDRINUSE during port scan is handled by tryBind -- suppress here.
		this.wss.on('error', () => {});
	}

	/** Bind to the requested port, retrying up to 10 increments on EADDRINUSE (e.g. TIME_WAIT). */
	start(): Promise<number> {
		return new Promise((resolve, reject) => {
			const tryBind = (p: number, attemptsLeft: number): void => {
				this.httpServer.once('error', (err: NodeJS.ErrnoException) => {
					if (err.code === 'EADDRINUSE' && attemptsLeft > 0) {
						tryBind(p + 1, attemptsLeft - 1);
					} else {
						reject(err);
					}
				});
				this.httpServer.once('listening', () => {
					// Read back from the socket rather than trusting the number we asked for. With
					// port 0 the OS picks one, and recording the request would publish "0" for every
					// worker to dial. Any other divergence is worth inheriting rather than guessing.
					const address = this.httpServer.address();
					this._port = typeof address === 'object' && address !== null ? address.port : p;
					resolve(this._port);
				});
				this.httpServer.listen(p, this.bindAddress);
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
			process.stderr.write(`[WebSocketServer] ${decision.reason}\n`);
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
		ws.on('close', () => this.onClose(ws));
		ws.on('error', (err: Error) => {
			process.stderr.write(`[WebSocketServer] connection error: ${String(err)}\n`);
			ws.terminate();
		});
	}

	close(): void {
		this.wss.close();
		this.httpServer.close();
	}
}
