import { type CommandMap, type DaemonClient, createDaemonClient } from '@wadeck-app/singleton-daemon-kit';

/**
 * A client that only ever talks to the running daemon. The command table is empty on purpose: a
 * local handler would be used as an in-process fallback when no daemon runs and would answer from
 * nothing, so a listing would say "no workers" while a daemon with live workers existed.
 * Callers declare the commands they send in `TCommands`, all optional.
 */
export function createRemoteDaemonClient<TCommands extends CommandMap = CommandMap>(
	daemonDir: string
): DaemonClient<TCommands> {
	if (typeof daemonDir !== 'string' || daemonDir.trim() === '') {
		throw new Error(
			`createRemoteDaemonClient needs a non-empty daemon directory (got ${JSON.stringify(daemonDir)}). Pass the flow config directory, e.g. ConfigDir.get('flow').`
		);
	}
	// Every command of TCommands is optional by contract, so an empty table is a valid (and intended) value.
	return createDaemonClient<TCommands>({ configDir: daemonDir, commands: {} as TCommands });
}

/** The daemon is long-lived, so it can predate a command the CLI now sends. */
export function isUnknownCommandError(message: string): boolean {
	return /unknown command/i.test(message);
}

/** Saying "unknown command" alone would send the user looking for a typo in their own command line. */
export function outdatedDaemonMessage(commandLabel: string): string {
	return `The running daemon does not support "${commandLabel}" -- it started before this command existed. Restart it with "flow stop" then "flow start", or run "flow cli update" first if its version is older than this CLI.`;
}
