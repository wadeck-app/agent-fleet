import { DaemonNotRunningError } from '@wadeck-app/singleton-daemon-kit';

import { describeCliFailure } from './CliFailureText';

/** Socket-level failures of a daemon that is closing, or already closed, its listener. */
const CLOSING_DAEMON_ERRNO = new Set(['ECONNRESET', 'ECONNREFUSED', 'ECONNABORTED', 'EPIPE']);

/**
 * Whether the failure means "no daemon is serving right now" rather than "the daemon answered, and said no".
 *
 * The client library maps only errors whose MESSAGE contains ECONNREFUSED/ECONNRESET/timeout, so "socket hang up" (code
 * ECONNRESET, a message without the word) and "write EPIPE" come out raw. An error the daemon itself returned for the
 * command (no errno code) is never one of these.
 */
export function isDaemonUnavailable(err: unknown): boolean {
	if (err instanceof DaemonNotRunningError) {
		return true;
	}
	const code = (err as NodeJS.ErrnoException | undefined)?.code;
	return code !== undefined && CLOSING_DAEMON_ERRNO.has(code);
}

export type DaemonContactFailureKind = 'timeout' | 'not-running' | 'other';

/**
 * Separates "the daemon did not answer in time" from "no daemon is serving" and from "the daemon answered, and said no".
 *
 * The client library maps its `HTTP timeout after 5s` (request delivered, daemon slow to answer) to the same
 * DaemonNotRunningError as a refused connection, so only the message tells them apart. A timeout must be checked first:
 * the request may have been received and applied, which "not running" would wrongly rule out.
 */
export function classifyDaemonContactFailure(err: unknown): DaemonContactFailureKind {
	const message = err instanceof Error ? err.message : String(err);
	if (/timeout|timed out/i.test(message)) {
		return 'timeout';
	}
	return isDaemonUnavailable(err) ? 'not-running' : 'other';
}

/** Shared wording for a timeout: not "not running", the request may have been received, and what to check. */
export const DAEMON_TIMEOUT_TEXT =
	'The daemon did not answer within 5 s, so the request may have been received and applied anyway. ' +
	'Check before running it again: flow status (is the daemon alive?), then flow history or flow worker list (did the change happen?).';

export interface DaemonContactFailure {
	/** True when the daemon did not answer in time (the request may have been received). */
	timedOut: boolean;
	/** True when no daemon is serving; the caller may print its own, more specific, text instead of {@link message}. */
	notRunning: boolean;
	/** What to print: the real cause (no stack unless `FLOW_DEBUG=1`) and where to look. */
	message: string;
}

/** The line that tells where the daemon's own account of a failure is. */
export function daemonLogHint(): string {
	return 'Check the daemon log: flow logs (it holds the errors of the daemon itself).';
}

/**
 * What to tell a user whose command could not get an answer from the daemon. Replaces a bare
 * "Failed to contact the daemon.", which swallowed the cause.
 */
export function describeDaemonContactFailure(err: unknown, env: NodeJS.ProcessEnv = process.env): DaemonContactFailure {
	const kind = classifyDaemonContactFailure(err);
	if (kind === 'timeout') {
		return { timedOut: true, notRunning: false, message: DAEMON_TIMEOUT_TEXT };
	}
	if (kind === 'not-running') {
		return { timedOut: false, notRunning: true, message: 'The daemon is not running (start it with: flow start).' };
	}
	return {
		timedOut: false,
		notRunning: false,
		message: `Failed to contact the daemon: ${describeCliFailure(err, env)}\n${daemonLogHint()}`,
	};
}
