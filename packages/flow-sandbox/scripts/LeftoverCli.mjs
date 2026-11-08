#!/usr/bin/env node

/**
 * `leftover list` and `leftover remove <name>`: inspect and remove the plugin's own sandboxes
 * (names `flow-sbx-<wrapperId>-<executionId>`). Nothing is ever removed automatically; `remove` needs the
 * exact name and is refused while the run or its wrapper is alive.
 *
 * Usage (from the repository root):
 *   node --import tsx packages/flow-sandbox/scripts/LeftoverCli.mjs list
 *   node --import tsx packages/flow-sandbox/scripts/LeftoverCli.mjs remove flow-sbx-w1-exec0001 [--force]
 *
 * Env:
 *   FLOW_SANDBOX_PRESENCE_DIR  where wrappers publish their presence files
 *                              (default ~/.config/flow/sandbox-presence, flow's ConfigDir 'flow').
 *   SBX_PATH                   sbx executable when it is not in the default install directory.
 *
 * The shipped plugin has the same command: node <plugins-dir>/plugin-sandbox/wrapper.cjs leftover list | remove <name> [--force]
 *
 * Exit code: 0 done, 1 refused or failed, 2 usage error.
 */
import { runLeftover } from '../src/LeftoverMain.ts';

process.exitCode = await runLeftover(process.argv.slice(2), process.env);
