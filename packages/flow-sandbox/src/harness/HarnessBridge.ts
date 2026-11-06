import type { IncomingMessage } from 'node:http';
import type { AddressInfo } from 'node:net';
import { type RawData, WebSocket, WebSocketServer } from 'ws';

import { SandboxError } from '../SandboxError';
import type { SandboxLog } from '../SandboxLog';
import { BRIDGE_TOKEN_HEADER, type BridgeTokenGuard } from './BridgeTokenGuard';
import { type JsonObject, MAX_FRAME_BYTES } from './HarnessMessages';

export interface HarnessBridgeOptions {
	tokens: BridgeTokenGuard;
	log: SandboxLog;
	/** Port to listen on. Default 0: the system picks a free one. */
	port?: number;
	/** Called with each text frame of the inner worker (already size-limited by the socket). */
	onFrame: (raw: string) => void;
	/** Called when the (only) inner connection ends. */
	onInnerClosed: () => void;
}

/**
 * The server the inner worker dials from inside the VM (`ws://host.docker.internal:<port>`, reached through the
 * sbx proxy, which swaps the token placeholder in the header for the real token).
 *
 * - Binds 127.0.0.1 only. The upgrade is refused (401) without the right token header, and refused (409) while
 *   another inner connection is open: the wrapper serves one sandbox at a time.
 * - Frames above the daemon limit close the connection (ws `maxPayload`), so a forged giant frame never reaches
 *   the daemon connection.
 * - Binary frames are dropped and logged. Everything else is handed to `onFrame`; deciding what is allowed is
 *   InsideMessageGuard's job, not this class's.
 */
export class HarnessBridge {
	private server: WebSocketServer | undefined;
	private inner: WebSocket | undefined;
	private waiters: { resolve: () => void; reject: (error: Error) => void }[] = [];

	constructor(private readonly options: HarnessBridgeOptions) {}

	get port(): number {
		const address = this.server?.address();
		if (address === undefined || address === null || typeof address === 'string') {
			throw new SandboxError('invalid-argument', 'HarnessBridge is not started: call start() first.');
		}
		return (address as AddressInfo).port;
	}

	get hasInner(): boolean {
		return this.inner !== undefined && this.inner.readyState === WebSocket.OPEN;
	}

	async start(): Promise<number> {
		if (this.server !== undefined) throw new SandboxError('invalid-argument', 'HarnessBridge is already started.');
		const server = new WebSocketServer({
			host: '127.0.0.1',
			port: this.options.port ?? 0,
			maxPayload: MAX_FRAME_BYTES,
			verifyClient: (info, accept) => this.verify(info.req, accept),
		});
		await new Promise<void>((resolve, reject) => {
			server.once('listening', resolve);
			server.once('error', reject);
		});
		server.on('connection', socket => this.accept(socket));
		this.server = server;
		this.options.log.info(`bridge listening on 127.0.0.1:${this.port}`);
		return this.port;
	}

	async stop(): Promise<void> {
		const server = this.server;
		this.server = undefined;
		this.inner?.terminate();
		this.inner = undefined;
		this.rejectWaiters(new SandboxError('aborted', 'The bridge was stopped.'));
		if (server === undefined) return;
		await new Promise<void>(resolve => server.close(() => resolve()));
	}

	/** Resolves when the inner worker is connected; rejects after `timeoutMs` or when `signal` aborts. */
	waitForInner(timeoutMs: number, signal?: AbortSignal): Promise<void> {
		if (this.hasInner) return Promise.resolve();
		return new Promise<void>((resolve, reject) => {
			const waiter = {
				resolve: () => {
					cleanup();
					resolve();
				},
				reject: (error: Error) => {
					cleanup();
					reject(error);
				},
			};
			const timer = setTimeout(
				() =>
					waiter.reject(
						new SandboxError(
							'timeout',
							`The inner worker did not connect to the bridge within ${timeoutMs} ms. Check that the sandbox can reach host.docker.internal:${this.port} (a sandbox-scoped rule for localhost:${this.port} is needed) and read the inner worker log lines above.`
						)
					),
				timeoutMs
			);
			const onAbort = (): void =>
				waiter.reject(new SandboxError('aborted', 'Waiting for the inner worker was aborted.'));
			const cleanup = (): void => {
				clearTimeout(timer);
				signal?.removeEventListener('abort', onAbort);
				this.waiters = this.waiters.filter(candidate => candidate !== waiter);
			};
			signal?.addEventListener('abort', onAbort);
			this.waiters.push(waiter);
		});
	}

	/** Sends one JSON message to the inner worker. Throws when nobody is connected. */
	send(message: JsonObject): void {
		if (!this.hasInner || this.inner === undefined) {
			throw new SandboxError('invalid-argument', 'No inner worker is connected to the bridge.');
		}
		this.inner.send(JSON.stringify(message));
	}

	/** Closes the inner connection (the process in the VM is not stopped by this). */
	closeInner(): void {
		this.inner?.close(1000, 'bridge closing');
	}

	private verify(request: IncomingMessage, accept: (result: boolean, code?: number, message?: string) => void): void {
		const peer = request.socket.remoteAddress ?? 'unknown peer';
		const verdict = this.options.tokens.verify(request.headers[BRIDGE_TOKEN_HEADER]);
		if (!verdict.ok) {
			this.options.log.warn(`bridge refused a connection from ${peer}: ${verdict.reason}.`);
			accept(false, 401, 'unauthorized');
			return;
		}
		if (this.inner !== undefined && this.inner.readyState !== WebSocket.CLOSED) {
			this.options.log.warn(
				`bridge refused a second inner connection from ${peer}: one is already open (a process in the sandbox other than the inner worker presented the token).`
			);
			accept(false, 409, 'already connected');
			return;
		}
		accept(true);
	}

	private accept(socket: WebSocket): void {
		this.inner = socket;
		this.options.log.info('bridge: inner worker connected.');
		socket.on('message', (data: RawData, isBinary: boolean) => {
			if (isBinary) {
				this.options.log.warn('bridge dropped a binary frame from the sandbox: only text frames are used.');
				return;
			}
			this.options.onFrame(rawToText(data));
		});
		socket.on('error', error => {
			this.options.log.warn(`bridge: inner connection error: ${error.message}.`);
		});
		socket.on('close', (code: number) => {
			if (this.inner === socket) this.inner = undefined;
			this.options.log.info(`bridge: inner worker disconnected (code ${code}).`);
			this.options.onInnerClosed();
		});
		for (const waiter of [...this.waiters]) waiter.resolve();
	}

	private rejectWaiters(error: Error): void {
		for (const waiter of [...this.waiters]) waiter.reject(error);
	}
}

function rawToText(data: RawData): string {
	if (typeof data === 'string') return data;
	if (Buffer.isBuffer(data)) return data.toString('utf8');
	if (Array.isArray(data)) return Buffer.concat(data).toString('utf8');
	return Buffer.from(data).toString('utf8');
}
