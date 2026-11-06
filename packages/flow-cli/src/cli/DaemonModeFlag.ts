/** The variable `flow start` sets on the process it spawns to make it a daemon (see WindowsDaemonLauncherScript). */
export const DAEMON_MODE_VARIABLE = 'FLOW_DAEMON_MODE';

/**
 * Tells whether this process was started as the daemon, and takes the marker out of its environment.
 *
 * FlowIndex turns any process that carries the variable into a daemon, whatever its arguments. A daemon that kept it
 * handed it to everything it starts with its own environment (the queue SDK's `queue start`, hence the queue daemon,
 * hence every subscriber command such as `flow run`): those commands then became daemons that yielded to the live one
 * and exited 0 with no output and no execution.
 */
export function consumeDaemonModeFlag(env: NodeJS.ProcessEnv): boolean {
	const isDaemon = env[DAEMON_MODE_VARIABLE] === '1';
	delete env[DAEMON_MODE_VARIABLE];
	return isDaemon;
}
