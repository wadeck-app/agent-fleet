import type { Command } from 'commander';
import { createRemoteDaemonClient } from 'flow-core';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { flowConfigDir } from '../../config/FlowConfigDir.js';
// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { type ClientCommand, DAEMON_STOPPING_CODE, type DaemonResponse } from '../../ipc/Protocol';
import { formatCliError } from './CliErrorOutput';
import { describeDaemonContactFailure } from './DaemonContactFailure';
import { assertQualifiedExecutionOwner, exitOnReferenceError, resolveExecutionReference } from './ExecutionReference';
import { singleProjectValue } from './SingleProjectOption';

// violations-suppress-end: ts/no-deep-relative

type FlowCommands = {
	pause?: (payload: unknown) => Promise<DaemonResponse>;
	unpause?: (payload: unknown) => Promise<DaemonResponse>;
};

interface PauseOptions {
	project?: string;
	reason?: string;
	json?: boolean;
}

type Verb = 'pause' | 'unpause';

/** A paused run lives only in the daemon that runs it: with no daemon there is nothing to pause or to release. */
function notRunningText(verb: Verb): string {
	return formatCliError(
		`The daemon is not running -- there is nothing to ${verb}. A run exists only in the daemon that runs it (a daemon restart ends it: see flow history).`
	);
}

/** Sends the command and returns the daemon's answer; exits 1 with an actionable message when there is none or it is a refusal. */
async function ask(
	verb: Verb,
	configDir: string,
	cmd: ClientCommand,
	json: boolean | undefined
): Promise<DaemonResponse> {
	let response: DaemonResponse;
	try {
		response = (await createRemoteDaemonClient<FlowCommands>(configDir).send(verb, cmd)) as DaemonResponse;
	} catch (err) {
		const failure = describeDaemonContactFailure(err);
		console.error(failure.notRunning ? notRunningText(verb) : formatCliError(failure.message));
		process.exit(1);
	}
	if (response.type === 'error' && response.code === DAEMON_STOPPING_CODE) {
		console.error(notRunningText(verb));
		process.exit(1);
	}
	if (response.type === 'error') {
		if (json) {
			process.stderr.write(JSON.stringify({ code: response.code, message: response.message }) + '\n');
		} else {
			console.error(formatCliError(response.message));
		}
		process.exit(1);
	}
	return response;
}

function unexpected(verb: Verb, response: DaemonResponse): never {
	console.error(
		formatCliError(
			`The daemon answered "${response.type}" to ${verb}: it is likely older than this CLI. Update it: flow cli update`
		)
	);
	process.exit(1);
}

export function registerPauseCommand(program: Command, getConfigDir: () => string = flowConfigDir): void {
	program
		.command('pause <executionId>')
		.description(
			'Pause ONE running execution: no NEW step is dispatched until you run flow unpause\n' +
				'  <executionId>  An id, or <project>/<id> (e.g. shop/abc12345) to also require the execution to belong to that project\n' +
				'  Not a kill: the steps already running finish and report normally, queued steps wait, the workers and the\n' +
				'  workspace stay held, the record keeps its status (flow show / flow history print "paused" and the reason).\n' +
				'  Publishes flow.execution.paused. A daemon restart does not keep a paused run: it ends as failed (interrupted).\n' +
				'  Refused: a run that ended, does not exist, is already paused, waits for a workspace or on a user_intervention.\n' +
				'  Not related to flow resume (which reopens a failed run). Exit 0: paused; 1: error.\n' +
				'  -p, --project <ref>  Refuse an execution of another project (name, alias or id; or FLOW_PROJECT)'
		)
		.option('--reason <text>', 'Why (at most 500 characters): shown by flow show, published with the event')
		.option(
			'-p, --project <ref>',
			'Only pause an execution of this project: name, alias or id (default: FLOW_PROJECT)',
			singleProjectValue
		)
		.option('--json', 'Machine-readable output')
		.action(async (typedId: string, options: PauseOptions) => {
			const { executionId, projectId } = exitOnReferenceError(() => {
				const reference = resolveExecutionReference(typedId, options.project, process.env);
				assertQualifiedExecutionOwner(typedId, reference, getConfigDir(), process.env);
				return reference;
			});
			const cmd: Extract<ClientCommand, { type: 'pause' }> = {
				type: 'pause',
				executionId,
				...(options.reason === undefined ? {} : { reason: options.reason }),
				...(projectId === undefined ? {} : { projectId }),
			};
			const response = await ask('pause', getConfigDir(), cmd, options.json);
			if (response.type !== 'execution_paused') {
				unexpected('pause', response);
			}
			if (options.json) {
				process.stdout.write(
					JSON.stringify({ executionId, paused: true, since: response.since, reason: response.reason }) + '\n'
				);
			} else {
				console.log(
					`Paused execution ${executionId}: running steps finish, no new step starts. Resume it with: flow unpause ${executionId}`
				);
			}
		});
}

export function registerUnpauseCommand(program: Command, getConfigDir: () => string = flowConfigDir): void {
	program
		.command('unpause <executionId>')
		.description(
			'Release an execution paused with flow pause: its queued steps are dispatched again\n' +
				'  <executionId>  An id, or <project>/<id> (e.g. shop/abc12345) to also require the execution to belong to that project\n' +
				'  No step is lost or started twice. Publishes flow.execution.resumed. Refused when the execution is not paused.\n' +
				'  Named unpause because flow resume already exists: it reopens a FAILED run. Exit 0: released; 1: error.\n' +
				'  -p, --project <ref>  Refuse an execution of another project (name, alias or id; or FLOW_PROJECT)'
		)
		.option(
			'-p, --project <ref>',
			'Only release an execution of this project: name, alias or id (default: FLOW_PROJECT)',
			singleProjectValue
		)
		.option('--json', 'Machine-readable output')
		.action(async (typedId: string, options: PauseOptions) => {
			const { executionId, projectId } = exitOnReferenceError(() => {
				const reference = resolveExecutionReference(typedId, options.project, process.env);
				assertQualifiedExecutionOwner(typedId, reference, getConfigDir(), process.env);
				return reference;
			});
			const cmd: Extract<ClientCommand, { type: 'unpause' }> = {
				type: 'unpause',
				executionId,
				...(projectId === undefined ? {} : { projectId }),
			};
			const response = await ask('unpause', getConfigDir(), cmd, options.json);
			if (response.type !== 'execution_unpaused') {
				unexpected('unpause', response);
			}
			if (options.json) {
				process.stdout.write(
					JSON.stringify({ executionId, paused: false, pausedMs: response.pausedMs }) + '\n'
				);
			} else {
				console.log(`Released execution ${executionId}: its queued steps are dispatched again.`);
			}
		});
}
