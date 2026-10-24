import type { Command } from 'commander';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { FlowConfigLoader } from '../../config/FlowConfig';
import { flowConfigDir } from '../../config/FlowConfigDir.js';
import { PluginResolver } from '../../config/PluginResolver';
import { ProjectResolverFactory } from '../../config/ProjectResolverFactory';
import { DaemonWatchNotifier } from '../../worker/DaemonWatch';
import { NudgeServer } from '../../worker/NudgeServer';
import type { ReconnectNotifier } from '../../worker/ReconnectNotifier';
import { SelfDeclarationManager } from '../../worker/SelfDeclaration';
import { WorkerDisplay } from '../../worker/WorkerDisplay';
import {
	buildRegistration,
	probeShellCapabilities,
	resolveExtraProjects,
	resolveSourceId,
	resolveWorkerToken,
} from '../../worker/WorkerLaunch';
import { WorkerConnection } from './WorkerConnection';
import { registerWorkerListCommand } from './WorkerListCommand';
import { report, ts } from './WorkerReport';
import { WorkerSelfUpdate } from './WorkerSelfUpdate';
import { printWorkerRegistryStatus, printWorkerStartupBanner } from './WorkerStartupBanner';
import { registerWorkerUpdateCommand } from './WorkerUpdateCommand';
// violations-suppress-end: ts/no-deep-relative
import { parseWorkerLabels } from './parseWorkerLabels';

interface WorkerOptions {
	source?: string;
	token?: string;
	project?: string[];
	labels?: string;
	verbose?: boolean;
	interactive?: boolean;
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
	registerWorkerListCommand(worker);
	registerWorkerUpdateCommand(worker);

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

async function runWorker(options: WorkerOptions): Promise<void> {
	const daemonDir = flowConfigDir();
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
	const { projectRoot } = ProjectResolverFactory.create().resolve(process.cwd());

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
	// Captured once, rather than re-resolved later from (possibly rotated/cleared) env vars:
	// the self re-exec below must relaunch with the exact same identity this process has now.
	const extraProjects = resolveExtraProjects(options.project);
	const registration = buildRegistration({
		projectRoot,
		extraProjects,
		isTty: process.stdout.isTTY === true,
		canPrompt: approvalProvider !== undefined,
		...(approvalProvider?.requiresTerminal !== undefined
			? { promptNeedsTerminal: approvalProvider.requiresTerminal }
			: {}),
		pid: process.pid,
		...(sourceId !== undefined ? { sourceId } : {}),
		labels: parseWorkerLabels(options.labels),
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

	printWorkerStartupBanner({
		projectRoot,
		registration,
		hasApprovalProvider: approvalProvider !== undefined,
		interactive: options.interactive === true,
		verbose: options.verbose === true,
	});

	// Only a worker that belongs to no declared source records itself: one launched from a source
	// already has an entry, and a second describing the same worker would double the declared
	// capacity of that source.
	const declaration =
		sourceId === undefined
			? new SelfDeclarationManager(daemonDir, {
					projects: registration.attachedProjects ?? [projectRoot],
					labels: registration.labels ?? [],
					pid: process.pid,
					nudgeUrl,
				})
			: undefined;
	printWorkerRegistryStatus(declaration);

	// Constructed before cleanup so cleanup can stop its timer; nothing is armed until start().
	// The identity is captured once, so the self re-exec relaunches with exactly what this
	// process has now.
	const selfUpdate = new WorkerSelfUpdate({
		daemonDir,
		sourceId,
		token,
		extraProjects,
		labels: registration.labels ?? [],
		verbose: options.verbose === true,
		interactive: options.interactive === true,
	});

	// Named (not inline) so the self re-exec path can also run it directly, outside the
	// process.on('exit'/SIGINT/SIGTERM) handlers releaseOnExit installs.
	const cleanup = (): void => {
		declaration?.release();
		nudgeServer.stop();
		selfUpdate.stop();
	};
	releaseOnExit(cleanup);
	selfUpdate.start(cleanup);

	const display = new WorkerDisplay(options.verbose === true ? 'verbose' : 'summary');
	const notifiers: ReconnectNotifier[] = [new DaemonWatchNotifier(daemonDir), nudgeServer];
	new WorkerConnection({
		daemonDir,
		configuredWsPort: config.worker.wsPort,
		registration,
		display,
		approvalProvider,
		notifiers,
		resolveToken: () => resolveWorkerToken({ token: options.token, sourceId }, daemonDir),
		interactive: options.interactive === true,
		busyTracker: selfUpdate.busyTracker,
	}).connect(undefined, 0);

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
