import * as http from 'node:http';
import { type WebSocket, WebSocketServer as WsServer } from 'ws';

import type { WorkerToDaemon } from '../ipc/Protocol';

export type MessageHandler = (ws: WebSocket, message: WorkerToDaemon) => void;
export type CloseHandler = (ws: WebSocket) => void;

// v1: no token auth on worker WebSocket. Binds to 127.0.0.1 (loopback-only).
// Tracked for v2 in multi-user/container environments.
export class WebSocketServer {
	private readonly wss: WsServer;
	private readonly httpServer: http.Server;
	private _port: number;

	constructor(
		port: number,
		private readonly onMessage: MessageHandler,
		private readonly onClose: CloseHandler
	) {
		this._port = port;
		this.httpServer = http.createServer();
		// maxPayload: 1 MiB -- consistent with McpServer.readBody() cap.
		// The ws default (100 MiB) would allow a rogue local process to exhaust daemon memory.
		this.wss = new WsServer({ server: this.httpServer, maxPayload: 1024 * 1024 });
		this.wss.on('connection', (ws: WebSocket) => this.handleConnection(ws));
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
					this._port = p;
					resolve(p);
				});
				this.httpServer.listen(p, '127.0.0.1');
			};
			tryBind(this._port, 10);
		});
	}

	get port(): number {
		return this._port;
	}

	private handleConnection(ws: WebSocket): void {
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
			process.stderr.write(`[WebSocketServer] connection error: ${err.message}\n`);
			ws.terminate();
		});
	}

	close(): void {
		this.wss.close();
		this.httpServer.close();
	}
}
