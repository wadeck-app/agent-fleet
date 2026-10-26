import { DaemonNotRunningError, readPortFile } from '@wadeck-app/singleton-daemon-kit';
import { createRemoteDaemonClient } from 'flow-core';
import * as path from 'node:path';
import { getErrorMessage } from 'shared-common/utils/getErrorMessage';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { type ClientCommand, DAEMON_STOPPING_CODE, type DaemonResponse } from '../../ipc/Protocol';
import { describeCliFailure } from './CliFailureText';
import { spawnDaemonBackground } from './DaemonBackgroundSpawner';

// violations-suppress-end: ts/no-deep-relative

type FlowCommands = { run?: (payload: unknown) => Promise<DaemonResponse> };

/** How many times a run is sent before giving up on reaching a daemon. */
export const DAEMON_CONTACT_ATTEMPTS = 8;

/** Pause after the first failed attempt (milliseconds); it grows with each attempt. */
const DEFAULT_BACKOFF_MS = 150;

/** Socket-level failures of a daemon that is closing, or already closed, its listener. */
const CLOSING_DAEMON_ERRNO = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE']);

/** The run could not be delivered to any daemon, after {@link DAEMON_CONTACT_ATTEMPTS} attempts. The message says what to do. */
export class DaemonContactError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'DaemonContactError';
	}
}

export interface SendToDaemonOptions {
	/** Base pause between attempts (milliseconds). Tests shrink it. */
	backoffMs?: number;
}

/**
 * Whether the failure means "no daemon is serving right now" rather than "the daemon answered, and said no".
 *
 * The daemon the previous `flow run` started stops itself about a second after its last execution. A run sent while it
 * closes sees the port file still there and a listener that refuses, resets or hangs up. The client library maps only
 * errors whose MESSAGE contains ECONNREFUSED/ECONNRESET/timeout, so "socket hang up" (code ECONNRESET, a message
 * without the word) and "write EPIPE" came out raw and ended the run with a bare "Failed to contact the daemon.".
 * An error the daemon itself returned for the run (no errno code) is never one of these.
 */
function meansNoDaemonServing(err: unknown): boolean {
	if (err instanceof DaemonNotRunningError) {
		return true;
	}
	const code = (err as NodeJS.ErrnoException | undefined)?.code;
	return code !== undefined && CLOSING_DAEMON_ERRNO.has(code);
}

function isStoppingAnswer(response: DaemonResponse): boolean {
	return response.type === 'error' && response.code === DAEMON_STOPPING_CODE;
}

/** Where to look, shared by every message below. */
function logHint(daemonDir: string): string {
	return (
		`Check the daemon log: flow logs (files in ${path.join(daemonDir, 'logs')}). ` +
		`To start the daemon yourself: flow start; to see its own start-up error, run it in the foreground (FLOW_DAEMON_MODE=1 flow).`
	);
}

async function describePort(daemonDir: string): Promise<string> {
	const data = await readPortFile(daemonDir);
	return data === null
		? `no port file in ${daemonDir}`
		: `port ${String(data.port)}, daemon pid ${String(data.pid)} (${path.join(daemonDir, 'config.port')})`;
}

/**
 * Sends a run to the daemon, starting one when none is serving.
 *
 * A daemon that is stopping, closed, or closing is treated as "not running": a daemon is started (or the stop of the
 * old one awaited) and the run is sent again, up to {@link DAEMON_CONTACT_ATTEMPTS} attempts with a growing pause. An
 * error the daemon returned for the run itself (a refusal) is rethrown at once: starting another daemon would only
 * repeat it.
 *
 * @throws DaemonContactError when no daemon could be reached; the message gives what was tried, the port and the log.
 * @throws Error the daemon's own error for the run, unchanged.
 * @exits 3 when a daemon could not be started at all.
 */
export async function sendToDaemon(
	cmd: Extract<ClientCommand, { type: 'run' }>,
	daemonDir: string,
	options: SendToDaemonOptions = {}
): Promise<DaemonResponse> {
	const backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
	const makeClient = () => createRemoteDaemonClient<FlowCommands>(daemonDir);
	let lastCause = '';
	for (let attempt = 1; attempt <= DAEMON_CONTACT_ATTEMPTS; attempt++) {
		try {
			const response = (await makeClient().send('run', cmd)) as DaemonResponse;
			if (!isStoppingAnswer(response)) {
				return response;
			}
			lastCause = 'the daemon answered that it is stopping';
		} catch (err) {
			if (!meansNoDaemonServing(err)) {
				throw err;
			}
			lastCause = getErrorMessage(err);
		}
		if (attempt === DAEMON_CONTACT_ATTEMPTS) {
			break;
		}
		await ensureDaemon(daemonDir);
		await new Promise(resolve => setTimeout(resolve, backoffMs * attempt));
	}
	throw new DaemonContactError(
		`Failed to contact the daemon after ${String(DAEMON_CONTACT_ATTEMPTS)} attempts: ${lastCause}.\n` +
			`Tried each time: send the run, start a daemon when none answers, wait, send again. Last known daemon: ${await describePort(daemonDir)}.\n` +
			logHint(daemonDir)
	);
}

/** Starts a daemon when none is live (no-op when one is, including one that is still stopping). Exits 3 when it cannot. */
async function ensureDaemon(daemonDir: string): Promise<void> {
	try {
		await spawnDaemonBackground(daemonDir);
	} catch (err) {
		// violations-suppress: security/no-raw-err-in-cli describeCliFailure prints the message only (stack under FLOW_DEBUG=1), followed by where to look
		console.error(`Daemon could not be started: ${describeCliFailure(err)}\n${logHint(daemonDir)}`);
		process.exit(3); // D34: exit 3 = daemon start failed
	}
}
