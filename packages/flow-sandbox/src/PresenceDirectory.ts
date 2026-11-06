import path from 'node:path';

/** Environment variable that points every part of the plugin (wrappers, `leftover` CLI) at one presence directory. */
export const PRESENCE_DIRECTORY_VARIABLE = 'FLOW_SANDBOX_PRESENCE_DIR';

/**
 * Where the wrappers publish their presence files (WrapperPresence). ONE resolution, used by the wrappers
 * (`--presence-dir`) and by `scripts/LeftoverCli.mjs`: a wrapper and the CLI that decides whether it is alive must look
 * at the same directory, or `leftover remove` would take a live run for a dead one.
 */
export class PresenceDirectory {
	/** flow's ConfigDir 'flow': `<home>/.config/flow/sandbox-presence`. */
	static defaultPath(homeDirectory: string): string {
		return path.join(homeDirectory, '.config', 'flow', 'sandbox-presence');
	}

	/** The explicit option, else the variable (an empty one counts as unset), else `fallback`. Always absolute. */
	static resolve(explicit: string | undefined, env: NodeJS.ProcessEnv, fallback: string): string {
		const fromEnvironment = env[PRESENCE_DIRECTORY_VARIABLE];
		return path.resolve(
			explicit ?? (fromEnvironment === undefined || fromEnvironment === '' ? fallback : fromEnvironment)
		);
	}
}
