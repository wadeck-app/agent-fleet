import type { FlowConfig } from '../config/FlowConfig';
import { writeDaemonLog } from './DaemonLog.js';
import { WebSocketServer, WebSocketServerClosedError } from './WebSocketServer';
import { publishWorkerPort } from './publishWorkerPort.js';

export interface DaemonWorkerListenerHandlers {
	onMessage: ConstructorParameters<typeof WebSocketServer>[1];
	onClose: ConstructorParameters<typeof WebSocketServer>[2];
	/** Called once the listener bound and its port was published. */
	onBound: () => void;
}

/** The socket server workers dial, and the record of the port it really bound. */
export class DaemonWorkerListener {
	readonly server: WebSocketServer;
	private bound: number | undefined;

	constructor(
		private readonly requestedPort: number,
		private readonly logsDir: string,
		private readonly daemonDir: string,
		worker: FlowConfig['worker'],
		private readonly handlers: DaemonWorkerListenerHandlers
	) {
		this.server = new WebSocketServer(requestedPort, handlers.onMessage, handlers.onClose, {
			// Closes and errors of worker connections: stderr is ignored for a detached daemon.
			log: (level, message) => {
				writeDaemonLog(logsDir, level, message);
			},
			bindAddress: worker.bindAddress,
			tls: worker.tls,
		});
	}

	/**
	 * The port the listener bound, or undefined while it is still binding. Recorded so nothing has to read the port
	 * before it means anything: the server reports the *requested* port until it binds, and the retry means that
	 * request is often wrong.
	 */
	get boundPort(): number | undefined {
		return this.bound;
	}

	/**
	 * Fire-and-forget: start() retries on EADDRINUSE (TIME_WAIT). Workers read the port lazily via a getter -- they are
	 * only spawned after tryDispatch(), which happens after handleRun(), which happens after the start hook returns.
	 * By then start() has resolved.
	 */
	start(): void {
		this.server
			.start()
			.then(boundPort => {
				this.bound = boundPort;
				if (boundPort !== this.requestedPort) {
					writeDaemonLog(
						this.logsDir,
						'info',
						`Worker listener bound on port ${String(boundPort)} instead of ${String(this.requestedPort)}: the requested port and the ones above it were in use (orphaned flow daemons keep theirs; look for stray node processes running flow.cjs). Workers read the real port from worker.port.`
					);
				}
				// Published because the retry means the bound port is not always
				// `httpPort + 1`. A client that assumed the offset would dial whatever
				// else holds that port, so the real one is written down for them.
				publishWorkerPort(this.daemonDir, boundPort);
				this.handlers.onBound();
			})
			.catch((err: Error) => {
				if (err instanceof WebSocketServerClosedError) {
					// Stopped while still scanning for a port: nothing was bound, nothing to publish.
					writeDaemonLog(this.logsDir, 'info', 'Worker listener not bound: the daemon stopped first');
					return;
				}
				process.stderr.write(`[daemon] WebSocket server failed to start: ${String(err)}\n`);
			});
	}
}
