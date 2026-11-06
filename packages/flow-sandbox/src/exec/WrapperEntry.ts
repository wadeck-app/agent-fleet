import os from 'node:os';

import { PresenceDirectory } from '../PresenceDirectory';
import { SbxBinaryLocator } from '../SbxBinaryLocator';
import { SbxCliRuntime } from '../SbxCliRuntime';
import { SbxPrerequisiteCheck } from '../SbxPrerequisiteCheck';
import { SbxProcess } from '../SbxProcess';
import { WrapperLog } from '../WrapperLog';
import { HarnessConfigParser } from '../harness/HarnessConfig';
import { runExecWrapper } from './ExecMain';
import { WrapperPreflight } from './WrapperPreflight';

/**
 * The two things `wrapper.cjs` does (the sandbox plugin starts it, see plugin/plugin.config.js):
 * - `wrapper.cjs preflight <options>`: checks the options and this machine, runs nothing, exits 0 or fails with the fix;
 * - `wrapper.cjs <options>`: the exec wrapper itself (a worker for the daemon named by FLOW_DAEMON_WS_URL).
 * The options are the ones of HarnessConfigParser in both modes.
 */
export async function runWrapperEntry(argv: readonly string[], env: NodeJS.ProcessEnv): Promise<void> {
	if (argv[0] !== 'preflight') {
		await runExecWrapper(argv, env);
		return;
	}
	const config = new HarnessConfigParser('wrapper.cjs preflight').parse(
		argv.slice(1),
		env,
		PresenceDirectory.defaultPath(os.homedir())
	);
	const runtime = new SbxCliRuntime();
	await new WrapperPreflight({
		prerequisites: () =>
			new SbxPrerequisiteCheck(runtime, { acceptSshAgentForwarding: config.acceptSshAgentForwarding }).run(),
		templateListing: async () => {
			const binary = new SbxBinaryLocator({
				binaryPath: undefined,
				env,
				platform: process.platform,
				nodeExecutable: process.execPath,
			}).locate();
			const result = await new SbxProcess().run({
				binary,
				args: ['template', 'ls'],
				env,
				timeoutMs: 60_000,
			});
			if (result.exitCode !== 0) {
				throw new Error(`sbx template ls exited with ${result.exitCode}: ${result.stderr.trim()}`);
			}
			return result.stdout;
		},
		log: new WrapperLog('preflight', undefined),
	}).run(config);
}
