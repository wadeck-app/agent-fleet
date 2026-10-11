import { ConfigDir } from '@wadeck-app/shared-cli';
import { DaemonNotRunningError, createDaemonClient } from '@wadeck-app/singleton-daemon-kit';
import type { Command } from 'commander';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import type { ClientCommand, DaemonResponse } from '../../ipc/Protocol';
// violations-suppress-end: ts/no-deep-relative

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
			const daemonDir = ConfigDir.get('flow');
			const cmd: Extract<ClientCommand, { type: 'resume' }> = { type: 'resume', executionId };

			let response: DaemonResponse;
			try {
				response = (await createDaemonClient<FlowCommands>({ configDir: daemonDir, commands: {} }).send(
					'resume',
					cmd
				)) as DaemonResponse;
			} catch (err) {
				if (err instanceof DaemonNotRunningError) {
					console.error('Error:The daemon is not running -- there is nothing to resume.');
				} else {
					console.error('Failed to contact the daemon.');
				}
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
