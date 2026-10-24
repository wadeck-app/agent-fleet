import { DaemonNotRunningError } from '@wadeck-app/singleton-daemon-kit';
import type { Command } from 'commander';
import { createRemoteDaemonClient, isUnknownCommandError, outdatedDaemonMessage } from 'flow-core';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { flowConfigDir } from '../../config/FlowConfigDir.js';
import type { UpdateWorkerRequest, WorkerSummary } from '../../ipc/Protocol';
import { report } from './WorkerReport';
// violations-suppress-end: ts/no-deep-relative
import { parseWorkerLabels } from './parseWorkerLabels';

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
export function registerWorkerUpdateCommand(worker: Command): void {
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
				if (options.shells !== undefined) {
					shellCapabilities = parseShells(options.shells);
				}
			} catch (err) {
				report('[fail]', normalizeError(err).message);
				process.exit(1);
			}

			const daemonDir = flowConfigDir();
			try {
				// Declared optional: no local implementation (see createRemoteDaemonClient).
				const client = createRemoteDaemonClient<{
					updateWorker?: (payload?: unknown) => Promise<WorkerSummary>;
				}>(daemonDir);
				const request: UpdateWorkerRequest = {
					workerId,
					...(options.labels !== undefined ? { labels: parseWorkerLabels(options.labels) } : {}),
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
				if (isUnknownCommandError(message)) {
					report('[fail]', outdatedDaemonMessage('flow worker update'));
					process.exit(1);
				}
				report('[fail]', message);
				process.exit(1);
			}
		});
}
