// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { describeCliFailure } from './CliFailureText';
import { spawnDaemonBackground } from './DaemonBackgroundSpawner';
import { daemonLogHint } from './DaemonContactFailure';

// violations-suppress-end: ts/no-deep-relative

/**
 * `flow start`: makes sure ONE daemon is up. Goes through the locked, port-file aware spawner, so several
 * concurrent `flow start` (or a `flow run` starting at the same time) cannot start two daemons that evict each other.
 *
 * @exits 3 when the daemon does not come up; stderr gets the cause the daemon recorded (or the timeout) and where to look.
 */
export async function startDaemonCommand(
	daemonDir: string,
	write: (text: string) => void,
	spawnBackground: typeof spawnDaemonBackground = spawnDaemonBackground,
	writeError: (text: string) => void = text => process.stderr.write(text)
): Promise<void> {
	let spawned: boolean;
	try {
		spawned = await spawnBackground(daemonDir);
	} catch (err) {
		// violations-suppress: security/no-raw-err-in-cli describeCliFailure prints the message only (stack under FLOW_DEBUG=1), followed by where to look
		writeError(`[fail] Daemon could not be started: ${describeCliFailure(err)}\n${daemonLogHint()}\n`);
		process.exit(3); // D34: exit 3 = daemon start failed
	}
	write(spawned ? '[ok] daemon started\n' : '[ok] daemon already running\n');
}
