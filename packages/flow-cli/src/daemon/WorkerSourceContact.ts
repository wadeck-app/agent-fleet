import type { WorkerRequest, WorkerSourceProvider } from 'extension-points';
import { spawn } from 'node:child_process';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

import type { RegisteredRelay } from './RelayRegistry.js';
import { RelayWorkerSource } from './RelayWorkerSource.js';
import { sendNudge } from './NudgeDispatch.js';
import type { WorkerSourceEntry } from './WorkerSourceRegistry.js';

/** The S1 implementations that ship with flow. */
const BUILT_IN_INBOUND = 'built-in:inbound';
const BUILT_IN_COMMAND = 'built-in:command';
const BUILT_IN_RELAY = 'built-in:relay';

/** What an implementation may need from the daemon to reach its source. */
export interface SourceProviderDependencies {
	/** Looks up the live connection for a source, for the relay provider (D#17). */
	findRelay?: (sourceId: string) => RegisteredRelay | undefined;
	/**
	 * Mints the one-shot credential a launched worker registers with (T-09).
	 *
	 * Optional so a command declared with its own `--token` keeps working; when absent, nothing is
	 * minted and the command is responsible for its own credential.
	 */
	issueLaunchToken?: (sourceId: string) => string;
}

/**
 * A source whose workers are already running and dial the daemon themselves.
 *
 * When the entry carries a `nudgeUrl`, `obtainWorker` sends a single HTTP POST to it,
 * delivering the daemon's WS address so the worker can connect immediately rather than
 * waiting for its backoff timer. The nudge is best-effort: a failure is reported and
 * ignored, because the worker reconnects via backoff regardless (D#4, D#66).
 *
 * Without a `nudgeUrl` there is no channel to the worker, which is the whole point of
 * an inbound source: trust originates from the worker choosing to present itself (D#18).
 */
export class InboundWorkerSource implements WorkerSourceProvider {
	constructor(private readonly nudgeUrl?: string) {}

	async obtainWorker(request: WorkerRequest): Promise<void> {
		if (this.nudgeUrl === undefined) return;
		try {
			await sendNudge(this.nudgeUrl, request.daemonEndpoint);
		} catch (err) {
			// Not fatal: the worker reconnects via backoff. Throw so the caller can log it.
			throw new Error(
				`nudge to "${request.sourceId}" at ${this.nudgeUrl} failed: ${normalizeError(err).message}`
			);
		}
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
	dependencies: SourceProviderDependencies = {},
	nudgeUrl?: string
): WorkerSourceProvider {
	switch (provider) {
		case BUILT_IN_INBOUND:
			return new InboundWorkerSource(nudgeUrl);
		case BUILT_IN_COMMAND:
			return new CommandWorkerSource(options, dependencies.issueLaunchToken);
		case BUILT_IN_RELAY: {
			const { findRelay } = dependencies;
			if (findRelay === undefined) {
				// Refused rather than degraded: a relay source with no way to reach relays would
				// silently produce nothing, which is indistinguishable from a relay that is
				// merely offline.
				throw new Error(
					`provider ${BUILT_IN_RELAY} needs the daemon's relay registry, which was not supplied. This is a wiring mistake in the daemon, not a configuration error -- please report it.`
				);
			}
			return new RelayWorkerSource(findRelay);
		}
		default:
			throw new Error(
				`unknown worker source provider "${provider}". Supported in v1: ${BUILT_IN_INBOUND}, ${BUILT_IN_COMMAND}, ${BUILT_IN_RELAY}.`
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
				dependencies,
				entry.nudgeUrl
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
