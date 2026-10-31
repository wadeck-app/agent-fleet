import type { Command } from 'commander';
import { createRemoteDaemonClient, executionsDirOf, isExecutionId } from 'flow-core';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { flowConfigDir } from '../../config/FlowConfigDir.js';
// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { type ClientCommand, DAEMON_STOPPING_CODE, type DaemonResponse } from '../../ipc/Protocol';
import { ExecutionStore } from '../../storage/ExecutionStore';
import { formatCliError } from './CliErrorOutput';
import { classifyDaemonContactFailure, describeDaemonContactFailure } from './DaemonContactFailure';
import { resolveProjectFilter } from './ProjectFilter';
import { singleProjectValue } from './SingleProjectOption';

// violations-suppress-end: ts/no-deep-relative

type FlowCommands = { cancel?: (payload: unknown) => Promise<DaemonResponse> };

interface CancelOptions {
	project?: string;
	json?: boolean;
}

/** What the user is told, and the exit code, once the command has an answer. */
type Outcome =
	/** The execution is cancelled (now or earlier): success. */
	| { kind: 'cancelled'; alreadyCancelled: boolean }
	/** Why nothing was cancelled. */
	| { kind: 'refused'; code: string; message: string };

/**
 * What to tell when no daemon answered: the record on disk decides. A record left `running`/`queued` belongs to a daemon
 * that is gone, so nothing holds it; the next daemon start marks it failed, which is the only way to clear it.
 */
function outcomeWithoutDaemon(executionId: string, configDir: string): Outcome {
	const store = new ExecutionStore(executionsDirOf(configDir));
	if (!isExecutionId(executionId) || !store.exists(executionId)) {
		return {
			kind: 'refused',
			code: 'EXECUTION_NOT_FOUND',
			message: `No execution found with id "${executionId}", and the daemon is not running. Find the id with: flow history`,
		};
	}
	const record = store.read(executionId);
	if (record.status === 'failed' && record.endReason === 'cancelled') {
		return { kind: 'cancelled', alreadyCancelled: true };
	}
	if (record.status === 'completed' || record.status === 'failed') {
		return {
			kind: 'refused',
			code: 'EXECUTION_ALREADY_ENDED',
			message: `Execution "${executionId}" already ended as ${record.status}; there is nothing to cancel.`,
		};
	}
	return {
		kind: 'refused',
		code: 'DAEMON_NOT_RUNNING',
		message:
			`Execution "${executionId}" is recorded as ${record.status} but no daemon is running, so nothing holds it and there is nothing to cancel. ` +
			'Start the daemon (flow start): at startup it marks the executions left by a previous daemon as failed.',
	};
}

async function askDaemon(configDir: string, cmd: Extract<ClientCommand, { type: 'cancel' }>): Promise<Outcome> {
	let response: DaemonResponse;
	try {
		response = (await createRemoteDaemonClient<FlowCommands>(configDir).send('cancel', cmd)) as DaemonResponse;
	} catch (err) {
		if (classifyDaemonContactFailure(err) === 'not-running') {
			return outcomeWithoutDaemon(cmd.executionId, configDir);
		}
		return { kind: 'refused', code: 'DAEMON_UNREACHABLE', message: describeDaemonContactFailure(err).message };
	}
	if (response.type === 'error' && response.code === DAEMON_STOPPING_CODE) {
		return outcomeWithoutDaemon(cmd.executionId, configDir);
	}
	if (response.type === 'error') {
		return { kind: 'refused', code: response.code, message: response.message };
	}
	if (response.type !== 'execution_cancelled') {
		return {
			kind: 'refused',
			code: 'UNEXPECTED_RESPONSE',
			message: `The daemon answered "${response.type}" to cancel: it is likely older than this CLI. Update it: flow cli update`,
		};
	}
	return { kind: 'cancelled', alreadyCancelled: response.alreadyCancelled };
}

export function registerCancelCommand(program: Command, getConfigDir: () => string = flowConfigDir): void {
	program
		.command('cancel <executionId>')
		.description(
			'Cancel ONE execution without stopping the daemon (queued, running or waiting on an intervention)\n' +
				'  Its steps end as "cancelled by user", the workers holding its steps are dropped, its workspace is\n' +
				'  released and the execution is recorded as failed (flow history shows "cancelled by user").\n' +
				'  Other executions are untouched. Cancelling twice succeeds. Exit 0: cancelled; 1: error.\n' +
				'  -p, --project <ref>  Refuse an execution of another project (name, alias or id; or FLOW_PROJECT)'
		)
		.option(
			'-p, --project <ref>',
			'Only cancel an execution of this project: name, alias or id (default: FLOW_PROJECT)',
			singleProjectValue
		)
		.option('--json', 'Machine-readable output')
		.action(async (executionId: string, options: CancelOptions) => {
			const projectId = resolveProjectFilter(options.project, process.env);
			const cmd: Extract<ClientCommand, { type: 'cancel' }> = {
				type: 'cancel',
				executionId,
				...(projectId === undefined ? {} : { projectId }),
			};

			const outcome = await askDaemon(getConfigDir(), cmd);

			if (outcome.kind === 'refused') {
				if (options.json) {
					process.stderr.write(JSON.stringify({ code: outcome.code, message: outcome.message }) + '\n');
				} else {
					console.error(formatCliError(outcome.message));
				}
				process.exit(1);
			}
			const { alreadyCancelled } = outcome;
			if (options.json) {
				process.stdout.write(JSON.stringify({ executionId, cancelled: true, alreadyCancelled }) + '\n');
			} else if (alreadyCancelled) {
				console.log(`Execution ${executionId} was already cancelled; nothing changed.`);
			} else {
				console.log(`Cancelled execution ${executionId}. The daemon and the other executions keep running.`);
			}
		});
}
