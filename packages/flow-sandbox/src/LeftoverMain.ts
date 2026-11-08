import fs from 'node:fs';
import os from 'node:os';

import { LeftoverCommand } from './LeftoverCommand';
import { LeftoverSandboxes } from './LeftoverSandboxes';
import { PresenceDirectory } from './PresenceDirectory';
import { isProcessAlive } from './ProcessLiveness';
import { SbxCliRuntime } from './SbxCliRuntime';
import { SystemClock } from './SystemClock';
import { WrapperPresence } from './WrapperPresence';

/**
 * `leftover list | remove <name> [--force]` over the real sbx and the real presence directory (decision 26: explicit command only,
 * never automatic). Shared by the repository script (scripts/LeftoverCli.mjs) and the shipped plugin artifact
 * (`wrapper.cjs leftover ...`), so a user without a source checkout has the command the messages point to. Returns the exit code.
 */
export async function runLeftover(args: readonly string[], env: NodeJS.ProcessEnv): Promise<number> {
	// The same resolution as the wrappers (--presence-dir, then the variable, then the default): one source of truth.
	const presenceDirectory = PresenceDirectory.resolve(undefined, env, PresenceDirectory.defaultPath(os.homedir()));
	const log = {
		info: (message: string): void => console.error(`info: ${message}`),
		warn: (message: string): void => console.error(`warn: ${message}`),
	};
	const leftovers = new LeftoverSandboxes(
		new SbxCliRuntime({ env }),
		new SystemClock(),
		log,
		new WrapperPresence(presenceDirectory, isProcessAlive, process.pid)
	);
	return new LeftoverCommand(
		leftovers,
		{ out: line => console.log(line), err: line => console.error(line) },
		{ directory: presenceDirectory, exists: () => fs.existsSync(presenceDirectory) }
	).run(args);
}
