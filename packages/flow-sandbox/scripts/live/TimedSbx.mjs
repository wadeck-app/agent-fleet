#!/usr/bin/env node
/**
 * A pass-through for the real `sbx` that records how long each command took: used as the plugin option `sbxPath` by
 * PluginLiveCheck.mjs to measure `sbx rm` at the end of a run and to order it against the release of the workspace.
 *
 * Environment: SBX_REAL_PATH (the real sbx executable, required) and SBX_TIMING_LOG (a file that gets one JSON line per command:
 * argv words, start and end as epoch milliseconds, exit code). Standard input, output and error are passed through unchanged.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const real = process.env.SBX_REAL_PATH;
const log = process.env.SBX_TIMING_LOG;
if (!real || !log) {
	process.stderr.write('TimedSbx: SBX_REAL_PATH and SBX_TIMING_LOG must be set (see PluginLiveCheck.mjs).\n');
	process.exit(125);
}
const args = process.argv.slice(2);
const startedAt = Date.now();
const child = spawn(real, args, { stdio: 'inherit', windowsHide: true });
child.on('error', error => {
	process.stderr.write(`TimedSbx: cannot run ${real}: ${error.message}\n`);
	process.exit(125);
});
child.on('close', (code, signal) => {
	// Only the first words: arguments after them may hold secrets (env values, commands).
	const words = args.slice(0, 2);
	fs.appendFileSync(log, `${JSON.stringify({ words, startedAt, endedAt: Date.now(), exitCode: code, signal })}\n`);
	process.exit(code ?? 1);
});
