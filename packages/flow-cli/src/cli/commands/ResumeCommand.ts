import type { Command } from 'commander';
import { createRemoteDaemonClient } from 'flow-core';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { flowConfigDir } from '../../config/FlowConfigDir.js';
// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { type ClientCommand, DAEMON_STOPPING_CODE, type DaemonResponse } from '../../ipc/Protocol';
import { describeDaemonContactFailure } from './DaemonContactFailure';

// violations-suppress-end: ts/no-deep-relative

// Not "start it with flow start": the execution lives in the daemon that ran it and is not restored by a new one.
const NOT_RUNNING_TEXT =
	'Error:The daemon is not running -- there is nothing to resume. Resume only works while the daemon that ran the execution is alive.';

type FlowCommands = { resume?: (payload: unknown) => Promise<DaemonResponse> };

export function registerResumeCommand(program: Command): void {
	program
		.command('resume <executionId>')
		.description(
			'Resume an execution that failed on an unanswered user_intervention step past its timeout\n' +
				'  Re-dispatches only that one step -- answer it (e.g. create the approval response\n' +
				'  file) before or after running this command. Only works while the daemon that ran\n' +
				'  the execution is still alive; it is not restored across a daemon restart.'
		)
		.option('--json', 'Machine-readable output')
		.action(async (executionId: string, options: { json?: boolean }) => {
			const daemonDir = flowConfigDir();
			const cmd: Extract<ClientCommand, { type: 'resume' }> = { type: 'resume', executionId };

			let response: DaemonResponse;
			try {
				response = (await createRemoteDaemonClient<FlowCommands>(daemonDir).send(
					'resume',
					cmd
				)) as DaemonResponse;
			} catch (err) {
				const failure = describeDaemonContactFailure(err);
				console.error(failure.notRunning ? NOT_RUNNING_TEXT : `Error:${failure.message}`);
				process.exit(1);
			}

			if (response.type === 'error' && response.code === DAEMON_STOPPING_CODE) {
				console.error(NOT_RUNNING_TEXT);
				process.exit(1);
			}

			if (response.type === 'error') {
				if (options.json) {
					process.stderr.write(JSON.stringify({ code: response.code, message: response.message }) + '\n');
				} else {
					console.error(`Error:${response.message}`);
				}
				process.exit(response.code === 'EXECUTION_NOT_FOUND' ? 2 : 1);
			}

			const { stepId } = response as { type: 'execution_resumed'; executionId: string; stepId: string };
			if (options.json) {
				process.stdout.write(JSON.stringify({ executionId, stepId }) + '\n');
			} else {
				console.log(`Resumed execution ${executionId} at step ${stepId}`);
			}
		});
}
