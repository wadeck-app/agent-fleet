import { ConfigDir } from '@wadeck-app/shared-cli';
import { DaemonNotRunningError, createDaemonClient } from '@wadeck-app/singleton-daemon-kit';
import type { Command } from 'commander';
import type { ApprovalProvider } from 'extension-points';
import { StepRunner } from 'flow-engine';
import type { StepRunnerConfig } from 'flow-engine';
import { join } from 'node:path';
import { normalizeError } from 'shared-common/utils/getErrorMessage';
import { WebSocket } from 'ws';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { DefaultProjectResolver } from '../../config/DefaultProjectResolver';
import { FlowConfigLoader } from '../../config/FlowConfig';
import { PluginResolver } from '../../config/PluginResolver';
import type { AssignmentScopedMessage, DaemonToWorker, WorkerSummary, WorkerToDaemon } from '../../ipc/Protocol';
import type { McpServerConfig } from '../../worker/McpServer';
import { WorkerAdapter } from '../../worker/WorkerAdapter';
import { WorkerDisplay } from '../../worker/WorkerDisplay';
import {
	buildRegistration,
	reconnectDelayMs,
	resolveDaemonWsUrl,
	resolveExtraProjects,
	resolveSourceId,
	resolveWorkerToken,
	scheduleReconnectTimer,
} from '../../worker/WorkerLaunch';

// violations-suppress-end: ts/no-deep-relative

interface WorkerOptions {
	source?: string;
	token?: string;
	project?: string[];
	labels?: string;
	verbose?: boolean;
}

function parseLabels(raw: string | undefined): string[] {
	if (raw === undefined || raw.trim() === '') return [];
	return raw.split(',').map(label => label.trim());
}

/**
 * Prints one prefixed line for the operator.
 *
 * The message is extracted by the caller so the printing happens in one place: what
 * reaches the terminal is an authored, actionable sentence, and for an unexpected failure
 * the detail is itself what the user needs in order to act.
 */
function report(prefix: '[fail]' | '[wait]' | '[warn]', message: string): void {
	console.error(`${prefix} ${message}`);
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
					console.log('No workers connected. Start one with "flow worker" in a project directory.');
					return;
				}
				for (const w of workers) {
					const labels = w.labels.length > 0 ? w.labels.join(',') : '-';
					const origin = w.ephemeral ? 'daemon-forked' : (w.sourceId ?? 'external');
					console.log(
						`${w.workerId}\t${w.state}\tpid=${String(w.pid)}\t${origin}\tlabels=${labels}\tinteractive=${String(w.hasUserInterface)}`
					);
				}
			} catch (err) {
				if (err instanceof DaemonNotRunningError) {
					// Not an error state: no daemon simply means no live workers.
					console.log('No daemon running, so no workers are connected. Start one with "flow start".');
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

async function runWorker(options: WorkerOptions): Promise<void> {
	const daemonDir = ConfigDir.get('flow');
	// Same resolver the daemon uses, so a configured wsPort is honoured here too and the two
	// cannot end up reading different files (D#58). The legacy-file warning is deliberately
	// dropped here rather than printed by every command that reads config: the daemon reports
	// it once, and repeating it on each worker launch would be noise.
	const { config } = FlowConfigLoader.loadForDaemon(daemonDir);
	const { projectRoot } = new DefaultProjectResolver().resolve(process.cwd());

	// Built here, in the process with the human in front of it (D#34): the CLI approval
	// plugin reads its own stdin, so a daemon-side instance could never reach anybody. A
	// failure to load a *configured* plugin stops the worker rather than letting it register
	// as interactive and fail the first question it is asked.
	const approvalProvider = await PluginResolver.create().resolveApproval();

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
	});

	console.log(`[ok] flow worker for ${projectRoot}`);
	if (registration.labels && registration.labels.length > 0) {
		console.log(`     labels     : ${registration.labels.join(', ')}`);
	}
	console.log(`     projects   : ${(registration.attachedProjects ?? []).join(', ')}`);
	console.log(
		`     interactive: ${String(registration.hasUserInterface)}${explainInteractivity(registration.hasUserInterface === true, approvalProvider !== undefined)}`
	);
	console.log('     Waiting for steps. This worker stays alive across daemon restarts; Ctrl-C to stop.');
	if (options.verbose !== true) {
		console.log('     Run with --verbose to also see the raw output each step produces.');
	}

	const display = new WorkerDisplay(options.verbose === true ? 'verbose' : 'summary');
	connect(daemonDir, config.worker.wsPort, registration, 0, display, approvalProvider);
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
 */
function connect(
	daemonDir: string,
	configuredWsPort: number | null,
	registration: Omit<import('../../ipc/Protocol').WorkerReady, 'type'>,
	attempt: number,
	display: WorkerDisplay,
	approvalProvider: ApprovalProvider | undefined
): void {
	let wsUrl: string;
	try {
		wsUrl = resolveDaemonWsUrl(daemonDir, configuredWsPort);
	} catch (err) {
		// The daemon may simply not be up yet; report and keep waiting rather than exiting.
		report('[wait]', normalizeError(err).message);
		scheduleReconnect(daemonDir, configuredWsPort, registration, attempt + 1, display, approvalProvider);
		return;
	}

	const ws = new WebSocket(wsUrl);
	const adapter = new WorkerAdapter((mcpServers: McpServerConfig[]) => {
		const base: StepRunnerConfig = {
			interactive: registration.hasUserInterface === true,
			// The provider lives in this process, so a user_intervention step reaches the human
			// at this terminal (D#34).
			...(approvalProvider !== undefined ? { approvalProvider } : {}),
		};
		const runnerConfig = (mcpServers.length > 0 ? { ...base, mcpServers } : base) as StepRunnerConfig;
		return new StepRunner(runnerConfig);
	});

	const send = (message: WorkerToDaemon): void => {
		if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
	};

	ws.on('open', () => {
		send({ type: 'ready', ...registration });
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
		console.log('[wait] daemon connection closed; waiting to re-register');
		scheduleReconnect(daemonDir, configuredWsPort, registration, attempt + 1, display, approvalProvider);
	});
}

function scheduleReconnect(
	daemonDir: string,
	configuredWsPort: number | null,
	registration: Omit<import('../../ipc/Protocol').WorkerReady, 'type'>,
	attempt: number,
	display: WorkerDisplay,
	approvalProvider: ApprovalProvider | undefined
): void {
	scheduleReconnectTimer(reconnectDelayMs(attempt), () => {
		connect(daemonDir, configuredWsPort, registration, attempt, display, approvalProvider);
	});
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
			display.stepStarted(stepId);
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
				display.stepFailed(stepId, error);
			}
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
