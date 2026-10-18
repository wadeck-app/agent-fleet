import type { WorkerSourceEntry } from '../daemon/WorkerSourceRegistry.js';

/** What `flow worker list` could establish about the daemon it asked. */
export type DaemonStatus =
	| { running: false; reason: string }
	| {
			running: true;
			// Undefined when the port file could not be read: the daemon answered, so it is running,
			// but its identity is unknown. Said so rather than omitted.
			pid: number | undefined;
			port: number | undefined;
			startedAt: string | undefined;
	  };

/** A daemon younger than this may still be waiting for the workers of its predecessor to come back. */
const RECONNECT_WINDOW_MS = 60_000;

function formatUptime(ms: number): string {
	const seconds = Math.max(0, Math.floor(ms / 1_000));
	if (seconds < 60) return `${String(seconds)}s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${String(minutes)}m${String(seconds % 60)}s`;
	return `${String(Math.floor(minutes / 60))}h${String(minutes % 60)}m`;
}

/**
 * Why the list can be empty while workers are alive: a daemon idle-stops by design (D#51) and
 * disconnects them, and they only come back once a daemon is up again. `flow worker list` never
 * starts one, so "no daemon" and "daemon just restarted" must be told apart from "nothing attached".
 */
function describeDaemon(daemon: DaemonStatus, now: number): string[] {
	if (!daemon.running) {
		return [
			`The daemon is not reachable, so no daemon is running to hold connections (${daemon.reason}).`,
			'A daemon stops itself when idle (nothing queued or running), which disconnects external workers; they reconnect on their own (retry delay up to 30s) once a daemon is up again.',
			'"flow worker list" does not start one: run "flow start" or a flow, then list again. To launch a worker yourself, see "flow worker --help".',
		];
	}
	if (daemon.pid === undefined || daemon.port === undefined || daemon.startedAt === undefined) {
		return [
			'The daemon is running (details unavailable: its port file could not be read), but holds no worker connection.',
			'To launch a worker yourself, see "flow worker --help".',
		];
	}
	const uptimeMs = now - Date.parse(daemon.startedAt);
	return [
		`Daemon pid=${String(daemon.pid)} port=${String(daemon.port)} up ${formatUptime(uptimeMs)} (started at ${daemon.startedAt}).`,
		uptimeMs < RECONNECT_WINDOW_MS
			? 'It started recently: workers connected to a previous daemon may still be reconnecting (retry delay up to 30s). Retry in a few seconds.'
			: 'To launch a worker yourself, see "flow worker --help".',
	];
}

/**
 * Explains "no live workers" using what the registry knows.
 *
 * `flow worker list` shows live connections only, because only a connection proves availability
 * (D#4). But answering with nothing more than "no workers are connected" left the reader unable to
 * tell the two situations apart that decide what to do next: nothing declared at all, or a source
 * declared and simply not contacted yet. The registry is readable without a daemon, so there is no
 * reason to make them run a second command to find out.
 *
 * Deliberately never says "available": a declared source is intent, not capacity.
 */
export function describeNoLiveWorkers(declared: WorkerSourceEntry[], daemon: DaemonStatus, now: number): string {
	const lines: string[] = ['No worker is connected.', ...describeDaemon(daemon, now)];
	const daemonRunning = daemon.running;

	if (declared.length === 0) {
		lines.push(
			'No worker source is declared either, so the daemon has nothing to create one from.',
			'Declare one with: flow worker source add <id> --provider built-in:command --command "flow worker"',
			'Or run "flow worker" in a project directory to attach one yourself.'
		);
		return lines.join('\n');
	}

	lines.push(`${String(declared.length)} worker source declared:`);
	for (const entry of declared) {
		const labels = entry.labels.length > 0 ? entry.labels.join(',') : '-';
		lines.push(`  ${entry.sourceId}\t${entry.provider}\tmax=${String(entry.maxWorkers)}\tlabels=${labels}`);
	}
	lines.push(
		daemonRunning
			? 'Each was already asked for a worker; none has connected. See the daemon log for what it reported.'
			: // Not "when a daemon starts": a daemon with nothing to do stops in about a second, so
				// asking then produced a worker it immediately disconnected. Capacity is requested
				// when a step needs it.
				'They are asked for a worker when a step needs one, so run a flow. "flow start" only brings the daemon up.'
	);
	return lines.join('\n');
}
