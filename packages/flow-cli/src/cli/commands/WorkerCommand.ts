import { ConfigDir } from '@wadeck-app/shared-cli';
import { DaemonNotRunningError, createDaemonClient } from '@wadeck-app/singleton-daemon-kit';
import type { Command } from 'commander';
import type { ApprovalProvider } from 'extension-points';
import { StepRunner } from 'flow-engine';
import { join } from 'node:path';
import { normalizeError } from 'shared-common/utils/getErrorMessage';
import { WebSocket } from 'ws';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { DefaultProjectResolver } from '../../config/DefaultProjectResolver';
import { FlowConfigLoader } from '../../config/FlowConfig';
import { PluginResolver } from '../../config/PluginResolver';
import { WorkerSourceRegistry } from '../../daemon/WorkerSourceRegistry';
import type { WorkerSourceEntry } from '../../daemon/WorkerSourceRegistry';
import type {
	AssignmentScopedMessage,
	DaemonToWorker,
	UpdateWorkerRequest,
	WorkerSummary,
	WorkerToDaemon,
} from '../../ipc/Protocol';
import { DaemonWatchNotifier } from '../../worker/DaemonWatch';
import type { McpServerConfig } from '../../worker/McpServer';
import { NudgeServer } from '../../worker/NudgeServer';
import type { ReconnectNotifier } from '../../worker/ReconnectNotifier';
import { declareSelf } from '../../worker/SelfDeclaration';
import { WorkerAdapter } from '../../worker/WorkerAdapter';
import { WorkerDisplay } from '../../worker/WorkerDisplay';
import {
	buildRegistration,
	buildStepRunnerConfig,
	probeShellCapabilities,
	reconnectDelayMs,
	resolveDaemonWsUrl,
	resolveExtraProjects,
	resolveSourceId,
	resolveWorkerToken,
	scheduleReconnectTimer,
	withFreshToken,
} from '../../worker/WorkerLaunch';
import { describeNoLiveWorkers } from '../../worker/WorkerListing';
import { VERSION } from '../version.js';

// violations-suppress-end: ts/no-deep-relative

interface WorkerOptions {
	source?: string;
	token?: string;
	project?: string[];
	labels?: string;
	verbose?: boolean;
	interactive?: boolean;
}

function parseLabels(raw: string | undefined): string[] {
	if (raw === undefined || raw.trim() === '') return [];
	return raw.split(',').map(label => label.trim());
}

/**
 * Shells `flow worker update --shells` accepts.
 *
 * Mirrors `validShells` in `packages/flow-engine/src/validation/SchemaValidator.ts` (what a
 * step's own `shell:` field is checked against), so a worker is never told it supports a
 * shell no step could ever declare. `sh` is deliberately absent there and here.
 */
const VALID_SHELLS = ['bash', 'cmd', 'pwsh'] as const;

/**
 * Parses and validates `--shells`, failing fast with the full accepted list rather than
 * sending an unknown value to the daemon and reporting its (identical) rejection back.
 */
function parseShells(raw: string): ('bash' | 'cmd' | 'pwsh')[] {
	const shells = raw
		.split(',')
		.map(shell => shell.trim())
		.filter(shell => shell !== '');
	const invalid = shells.filter(shell => !(VALID_SHELLS as readonly string[]).includes(shell));
	if (invalid.length > 0) {
		throw new Error(
			`Unknown shell(s) ${invalid.map(s => `'${s}'`).join(', ')} -- expected one of: ${VALID_SHELLS.join(', ')}.`
		);
	}
	return shells as ('bash' | 'cmd' | 'pwsh')[];
}

/**
 * Declared sources, or none if the registry cannot be read.
 *
 * A damaged registry must not turn `flow worker list` into a failure: the question asked was about
 * live workers, and the answer to that is already known. The reason is reported rather than hidden.
 */
function readDeclaredSources(daemonDir: string): WorkerSourceEntry[] {
	try {
		return new WorkerSourceRegistry(daemonDir).list();
	} catch (err) {
		report('[warn]', `could not read the declared worker sources: ${normalizeError(err).message}`);
		return [];
	}
}

function ts(): string {
	return new Date().toISOString().slice(11, 19);
}

function formatDelay(ms: number): string {
	if (ms < 1_000) return `${String(ms)}ms`;
	return `${String(Math.round(ms / 1_000))}s`;
}

/**
 * Prints one prefixed line for the operator.
 *
 * The message is extracted by the caller so the printing happens in one place: what
 * reaches the terminal is an authored, actionable sentence, and for an unexpected failure
 * the detail is itself what the user needs in order to act.
 */
function report(prefix: '[fail]' | '[wait]' | '[warn]', message: string): void {
	console.error(`[${ts()}] ${prefix} ${message}`);
}

/**
 * `flow worker` -- runs a worker in this terminal, attached to this project.
 *
 * The difference from the worker the daemon forks is deliberate and is the whole point
 * of the feature: this process does **not** exit when the socket closes. The daemon may
 * idle down or restart freely (D#51), and this worker waits and re-registers, so the
 * terminal the user opened keeps serving steps. It is also the only kind of worker that can
 * serve an interactive step (D#32) -- whether it needs a TTY to do so is up to the configured
 * approval plugin, not to this process.
 *
 * PRIVILEGE NOTE (T-08). A forked worker receives an allow-listed environment; this one
 * inherits the whole shell it was launched from -- PATH, credentials, agent sockets,
 * everything. That is intentional, and is what makes a human's own tools usable from a
 * step, but it means **a step dispatched here runs with the reach of this terminal**.
 * Launch it where you would be willing to run the flow's commands yourself.
 */
export function registerWorkerCommand(worker: Command): void {
	registerListCommand(worker);
	registerUpdateCommand(worker);

	worker
		.command('start', { isDefault: true })
		.description('Run a worker in this terminal, serving the current project')
		.option('--source <id>', 'Worker source this worker belongs to (see "flow worker source add")')
		.option('--token <token>', 'Registration token for the source; defaults to the daemon token over loopback')
		.option(
			'--project <path>',
			'Serve an additional project beyond the launch directory (repeatable)',
			(value: string, previous: string[] = []) => [...previous, value]
		)
		.option('--labels <labels>', 'Comma-separated labels advertised to the daemon', '')
		.option('--verbose', 'Also print the raw output each step produces, not just its lifecycle')
		.option(
			'--interactive',
			"Launch type:model steps via the model CLI's own interactive terminal session in this terminal. " +
				'Separate from being able to answer a user_intervention checkpoint (which an approval plugin ' +
				'or a plain TTY already provides) -- this opts every model step on this worker into terminal takeover.'
		)
		.action(async (options: WorkerOptions) => {
			try {
				await runWorker(options);
			} catch (err) {
				report('[fail]', normalizeError(err).message);
				process.exit(1);
			}
		});
}

/**
 * `flow worker list` -- the live workers this daemon can currently dispatch to.
 *
 * Deliberately not a view of declared sources: only a connection proves availability
 * (D#4), so a declared source with nothing attached is absent rather than shown as idle
 * capacity. Use `flow worker source list` to see what has been declared.
 */
function registerListCommand(worker: Command): void {
	worker
		.command('list')
		.description('List the workers currently connected to the daemon')
		.option('--json', 'Output as JSON')
		.action(async (options: { json?: boolean }) => {
			const daemonDir = ConfigDir.get('flow');
			try {
				// The command is declared optional and left unimplemented on purpose: a local
				// handler here would be used as an in-process fallback and would answer with
				// its own empty list, so `flow worker list` would report "no workers" while a
				// daemon with live workers was running.
				const client = createDaemonClient<{ workers?: () => Promise<WorkerSummary[]> }>({
					configDir: daemonDir,
					commands: {},
				});
				const workers = (await client.send('workers', undefined)) as WorkerSummary[];

				if (options.json) {
					console.log(JSON.stringify(workers, null, 2));
					return;
				}
				if (workers.length === 0) {
					console.log(describeNoLiveWorkers(readDeclaredSources(daemonDir), true));
					return;
				}
				for (const w of workers) {
					const labels = w.labels.length > 0 ? w.labels.join(',') : '-';
					const shells = w.shellCapabilities && w.shellCapabilities.length > 0 ? w.shellCapabilities.join(',') : '-';
					const origin = w.ephemeral ? 'daemon-forked' : (w.sourceId ?? 'external');
					console.log(
						`${w.workerId}\t${w.state}\tpid=${String(w.pid)}\t${origin}\tlabels=${labels}\tshells=${shells}\tinteractive=${String(w.hasUserInterface)}`
					);
				}
			} catch (err) {
				if (err instanceof DaemonNotRunningError) {
					// Not an error state: no daemon simply means no live workers. The registry is
					// readable without one, so say what is declared rather than leaving the reader
					// to guess whether anything is configured at all.
					console.log(describeNoLiveWorkers(readDeclaredSources(daemonDir), false));
					return;
				}
				const message = normalizeError(err).message;
				if (/unknown command/i.test(message)) {
					// The daemon is a long-lived process, so it can predate the CLI asking it
					// something new. Saying "unknown command" alone sends the user looking for a
					// typo in their own command line.
					report(
						'[fail]',
						'The running daemon does not support "flow worker list" -- it started before this command existed. Restart it with "flow stop" then "flow start", or run "flow cli update" first if its version is older than this CLI.'
					);
					process.exit(1);
				}
				report('[fail]', message);
				process.exit(1);
			}
		});
}

/**
 * `flow worker update` -- changes a live worker's labels and/or shell capabilities on the
 * daemon's own registry, without restarting the worker process (Proposal 3).
 *
 * Daemon-registry only: dispatch (`StepRouter`) reads straight from `RegisteredWorker`, so
 * the next step placed sees the new values immediately. The connected worker process is
 * deliberately not notified -- its own startup banner staying stale is cosmetic, which is
 * not what this command exists to fix.
 *
 * Targets a `workerId` (as printed by `flow worker list`), not a `sourceId`: a source may
 * supply several live workers at once (`WorkerRegistry.countForSource`), so updating "by
 * source" would be ambiguous about which connection changes.
 */
function registerUpdateCommand(worker: Command): void {
	worker
		.command('update <workerId>')
		.description("Update a live worker's labels and/or shell capabilities without restarting it")
		.option('--labels <labels>', 'Comma-separated labels to set (replaces the current list)')
		.option('--shells <shells>', 'Comma-separated shells to set: bash, cmd, pwsh (replaces the current list)')
		.action(async (workerId: string, options: { labels?: string; shells?: string }) => {
			if (options.labels === undefined && options.shells === undefined) {
				report(
					'[fail]',
					'flow worker update requires at least one of --labels or --shells; neither was given, so there would be nothing to update.'
				);
				process.exit(1);
			}

			let shellCapabilities: ('bash' | 'cmd' | 'pwsh')[] | undefined;
			try {
				if (options.shells !== undefined) shellCapabilities = parseShells(options.shells);
			} catch (err) {
				report('[fail]', normalizeError(err).message);
				process.exit(1);
			}

			const daemonDir = ConfigDir.get('flow');
			try {
				// Declared optional and left unimplemented locally, same as "workers" above:
				// an in-process fallback here would answer from nothing and look like success.
				const client = createDaemonClient<{
					updateWorker?: (payload?: unknown) => Promise<WorkerSummary>;
				}>({ configDir: daemonDir, commands: {} });
				const request: UpdateWorkerRequest = {
					workerId,
					...(options.labels !== undefined ? { labels: parseLabels(options.labels) } : {}),
					...(shellCapabilities !== undefined ? { shellCapabilities } : {}),
				};
				const updated = (await client.send('updateWorker', request)) as WorkerSummary;

				console.log(`[ok] Updated worker '${updated.workerId}'`);
				console.log(`     labels : ${updated.labels.length > 0 ? updated.labels.join(', ') : '(none)'}`);
				console.log(
					`     shells : ${updated.shellCapabilities && updated.shellCapabilities.length > 0 ? updated.shellCapabilities.join(', ') : '(none)'}`
				);
			} catch (err) {
				if (err instanceof DaemonNotRunningError) {
					report(
						'[fail]',
						'No daemon is running, so there is no live worker to update. Start one first ("flow worker" or "flow run").'
					);
					process.exit(1);
				}
				const message = normalizeError(err).message;
				if (/unknown command/i.test(message)) {
					report(
						'[fail]',
						'The running daemon does not support "flow worker update" -- it started before this command existed. Restart it with "flow stop" then "flow start", or run "flow cli update" first if its version is older than this CLI.'
					);
					process.exit(1);
				}
				report('[fail]', message);
				process.exit(1);
			}
		});
}

async function runWorker(options: WorkerOptions): Promise<void> {
	const daemonDir = ConfigDir.get('flow');
	// Same resolver the daemon uses, so a configured wsPort is honoured here too and the two
	// cannot end up reading different files (D#58). The legacy-file warning is deliberately
	// dropped here rather than printed by every command that reads config: the daemon reports
	// it once, and repeating it on each worker launch would be noise.
	const { config } = FlowConfigLoader.loadForDaemon(daemonDir);
	// This worker runs StepRunner/OpenCodeModelProvider fully in-process (WorkerAdapter.execute()),
	// reading this process's own process.env -- it is never forked by the daemon, so it never
	// inherits the daemon's env via ForkWorkerSource.ts. It must set its own defaults the same way,
	// at the same point in startup, before any step can run.
	FlowConfigLoader.applyOpenCodeEnvDefaults(config);
	const { projectRoot } = new DefaultProjectResolver().resolve(process.cwd());

	// Built here, in the process with the human in front of it (D#34): the CLI approval
	// plugin reads its own stdin, so a daemon-side instance could never reach anybody. A
	// failure to load a *configured* plugin stops the worker rather than letting it register
	// as interactive and fail the first question it is asked.
	//
	// TTY fallback: when no approval plugin is configured and the worker is running in an
	// interactive terminal, cli-approval is loaded automatically. The operator does not have
	// to edit config.yml just to answer checkpoints from their own terminal.
	let approvalProvider = await PluginResolver.create().resolveApproval();
	if (approvalProvider === undefined && process.stdout.isTTY) {
		approvalProvider = await PluginResolver.create().resolveApprovalByType('plugins.cli-approval.default');
	}

	// A worker the daemon launched carries its configuration in its environment, so the source and
	// the projects are resolved the same way the credential already was.
	const sourceId = resolveSourceId(options.source);
	const token = resolveWorkerToken({ token: options.token, sourceId }, daemonDir);
	const registration = buildRegistration({
		projectRoot,
		extraProjects: resolveExtraProjects(options.project),
		isTty: process.stdout.isTTY === true,
		canPrompt: approvalProvider !== undefined,
		...(approvalProvider?.requiresTerminal !== undefined
			? { promptNeedsTerminal: approvalProvider.requiresTerminal }
			: {}),
		pid: process.pid,
		...(sourceId !== undefined ? { sourceId } : {}),
		labels: parseLabels(options.labels),
		token,
		shellCapabilities: probeShellCapabilities(process.env),
	});

	// The nudge server lets the daemon notify this worker the moment its WS listener is
	// bound -- no backoff wait. Works for local and remote workers alike, because the daemon
	// sends an HTTP POST to the URL rather than relying on a shared filesystem.
	const nudgeServer = new NudgeServer();
	let nudgeUrl: string | undefined;
	try {
		nudgeUrl = await nudgeServer.start();
	} catch (err) {
		// A failed nudge server does not prevent the worker from running: the backoff path
		// still works. Report and continue rather than exiting: the symptom (slower reconnect)
		// is manageable, and a hard exit would surprise the user.
		report(
			'[warn]',
			`nudge server could not start, reconnect will rely on backoff only: ${normalizeError(err).message}`
		);
	}

	console.log(`[ok] flow worker for ${projectRoot}`);
	// So "which build served this step" is answerable from the worker's own terminal, not just
	// by cross-referencing a daemon-side version field after the fact.
	console.log(`     version    : ${VERSION}`);
	if (registration.labels && registration.labels.length > 0) {
		console.log(`     labels     : ${registration.labels.join(', ')}`);
	}
	console.log(`     projects   : ${(registration.attachedProjects ?? []).join(', ')}`);
	console.log(
		`     shells     : ${registration.shellCapabilities && registration.shellCapabilities.length > 0 ? registration.shellCapabilities.join(', ') : '(none detected)'}`
	);
	console.log(
		`     can-answer-checkpoints: ${String(registration.hasUserInterface)}${explainInteractivity(registration.hasUserInterface === true, approvalProvider !== undefined)}`
	);
	// Separate from the line above on purpose (see buildStepRunnerConfig): being able to answer
	// a user_intervention checkpoint never implies this.
	console.log(
		`     model-step-interactive: ${String(options.interactive === true)}${
			options.interactive === true
				? " (every type:model step on this worker launches via the model CLI's own interactive terminal session)"
				: ' (pass --interactive to opt in)'
		}`
	);
	console.log('     Waiting for steps. This worker stays alive across daemon restarts; Ctrl-C to stop.');
	if (options.verbose !== true) {
		console.log('     Run with --verbose to also see the raw output each step produces.');
	}

	// Only a worker that belongs to no declared source records itself: one launched from a source
	// already has an entry, and a second describing the same worker would double the declared
	// capacity of that source.
	const declaration =
		sourceId === undefined
			? declareSelf(daemonDir, {
					projects: registration.attachedProjects ?? [projectRoot],
					labels: registration.labels ?? [],
					pid: process.pid,
					nudgeUrl,
				})
			: undefined;
	if (declaration !== undefined) {
		console.log(`     registry   : declared as "${declaration.sourceId}" while this process lives`);
	}

	// Single cleanup: removes the registry entry and stops the nudge server together.
	releaseOnExit(() => {
		declaration?.release();
		nudgeServer.stop();
	});

	const display = new WorkerDisplay(options.verbose === true ? 'verbose' : 'summary');
	const notifiers: ReconnectNotifier[] = [new DaemonWatchNotifier(daemonDir), nudgeServer];
	connect(
		daemonDir,
		config.worker.wsPort,
		undefined,
		registration,
		0,
		display,
		approvalProvider,
		notifiers,
		() => resolveWorkerToken({ token: options.token, sourceId }, daemonDir),
		options.interactive === true
	);

	// Accept typed input when the terminal is interactive: lines are echoed as notes so the
	// operator can annotate the session log without affecting any file.
	if (process.stdin.isTTY) {
		process.stdin.setEncoding('utf8');
		process.stdin.resume();
		process.stdin.on('data', (chunk: string) => {
			for (const line of chunk.split(/\r?\n/)) {
				if (line.trim()) {
					console.log(`[${ts()}] [note] ${line.trim()}`);
				}
			}
		});
	}
}

/**
 * Runs a cleanup function when the process ends, however it ends.
 *
 * Ctrl-C is the normal way to stop a worker, and it does not run `process.on('exit')` handlers on
 * its own, so the signals are handled explicitly. A hard kill still leaks the registry entry -- that
 * is what the pid in it is for: the next reader prunes it.
 */
function releaseOnExit(cleanup: () => void): void {
	process.on('exit', cleanup);
	for (const signal of ['SIGINT', 'SIGTERM'] as const) {
		process.on(signal, () => {
			cleanup();
			process.exit(0);
		});
	}
}

/**
 * Says *why* a worker is not interactive, since the reason decides what to do about it.
 *
 * "interactive: false" on its own leaves the user guessing between a missing terminal and a
 * missing plugin, and only one of those is fixed by editing config.
 */
function explainInteractivity(interactive: boolean, hasApproval: boolean): string {
	if (interactive) return '';
	if (!hasApproval) {
		return ' (no approval plugin configured, so no user_intervention step can run here)';
	}
	// Naming the plugin matters: the fix is either "run this in a terminal" or "configure an
	// approval plugin that does not need one", and only the second is an edit to config.
	return (
		' (the configured approval plugin needs a terminal and this is not one, so no' +
		' user_intervention step can run here -- plugins.file-approval answers from a file instead)'
	);
}

/**
 * Opens a connection and re-opens it for as long as the process lives.
 *
 * `attempt` only grows while connections keep failing; a successful registration resets
 * it, so a long-lived worker does not inherit a long backoff from an earlier outage.
 *
 * `wsUrlOverride` is provided when a nudge delivered the address; otherwise the worker
 * reads `worker.port` from the daemon directory itself.
 */
function connect(
	daemonDir: string,
	configuredWsPort: number | null,
	wsUrlOverride: string | undefined,
	registration: Omit<import('../../ipc/Protocol').WorkerReady, 'type'>,
	attempt: number,
	display: WorkerDisplay,
	approvalProvider: ApprovalProvider | undefined,
	notifiers: ReconnectNotifier[],
	/** Re-read on every attempt: the daemon rotates its own token each time it starts. */
	resolveToken: () => string,
	/** `--interactive`: see {@link buildStepRunnerConfig}. Independent of `approvalProvider`. */
	interactive: boolean
): void {
	let wsUrl: string;
	if (wsUrlOverride !== undefined) {
		wsUrl = wsUrlOverride;
	} else {
		try {
			wsUrl = resolveDaemonWsUrl(daemonDir, configuredWsPort);
		} catch (err) {
			// The daemon may simply not be up yet; report and keep waiting rather than exiting.
			report('[wait]', normalizeError(err).message);
			scheduleReconnect(
				daemonDir,
				configuredWsPort,
				registration,
				attempt + 1,
				display,
				approvalProvider,
				notifiers,
				resolveToken,
				interactive
			);
			return;
		}
	}

	const ws = new WebSocket(wsUrl);
	const adapter = new WorkerAdapter(
		(mcpServers: McpServerConfig[]) =>
			new StepRunner(buildStepRunnerConfig(approvalProvider, mcpServers, interactive))
	);

	const send = (message: WorkerToDaemon): void => {
		if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
	};

	ws.on('open', () => {
		send({ type: 'ready', ...withFreshToken(registration, resolveToken) });
	});

	ws.on('message', (data: Buffer) => {
		let message: DaemonToWorker;
		try {
			message = JSON.parse(data.toString()) as DaemonToWorker;
		} catch (err) {
			report('[warn]', `ignored an unparseable daemon message: ${String(err)}`);
			return;
		}
		void handleMessage(message, adapter, send, registration, display);
	});

	ws.on('error', (err: Error) => {
		// Not fatal: the daemon may be restarting. The close handler schedules the retry.
		report('[warn]', `connection error: ${normalizeError(err).message}`);
	});

	ws.on('close', () => {
		const delay = reconnectDelayMs(attempt + 1);
		console.log(`[${ts()}] [wait] daemon connection closed; next attempt in ${formatDelay(delay)}`);
		scheduleReconnect(
			daemonDir,
			configuredWsPort,
			registration,
			attempt + 1,
			display,
			approvalProvider,
			notifiers,
			resolveToken,
			interactive
		);
	});
}

function scheduleReconnect(
	daemonDir: string,
	configuredWsPort: number | null,
	registration: Omit<import('../../ipc/Protocol').WorkerReady, 'type'>,
	attempt: number,
	display: WorkerDisplay,
	approvalProvider: ApprovalProvider | undefined,
	notifiers: ReconnectNotifier[],
	/** Re-read on every attempt: the daemon rotates its own token each time it starts. */
	resolveToken: () => string,
	/** `--interactive`: see {@link buildStepRunnerConfig}. Independent of `approvalProvider`. */
	interactive: boolean
): void {
	// Three ways to learn the daemon is back, whichever arrives first:
	// 1. An HTTP nudge from the daemon (NudgeServer): delivers the wsUrl directly, works remotely.
	// 2. A filesystem event (DaemonWatchNotifier): local-only, worker reads worker.port itself.
	// 3. The backoff timer: always fires regardless of the above two, so a missed notification
	//    costs only latency.
	let fired = false;
	let timer: NodeJS.Timeout | undefined;

	const reconnect = (wsUrlFromNudge?: string): void => {
		if (fired) return;
		fired = true;
		if (timer !== undefined) clearTimeout(timer);
		// Disarm all notifiers so a late-arriving nudge does not trigger a second connect.
		for (const n of notifiers) n.onNotify(undefined);
		connect(
			daemonDir,
			configuredWsPort,
			wsUrlFromNudge,
			registration,
			attempt,
			display,
			approvalProvider,
			notifiers,
			resolveToken,
			interactive
		);
	};

	timer = scheduleReconnectTimer(reconnectDelayMs(attempt), () => reconnect(undefined));
	for (const n of notifiers) {
		n.onNotify(wsUrl => reconnect(wsUrl));
	}
}

async function handleMessage(
	message: DaemonToWorker,
	adapter: WorkerAdapter,
	send: (message: WorkerToDaemon) => void,
	registration: Omit<import('../../ipc/Protocol').WorkerReady, 'type'>,
	display: WorkerDisplay
): Promise<void> {
	switch (message.type) {
		case 'assign': {
			const { assignmentId, stepId, stepConfig, executionContext } = message;
			// Bound to this assignment so step execution cannot report against another.
			// Also where this terminal sees the step's own output: the worker produces those
			// lines, so showing them here costs nothing (D#31).
			const sendForAssignment = (scoped: AssignmentScopedMessage): void => {
				if (scoped.type === 'log') display.stepLog(stepId, scoped.entry);
				send({ ...scoped, assignmentId } as WorkerToDaemon);
			};
			display.stepStarted(stepId, {
				executionId: executionContext.executionId,
				stepName: (stepConfig as unknown as { name?: string }).name,
				flowId: executionContext.flowId,
				flowVersion: executionContext.flowVersion,
			});
			const startedAt = Date.now();
			// Announced before the first side effect: after this the daemon treats a
			// disconnect as a failure rather than replaying the step (D#65). Closing this
			// terminal before a step starts therefore costs the flow nothing.
			sendForAssignment({ type: 'step_started', executionId: executionContext.executionId, stepId });
			try {
				const { output, meta } = await adapter.execute(stepConfig, executionContext, sendForAssignment);
				sendForAssignment({
					type: 'step_completed',
					executionId: executionContext.executionId,
					stepId,
					output,
					meta,
				});
				display.stepCompleted(stepId, Date.now() - startedAt);
			} catch (err) {
				const error = normalizeError(err).message;
				const output = (err as { stepOutputs?: Record<string, unknown> }).stepOutputs;
				sendForAssignment({
					type: 'step_failed',
					executionId: executionContext.executionId,
					stepId,
					error,
					output,
				});
				display.stepFailed(stepId, error, Date.now() - startedAt);
			}
			// No credential refresh here: this socket is already authenticated, and re-reading a
			// token mid-connection would only matter if the daemon re-checked it, which it does not.
			send({ type: 'ready', ...registration });
			break;
		}
		case 'idle':
			break;
		case 'done':
			// Only sent to workers the daemon created. Reaching here would mean the daemon
			// treated this worker as disposable, so say so rather than quietly exiting.
			console.error(
				'[warn] received the shutdown notice meant for daemon-created workers; staying alive. Please report this.'
			);
			break;
		default: {
			const exhaustive: never = message;
			console.error(`[warn] unknown daemon message: ${JSON.stringify(exhaustive)}`);
		}
	}
}
