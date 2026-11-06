import { WebSocketServer, WebSocket as WorkerSocket } from 'ws';

/**
 * Runs INSIDE the VM (bundled to /opt/flow/inner-bridge.cjs). The flow worker bundle (`worker.cjs`, the forked-worker
 * entry) dials `ws://127.0.0.1:$FLOW_WS_PORT` and cannot send a token; this shim therefore
 * - listens on a local loopback port and starts the unmodified worker against it,
 * - dials the host bridge with the token in the `x-flow-bridge-token` header (the placeholder; the sbx proxy swaps it),
 *   using Node's BUILT-IN WebSocket: the VM sets NODE_USE_ENV_PROXY=1, which makes it go through the sbx proxy. The `ws`
 *   library connects directly, bypasses the proxy and therefore the substitution (measured: the bridge saw the
 *   placeholder text, 401). Do not replace it by `ws` here.
 * - relays text frames both ways, queuing what the bridge sends until the worker is connected.
 * The worker never sees the token: it is removed from its environment.
 */

/** Largest frame accepted from either side; the same limit as the daemon's (flow-cli WorkerFrameLimit). */
const MAX_FRAME_BYTES = 1024 * 1024;
const TOKEN_HEADER = 'x-flow-bridge-token';

export interface WorkerProcess {
	/** Registers the exit callback. */
	onExit(callback: (code: number | null) => void): void;
	kill(): void;
}

export interface InnerBridgeShimOptions {
	bridgeUrl: string;
	/** Placeholder (or value) sent in the token header. */
	token: string;
	/** Starts the worker with `FLOW_WS_PORT=<port>`. */
	spawnWorker: (localPort: number) => WorkerProcess;
	log: (line: string) => void;
}

export class InnerBridgeShim {
	private server: WebSocketServer | undefined;
	private bridge: WebSocket | undefined;
	private worker: WorkerSocket | undefined;
	private process: WorkerProcess | undefined;
	private readonly pending: string[] = [];
	private finish: ((code: number) => void) | undefined;

	constructor(private readonly options: InnerBridgeShimOptions) {}

	/** Resolves with the exit code the shim should use: the worker's own, or 1 when the bridge failed. */
	run(): Promise<number> {
		return new Promise<number>((resolve, reject) => {
			this.finish = code => {
				this.close();
				resolve(code);
			};
			const server = new WebSocketServer({ host: '127.0.0.1', port: 0, maxPayload: MAX_FRAME_BYTES });
			this.server = server;
			server.once('error', reject);
			server.once('listening', () => {
				const address = server.address();
				if (address === null || typeof address === 'string') {
					reject(new Error('The local worker port could not be determined.'));
					return;
				}
				server.on('connection', socket => this.acceptWorker(socket));
				this.connectBridge(address.port);
			});
		});
	}

	private connectBridge(localPort: number): void {
		const bridge = new WebSocket(this.options.bridgeUrl, { headers: { [TOKEN_HEADER]: this.options.token } });
		this.bridge = bridge;
		bridge.addEventListener('open', () => {
			this.options.log(
				`[inner-bridge] connected to ${this.options.bridgeUrl}; starting the worker on 127.0.0.1:${localPort}`
			);
			const worker = this.options.spawnWorker(localPort);
			this.process = worker;
			worker.onExit(code => {
				this.options.log(`[inner-bridge] the worker exited (code ${String(code)})`);
				this.finish?.(code ?? 1);
			});
		});
		bridge.addEventListener('message', event => {
			if (typeof event.data !== 'string') return;
			if (this.worker !== undefined && this.worker.readyState === WorkerSocket.OPEN) this.worker.send(event.data);
			else this.pending.push(event.data);
		});
		let opened = false;
		bridge.addEventListener('open', () => {
			opened = true;
		});
		bridge.addEventListener('error', () => {
			// The built-in WebSocket does not expose the HTTP status of a refused upgrade: say what it usually is.
			this.options.log(
				opened
					? '[inner-bridge] bridge connection error'
					: '[inner-bridge] the bridge could not be reached or refused the connection (usually HTTP 401: the token placeholder was not substituted, or 409: another connection is open; the host bridge log says which)'
			);
		});
		bridge.addEventListener('close', event => {
			this.options.log(`[inner-bridge] the bridge connection closed (code ${event.code})`);
			this.finish?.(1);
		});
	}

	private acceptWorker(socket: WorkerSocket): void {
		if (this.worker !== undefined) {
			socket.close(1008, 'only one worker');
			return;
		}
		this.worker = socket;
		socket.on('message', (data, isBinary) => {
			if (isBinary) return;
			if (this.bridge?.readyState === WebSocket.OPEN) this.bridge.send(data.toString());
		});
		socket.on('close', () => {
			this.worker = undefined;
		});
		for (const text of this.pending.splice(0)) socket.send(text);
	}

	private close(): void {
		this.process?.kill();
		this.bridge?.close();
		this.worker?.terminate();
		this.server?.close();
	}
}
