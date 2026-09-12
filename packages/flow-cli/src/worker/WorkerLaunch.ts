import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import type { WorkerReady } from '../ipc/Protocol';

/** Longest gap between reconnection attempts, so a restarted daemon is found promptly. */
const MAX_RECONNECT_DELAY_MS = 30_000;
const BASE_RECONNECT_DELAY_MS = 500;

/**
 * WebSocket endpoint of the running daemon.
 *
 * Read from `worker.port`, which the daemon writes once its listener is actually bound --
 * never derived from the HTTP port. The listener retries upward on EADDRINUSE, so the
 * usual `httpPort + 1` is only the first attempt: computing it here would dial whatever
 * else holds that port, failing obscurely or joining something unrelated.
 *
 * @throws when the daemon is not running or is not yet accepting workers, in both cases
 *         naming what to do about it. `flow worker` treats this as "wait and retry".
 */
export function resolveDaemonWsUrl(daemonDir: string, configuredWsPort: number | null): string {
	if (configuredWsPort !== null) {
		return `ws://127.0.0.1:${String(configuredWsPort)}`;
	}

	const portFile = join(daemonDir, 'worker.port');
	let raw: string;
	try {
		raw = readFileSync(portFile, 'utf8');
	} catch {
		// Distinguish "no daemon" from "daemon still binding": the first needs a command,
		// the second only needs a moment, and telling the user to start a daemon that is
		// already running would send them the wrong way.
		if (existsSync(join(daemonDir, 'config.port'))) {
			throw new Error(
				`The flow daemon is running but not accepting workers yet (no "${portFile}"). It publishes that file once its worker listener is bound.`
			);
		}
		throw new Error(
			`No running flow daemon found (no "${join(daemonDir, 'config.port')}"). Start one with "flow start", then run "flow worker" again.`
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

	return `ws://127.0.0.1:${String(parsed.port)}`;
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
