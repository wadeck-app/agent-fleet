import { normalizeError } from 'shared-common/utils/getErrorMessage';

/** Set to 1 to see the stack of an unexpected failure; users never get a stack trace otherwise. */
export const FLOW_DEBUG_ENV = 'FLOW_DEBUG';

/**
 * What a failure looks like on a terminal: its message, never its stack. The stack of an error thrown by the daemon
 * (relayed by the client library) points into the bundle and tells a user nothing they can act on; with
 * `FLOW_DEBUG=1` it is appended for whoever debugs flow itself.
 */
export function describeCliFailure(err: unknown, env: NodeJS.ProcessEnv = process.env): string {
	const message = normalizeError(err).message;
	if (env[FLOW_DEBUG_ENV] === '1' && err instanceof Error && err.stack !== undefined) {
		return `${message}\n${err.stack}`;
	}
	return message;
}

/** The line that tells a user where to look and how to see the failure in full. */
export function debugHint(): string {
	return `Set ${FLOW_DEBUG_ENV}=1 to print the stack trace.`;
}
