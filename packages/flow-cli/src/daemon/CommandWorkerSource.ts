import type { WorkerRequest, WorkerSourceProvider } from 'extension-points';
import { spawn } from 'node:child_process';

const BUILT_IN_COMMAND = 'built-in:command';

/**
 * Environment for a spawned source command: the daemon's own, minus what is daemon-only.
 *
 * FLOW_DAEMON_MODE must never reach the child. FlowIndex turns any process carrying it into a
 * daemon *regardless of its arguments*, so inheriting it made `--command "flow worker"` start a
 * second daemon, which contacted its sources at startup and started a third -- an unbounded chain,
 * and the reason built-in:command could never work.
 */
function childEnv(additions: Record<string, string>): NodeJS.ProcessEnv {
	const env: NodeJS.ProcessEnv = { ...process.env, ...additions };
	delete env['FLOW_DAEMON_MODE'];
	return env;
}

/** Options a `built-in:command` source entry carries. */
export interface CommandSourceOptions {
	command?: string;
	args?: string[];
	cwd?: string;
}

/**
 * A source that creates a worker by running a command.
 *
 * The command is usually just `flow worker`: everything it needs -- where to register, as what,
 * for which projects, and with which credential -- arrives in its environment.
 *
 * The credential is minted for this launch alone, not read from the registry: only a hash of the
 * registration token is stored (T-09), and a `built-in:command` entry could not embed one either,
 * since the token does not exist when the source is declared. A command that carries its own
 * `--token` still works; nothing is then minted for it.
 */
export class CommandWorkerSource implements WorkerSourceProvider {
	constructor(
		private readonly options: CommandSourceOptions,
		private readonly issueLaunchToken?: (sourceId: string) => string
	) {}

	// eslint-disable-next-line @typescript-eslint/require-await -- async by interface contract
	async obtainWorker(request: WorkerRequest): Promise<void> {
		const { command } = this.options;
		if (command === undefined || command.trim() === '') {
			throw new Error(
				`source "${request.sourceId}" uses ${BUILT_IN_COMMAND} but declares no command to run. Add options.command to the source entry.`
			);
		}

		// violations-suppress: cli/no-spawn-without-windows-hide the command may launch an interactive worker the user watches; windowsHide would strip the console it prints into (d032e7e)
		const child = spawn(command, this.options.args ?? [], {
			...(this.options.cwd !== undefined ? { cwd: this.options.cwd } : {}),
			env: childEnv({
				// Everything the launched worker needs to configure itself. See the class doc for
				// why the credential is minted here rather than read from the registry.
				FLOW_DAEMON_WS_URL: request.daemonEndpoint,
				FLOW_WORKER_SOURCE_ID: request.sourceId,
				FLOW_WORKER_PROJECTS: request.projects.join(','),
				...(this.issueLaunchToken !== undefined
					? { FLOW_WORKER_TOKEN: this.issueLaunchToken(request.sourceId) }
					: {}),
			}),
			stdio: ['ignore', 'ignore', 'pipe'],
			shell: true,
		});

		if (child.pid === undefined) {
			throw new Error(`source "${request.sourceId}": the command produced no pid, so no worker will join`);
		}
		// The daemon does not own this worker's lifetime -- the source does (D#41).
		child.unref();
		child.stderr?.on('data', (data: Buffer) => {
			process.stderr.write(`[source ${request.sourceId}] ${data.toString()}`);
		});
	}
}
