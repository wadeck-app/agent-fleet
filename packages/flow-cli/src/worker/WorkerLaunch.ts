import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { WorkerReady } from '../ipc/Protocol';

/** Longest gap between reconnection attempts, so a restarted daemon is found promptly. */
const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 500;

/**
 * WebSocket endpoint of the running daemon.
 *
 * The port is discovered from the daemon's own `config.port`, never guessed: a worker
 * that invented a port would either fail obscurely or, worse, join something else.
 *
 * @throws when the daemon is not running, naming the command that starts it.
 */
export function resolveDaemonWsUrl(daemonDir: string, configuredWsPort: number | null): string {
	if (configuredWsPort !== null) {
		return `ws://127.0.0.1:${String(configuredWsPort)}`;
	}

	const portFile = join(daemonDir, 'config.port');
	let raw: string;
	try {
		raw = readFileSync(portFile, 'utf8');
	} catch {
		throw new Error(
			`No running flow daemon found (no "${portFile}"). Start one with "flow start", then run "flow worker" again.`
		);
	}

	let parsed: { port?: unknown };
	try {
		parsed = JSON.parse(raw) as { port?: unknown };
	} catch (err) {
		throw new Error(`Failed to parse "${portFile}": ${String(err)}`);
	}
	if (typeof parsed.port !== 'number') {
		throw new Error(`"${portFile}" does not contain a numeric "port"`);
	}

	// The daemon defaults its WebSocket port to the HTTP port plus one.
	return `ws://127.0.0.1:${String(parsed.port + 1)}`;
}

/**
 * Credential this worker will present.
 *
 * A worker naming a source must be given that source's registration token; falling back
 * to the daemon's own token would let any local process join as that source, which is
 * exactly what per-source credentials exist to prevent.
 */
export function resolveWorkerToken(options: { token?: string; sourceId?: string }, daemonDir: string): string {
	if (options.token !== undefined && options.token !== '') {
		return options.token;
	}

	const fromEnv = process.env['FLOW_WORKER_TOKEN'];
	if (fromEnv !== undefined && fromEnv !== '') {
		return fromEnv;
	}

	if (options.sourceId !== undefined && options.sourceId !== '') {
		throw new Error(
			`No credential for source "${options.sourceId}". Pass --token with the registration token printed by "flow worker source add ${options.sourceId} ...", or set FLOW_WORKER_TOKEN. The daemon token is not accepted for a named source.`
		);
	}

	try {
		return readFileSync(join(daemonDir, 'health_token'), 'utf8').trim();
	} catch {
		throw new Error(
			`No credential available: pass --token, set FLOW_WORKER_TOKEN, or start the daemon so its health_token exists in "${daemonDir}".`
		);
	}
}

/** Everything the worker declares about itself on registration. */
export function buildRegistration(params: {
	projectRoot: string;
	extraProjects?: string[];
	isTty: boolean;
	pid: number;
	sourceId?: string;
	labels?: string[];
	token?: string;
}): Omit<WorkerReady, 'type'> {
	for (const label of params.labels ?? []) {
		if (label.trim() === '') {
			throw new Error(
				`Worker labels must not be empty: ${JSON.stringify(params.labels)} contains a blank entry, which no step could match.`
			);
		}
	}

	// The launch project is always served; extras are additive and de-duplicated (D#9).
	const attachedProjects = [params.projectRoot];
	for (const project of params.extraProjects ?? []) {
		if (!attachedProjects.includes(project)) attachedProjects.push(project);
	}

	return {
		pid: params.pid,
		...(params.token !== undefined ? { authToken: params.token } : {}),
		...(params.sourceId !== undefined ? { sourceId: params.sourceId } : {}),
		labels: params.labels ?? [],
		attachedProjects,
		// Only this process can see whether a human is attached (D#33, D#36).
		hasUserInterface: params.isTty,
	};
}

/**
 * Delay before the next reconnection attempt.
 *
 * A `flow worker` must survive the daemon idling out or restarting -- its persistence
 * comes from being registered, not from holding the daemon open (D#51) -- so it waits
 * and retries instead of exiting the way a forked worker does. Never zero, or a dead
 * daemon would spin the process; capped, so a restart is picked up quickly.
 */
export function reconnectDelayMs(attempt: number): number {
	const delay = BASE_RECONNECT_DELAY_MS * 2 ** Math.min(attempt, 10);
	return Math.min(delay, MAX_RECONNECT_DELAY_MS);
}
