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

export interface DaemonContactFailure {
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
	if (isDaemonUnavailable(err)) {
		return { notRunning: true, message: 'The daemon is not running (start it with: flow start).' };
	}
	return {
		notRunning: false,
		message: `Failed to contact the daemon: ${describeCliFailure(err, env)}\n${daemonLogHint()}`,
	};
}
