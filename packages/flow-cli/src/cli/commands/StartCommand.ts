// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { spawnDaemonBackground } from './DaemonBackgroundSpawner';

// violations-suppress-end: ts/no-deep-relative

/**
 * `flow start`: makes sure ONE daemon is up. Goes through the locked, port-file aware spawner, so several
 * concurrent `flow start` (or a `flow run` starting at the same time) cannot start two daemons that evict each other.
 *
 * @throws when the daemon does not publish its port in time (the message names the port file).
 */
export async function startDaemonCommand(
	daemonDir: string,
	write: (text: string) => void,
	spawnBackground: typeof spawnDaemonBackground = spawnDaemonBackground
): Promise<void> {
	const spawned = await spawnBackground(daemonDir);
	write(spawned ? '[ok] daemon started\n' : '[ok] daemon already running\n');
}
