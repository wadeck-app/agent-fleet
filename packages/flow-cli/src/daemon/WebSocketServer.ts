import * as http from 'node:http';
import { type WebSocket, WebSocketServer as WsServer } from 'ws';

import type { WorkerToDaemon } from '../ipc/Protocol.js';

export type MessageHandler = (ws: WebSocket, message: WorkerToDaemon) => void;
export type CloseHandler = (ws: WebSocket) => void;

export class WebSocketServer {
	private readonly wss: WsServer;
	private readonly httpServer: http.Server;

	constructor(
		private readonly port: number,
		private readonly onMessage: MessageHandler,
		private readonly onClose: CloseHandler
	) {
		this.httpServer = http.createServer();
		// maxPayload: 1 MiB — consistent with McpServer.readBody() cap.
		// The ws default (100 MiB) would allow a rogue local process to exhaust daemon memory.
		this.wss = new WsServer({ server: this.httpServer, maxPayload: 1024 * 1024 });
		this.wss.on('connection', (ws: WebSocket) => this.handleConnection(ws));
		this.httpServer.listen(port, '127.0.0.1');
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
