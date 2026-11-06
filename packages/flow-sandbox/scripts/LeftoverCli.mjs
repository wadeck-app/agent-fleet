#!/usr/bin/env node

/**
 * `leftover list` and `leftover remove <name>`: inspect and remove the plugin's own sandboxes
 * (names `flow-sbx-<wrapperId>-<executionId>`). Nothing is ever removed automatically; `remove` needs the
 * exact name and is refused while the run or its wrapper is alive.
 *
 * Usage (from the repository root):
 *   node --import tsx packages/flow-sandbox/scripts/LeftoverCli.mjs list
 *   node --import tsx packages/flow-sandbox/scripts/LeftoverCli.mjs remove flow-sbx-w1-exec0001
 *
 * Env:
 *   FLOW_SANDBOX_PRESENCE_DIR  where wrappers publish their presence files
 *                              (default ~/.config/flow/sandbox-presence, flow's ConfigDir 'flow').
 *   SBX_PATH                   sbx executable when it is not in the default install directory.
 *
 * Exit code: 0 done, 1 refused or failed, 2 usage error.
 */
import os from 'node:os';
import path from 'node:path';

import { LeftoverCommand } from '../src/LeftoverCommand.ts';
import { LeftoverSandboxes } from '../src/LeftoverSandboxes.ts';
import { SbxCliRuntime } from '../src/SbxCliRuntime.ts';
import { SystemClock } from '../src/SystemClock.ts';
import { WrapperPresence } from '../src/WrapperPresence.ts';

function isProcessAlive(pid) {
	try {
		process.kill(pid, 0);
		return true;
	} catch (error) {
		// EPERM = the process exists but belongs to someone else.
		return error.code === 'EPERM';
	}
}

const presenceDirectory =
	process.env.FLOW_SANDBOX_PRESENCE_DIR ?? path.join(os.homedir(), '.config', 'flow', 'sandbox-presence');
const log = {
	info: message => console.error(`info: ${message}`),
	warn: message => console.error(`warn: ${message}`),
};
const leftovers = new LeftoverSandboxes(
	new SbxCliRuntime(),
	new SystemClock(),
	log,
	new WrapperPresence(presenceDirectory, isProcessAlive, process.pid)
);
const command = new LeftoverCommand(leftovers, {
	out: line => console.log(line),
	err: line => console.error(line),
});

process.exitCode = await command.run(process.argv.slice(2));
