import type { ApprovalProvider } from 'extension-points';
import { StepRunner } from 'flow-engine';
import { normalizeError } from 'shared-common/utils/getErrorMessage';
import { WebSocket } from 'ws';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import type { DaemonToWorker, WorkerReady, WorkerToDaemon } from '../../ipc/Protocol';
import type { McpServerConfig } from '../../worker/McpServer';
import type { ReconnectNotifier } from '../../worker/ReconnectNotifier';
import { WorkerAdapter } from '../../worker/WorkerAdapter';
import type { WorkerDisplay } from '../../worker/WorkerDisplay';
import {
	buildStepRunnerConfig,
	reconnectDelayMs,
	resolveDaemonWsUrl,
	scheduleReconnectTimer,
	withFreshToken,
} from '../../worker/WorkerLaunch';
import { report, ts } from './WorkerReport';
import type { BusyTracker } from './WorkerSelfUpdate';
// violations-suppress-end: ts/no-deep-relative
import { handleWorkerMessage } from './handleWorkerMessage';

function formatDelay(ms: number): string {
	if (ms < 1_000) {
		return `${String(ms)}ms`;
	}
	return `${String(Math.round(ms / 1_000))}s`;
}

export interface WorkerConnectionConfig {
	daemonDir: string;
	configuredWsPort: number | null;
	registration: Omit<WorkerReady, 'type'>;
	display: WorkerDisplay;
	approvalProvider: ApprovalProvider | undefined;
	notifiers: ReconnectNotifier[];
	/** Re-read on every attempt: the daemon rotates its own token each time it starts. */
	resolveToken: () => string;
	/** `--interactive`: see {@link buildStepRunnerConfig}. Independent of `approvalProvider`. */
	interactive: boolean;
	/** Shared across reconnects (see runWorker): a step in flight across a reconnect is still busy. */
	busyTracker: BusyTracker;
}

/**
 * Opens a connection to the daemon and re-opens it for as long as the process lives.
 *
 * `attempt` only grows while connections keep failing; a successful registration resets
 * it, so a long-lived worker does not inherit a long backoff from an earlier outage.
 */
export class WorkerConnection {
	constructor(private readonly config: WorkerConnectionConfig) {}

	/**
	 * `wsUrlOverride` is provided when a nudge delivered the address; otherwise the worker
	 * reads `worker.port` from the daemon directory itself.
	 */
	connect(wsUrlOverride: string | undefined, attempt: number): void {
		const { daemonDir, configuredWsPort, registration, display, approvalProvider, resolveToken, interactive } =
			this.config;
		let wsUrl: string;
		if (wsUrlOverride !== undefined) {
			wsUrl = wsUrlOverride;
		} else {
			try {
				wsUrl = resolveDaemonWsUrl(daemonDir, configuredWsPort);
			} catch (err) {
				// The daemon may simply not be up yet; report and keep waiting rather than exiting.
				report('[wait]', normalizeError(err).message);
				this.scheduleReconnect(attempt + 1);
				return;
			}
		}

		const ws = new WebSocket(wsUrl);
		const adapter = new WorkerAdapter(
			(mcpServers: McpServerConfig[]) =>
				new StepRunner(buildStepRunnerConfig(approvalProvider, mcpServers, interactive))
		);

		const send = (message: WorkerToDaemon): void => {
			if (ws.readyState === ws.OPEN) {
				ws.send(JSON.stringify(message));
			}
		};

		ws.on('open', () => {
			send({ type: 'ready', ...withFreshToken(registration, resolveToken) });
		});

		ws.on('message', (data: Buffer) => {
			let message: DaemonToWorker;
			try {
				message = JSON.parse(data.toString()) as DaemonToWorker;
			} catch (err) {
				report('[warn]', `ignored an unparseable daemon message: ${String(err)}`);
				return;
			}
			void handleWorkerMessage(message, adapter, send, registration, display, this.config.busyTracker);
		});

		ws.on('error', (err: Error) => {
			// Not fatal: the daemon may be restarting. The close handler schedules the retry.
			report('[warn]', `connection error: ${normalizeError(err).message}`);
		});

		ws.on('close', () => {
			const delay = reconnectDelayMs(attempt + 1);
			console.log(`[${ts()}] [wait] daemon connection closed; next attempt in ${formatDelay(delay)}`);
			this.scheduleReconnect(attempt + 1);
		});
	}

	private scheduleReconnect(attempt: number): void {
		const { notifiers } = this.config;
		// Three ways to learn the daemon is back, whichever arrives first:
		// 1. An HTTP nudge from the daemon (NudgeServer): delivers the wsUrl directly, works remotely.
		// 2. A filesystem event (DaemonWatchNotifier): local-only, worker reads worker.port itself.
		// 3. The backoff timer: always fires regardless of the above two, so a missed notification
		//    costs only latency.
		let fired = false;
		const reconnect = (wsUrlFromNudge?: string): void => {
			if (fired) {
				return;
			}
			fired = true;
			clearTimeout(timer);
			// Disarm all notifiers so a late-arriving nudge does not trigger a second connect.
			for (const n of notifiers) n.onNotify(undefined);
			this.connect(wsUrlFromNudge, attempt);
		};

		const timer = scheduleReconnectTimer(reconnectDelayMs(attempt), () => reconnect(undefined));
		for (const n of notifiers) {
			n.onNotify(wsUrl => reconnect(wsUrl));
		}
	}
}
