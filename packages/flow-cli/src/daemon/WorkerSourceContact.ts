import type { WorkerRequest, WorkerSourceProvider } from 'extension-points';
import { spawn } from 'node:child_process';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import type { RegisteredHost } from './HostRegistry.js';
import { HostWorkerSource } from './HostWorkerSource.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

/** The S1 implementations that ship with flow. */
const BUILT_IN_INBOUND = 'built-in:inbound';
const BUILT_IN_COMMAND = 'built-in:command';
const BUILT_IN_HOST = 'built-in:host';

/** What an implementation may need from the daemon to reach its source. */
export interface SourceProviderDependencies {
	/** Looks up the live connection for a source, for the host provider (D#17). */
	findHost?: (sourceId: string) => RegisteredHost | undefined;
}

/**
 * A source whose workers are already running and dial the daemon themselves.
 *
 * `obtainWorker` deliberately does nothing: there is no channel to reach such a worker,
 * which is the whole point of an inbound source -- trust originates from the worker
 * choosing to present itself (D#18). Resolving is not a claim that a worker appeared;
 * the interface says as much, and the caller bounds its own wait (D#66).
 */
export class InboundWorkerSource implements WorkerSourceProvider {
	// eslint-disable-next-line @typescript-eslint/require-await -- async by interface contract
	async obtainWorker(_request: WorkerRequest): Promise<void> {
		// Nothing to initiate. An inbound worker connects on its own schedule.
	}
}

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
 * The command is expected to be something like `flow worker --source <id> --token <tok>`,
 * possibly over ssh. **It must carry its own credential**: the registry stores only a hash
 * of the registration token (T-09), so the daemon cannot hand one out, and inventing one
 * would mean the token was recoverable after all.
 */
export class CommandWorkerSource implements WorkerSourceProvider {
	constructor(private readonly options: CommandSourceOptions) {}

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
				// Where to register, and as what. No token: see the class doc.
				FLOW_DAEMON_WS_URL: request.daemonEndpoint,
				FLOW_WORKER_SOURCE_ID: request.sourceId,
				FLOW_WORKER_PROJECTS: request.projects.join(','),
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

/**
 * Builds the S1 implementation named by a source entry.
 *
 * @throws on an unrecognised provider. There is deliberately no fallback: silently
 *         treating a typo as the inbound provider would look exactly like a worker that
 *         never turns up, which is the least debuggable failure available.
 */
export function resolveSourceProvider(
	provider: string,
	options: CommandSourceOptions,
	dependencies: SourceProviderDependencies = {}
): WorkerSourceProvider {
	switch (provider) {
		case BUILT_IN_INBOUND:
			return new InboundWorkerSource();
		case BUILT_IN_COMMAND:
			return new CommandWorkerSource(options);
		case BUILT_IN_HOST: {
			const { findHost } = dependencies;
			if (findHost === undefined) {
				// Refused rather than degraded: a host source with no way to reach hosts would
				// silently produce nothing, which is indistinguishable from a machine that is
				// merely offline.
				throw new Error(
					`provider ${BUILT_IN_HOST} needs the daemon's host registry, which was not supplied. This is a wiring mistake in the daemon, not a configuration error -- please report it.`
				);
			}
			return new HostWorkerSource(findHost);
		}
		default:
			throw new Error(
				`unknown worker source provider "${provider}". Supported in v1: ${BUILT_IN_INBOUND}, ${BUILT_IN_COMMAND}, ${BUILT_IN_HOST}.`
			);
	}
}

/**
 * Asks every declared source to produce a worker, at daemon startup (D#54).
 *
 * The daemon pushes; a worker never polls. Nothing here pins the daemon (D#51) and
 * nothing waits for a worker to appear -- a source that produces none simply has no live
 * connection, and dispatch only ever targets live connections (D#4).
 *
 * One failing source never prevents the others from being contacted, and never passes
 * unnoticed: each failure is reported by source name (D#25).
 */
export async function contactDeclaredSources(
	entries: WorkerSourceEntry[],
	daemonEndpoint: string,
	report: (message: string) => void,
	dependencies: SourceProviderDependencies = {}
): Promise<void> {
	for (const entry of entries) {
		try {
			const provider = resolveSourceProvider(
				entry.provider,
				(entry.options ?? {}) as CommandSourceOptions,
				dependencies
			);
			await provider.obtainWorker({
				daemonEndpoint,
				sourceId: entry.sourceId,
				projects: [],
			});
		} catch (err) {
			report(`could not obtain a worker from source "${entry.sourceId}": ${normalizeError(err).message}`);
		}
	}
}
