import { DAEMON_STOPPING_CODE, type DaemonResponse } from '../ipc/Protocol.js';
import type { DaemonIdleShutdown } from './DaemonIdleShutdown.js';

type DaemonCommand = (payload: unknown) => Promise<unknown> | unknown;

/**
 * The command table with `run` guarded: a run reaching a daemon that decided to stop is refused with a typed
 * {@link DAEMON_STOPPING_CODE} answer instead of being accepted and lost when the daemon exits, and a run being accepted
 * keeps the daemon from stopping (see {@link DaemonIdleShutdown.admit}).
 *
 * @throws Error when the table has no `run` command: a guard that guards nothing would hide the loss it exists to prevent.
 */
export function guardRunAgainstStop(
	commands: Record<string, DaemonCommand>,
	admission: Pick<DaemonIdleShutdown, 'admit'>
): Record<string, DaemonCommand> {
	const run = commands['run'];
	if (run === undefined) {
		throw new Error('The daemon command table has no "run" command to guard against an idle stop.');
	}
	const stopping: DaemonResponse = {
		type: 'error',
		code: DAEMON_STOPPING_CODE,
		message:
			'The daemon is stopping (it had nothing left to do) and accepted no new run. ' +
			'The client starts another daemon and sends the run again.',
	};
	return {
		...commands,
		run: (payload: unknown) =>
			admission.admit(
				() => run(payload),
				() => stopping
			),
	};
}
