import { WebSocket } from 'ws';

import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import { type JsonObject, MAX_FRAME_BYTES, isJsonObject } from './HarnessMessages';

export interface DaemonLinkOptions {
	/** `FLOW_DAEMON_WS_URL`, given by the built-in:command source. */
	url: string;
	log: SandboxLog;
	onMessage: (message: JsonObject) => void;
	/** The connection ended (the daemon stopped, or refused the registration). */
	onClosed: (code: number, reason: string) => void;
}

/**
 * The wrapper's WebSocket to the daemon: a worker connection, minimal. Unlike `flow worker` it does NOT reconnect: a
 * dialled daemon that goes away ends the harness (the run is interrupted and its sandbox stays stopped), because the
 * one-shot launch token the source minted would be refused on a second attempt anyway.
 */
export class DaemonLink {
	private socket: WebSocket | undefined;

	constructor(private readonly options: DaemonLinkOptions) {}

	connect(): Promise<void> {
		return new Promise<void>((resolve, reject) => {
			const socket = new WebSocket(this.options.url, { maxPayload: MAX_FRAME_BYTES });
			this.socket = socket;
			socket.once('open', () => resolve());
			socket.once('error', error => {
				reject(
					new SandboxError(
						'command-failed',
						`Cannot connect to the flow daemon at ${this.options.url}: ${error.message}. The harness is started by the daemon (built-in:command source); start it through a flow run that needs the "sandbox" label.`,
						{ cause: error }
					)
				);
			});
			socket.on('message', (data, isBinary) => {
				if (isBinary) {
					this.options.log.warn('Ignored a binary frame from the daemon.');
					return;
				}
				let parsed: unknown;
				try {
					parsed = JSON.parse(data.toString());
				} catch {
					this.options.log.warn('Ignored a daemon frame that is not JSON.');
					return;
				}
				if (!isJsonObject(parsed)) {
					this.options.log.warn('Ignored a daemon frame that is not a JSON object.');
					return;
				}
				this.options.onMessage(parsed);
			});
			socket.on('close', (code, reason) => this.options.onClosed(code, reason.toString()));
		});
	}

	get isOpen(): boolean {
		return this.socket?.readyState === WebSocket.OPEN;
	}

	/** Sends one message. Throws (never drops silently) when the connection is down or the frame is too big. */
	send(message: JsonObject): void {
		if (this.socket === undefined || this.socket.readyState !== WebSocket.OPEN) {
			throw new SandboxError(
				'command-failed',
				`Cannot send a "${String(message['type'])}" message: the connection to the flow daemon is closed.`
			);
		}
		const text = JSON.stringify(message);
		const size = Buffer.byteLength(text, 'utf8');
		if (size > MAX_FRAME_BYTES) {
			throw new SandboxError(
				'invalid-argument',
				`A "${String(message['type'])}" message of ${size} bytes exceeds the ${MAX_FRAME_BYTES}-byte limit of the daemon (it would close the connection).`
			);
		}
		this.socket.send(text);
	}

	close(): void {
		this.socket?.close(1000, 'harness stopping');
	}
}
