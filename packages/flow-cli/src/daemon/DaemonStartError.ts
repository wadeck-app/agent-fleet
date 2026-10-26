import { logsDirOf } from 'flow-core';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { getErrorMessage, normalizeError } from 'shared-common/utils/getErrorMessage';

import { writeDaemonLog } from './DaemonLog.js';

/**
 * Where a daemon that died while starting leaves its reason, in the daemon directory.
 *
 * A daemon runs detached, so the stderr that holds its fatal error goes nowhere. The command that spawned it
 * (`flow run`, `flow start`) reads this file when the daemon does not come up, and prints the cause.
 */
export const DAEMON_START_ERROR_FILE = 'daemon-start-error.json';

export interface DaemonStartError {
	message: string;
	pid?: number;
	at?: string;
}

/** The message of a failure; its stack too under `FLOW_DEBUG=1` (the stack of a bundle tells a user nothing). */
function describeStartFailure(err: unknown, env: NodeJS.ProcessEnv): string {
	const message = normalizeError(err).message;
	return env['FLOW_DEBUG'] === '1' && err instanceof Error && err.stack !== undefined
		? `${message}\n${err.stack}`
		: message;
}

/**
 * Records a fatal start-up error: in the daemon log (error level) and in {@link DAEMON_START_ERROR_FILE}.
 * Never throws: it runs while the process is already failing, and must not hide the original error.
 */
export function recordDaemonStartError(daemonDir: string, err: unknown, env: NodeJS.ProcessEnv = process.env): void {
	const message = describeStartFailure(err, env);
	writeDaemonLog(logsDirOf(daemonDir), 'error', `Daemon (pid ${String(process.pid)}) failed to start: ${message}`);
	const record: DaemonStartError = { message, pid: process.pid, at: new Date().toISOString() };
	try {
		fs.mkdirSync(daemonDir, { recursive: true, mode: 0o700 });
		fs.writeFileSync(path.join(daemonDir, DAEMON_START_ERROR_FILE), JSON.stringify(record) + '\n', 'utf8');
	} catch (writeErr) {
		process.stderr.write(`[daemon] Failed to record the start error: ${getErrorMessage(writeErr)}\n`);
	}
}

/**
 * @returns the recorded start error, or null when there is none. A file that cannot be parsed is still reported (as
 * such, with its path) rather than hidden: its existence means a daemon failed to start.
 */
export function readDaemonStartError(daemonDir: string): DaemonStartError | null {
	const file = path.join(daemonDir, DAEMON_START_ERROR_FILE);
	if (!fs.existsSync(file)) {
		return null;
	}
	try {
		const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<DaemonStartError>;
		if (typeof parsed.message !== 'string') {
			throw new Error('no "message" field');
		}
		return {
			message: parsed.message,
			...(parsed.pid === undefined ? {} : { pid: parsed.pid }),
			...(parsed.at === undefined ? {} : { at: parsed.at }),
		};
	} catch (err) {
		return {
			message: `the daemon failed to start, but "${file}" holding the reason cannot be read (${getErrorMessage(err)}). Look at the daemon log instead.`,
		};
	}
}

/** Removes the record, once a daemon has started (or before one is spawned). Nothing to remove is fine. */
export function clearDaemonStartError(daemonDir: string): void {
	fs.rmSync(path.join(daemonDir, DAEMON_START_ERROR_FILE), { force: true });
}
