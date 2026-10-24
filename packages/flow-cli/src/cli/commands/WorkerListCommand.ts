import { FOLLOW_POLL_INTERVAL_MS } from '@wadeck-app/shared-cli/FollowSnapshot';
import { LiveRegion } from '@wadeck-app/shared-cli/LiveRegion';
import type { Command } from 'commander';
import { FlowQueryService, WorkerListError, formatWorkerLine } from 'flow-core';
import type { WorkerListResult } from 'flow-core';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { flowConfigDir } from '../../config/FlowConfigDir.js';
// violations-suppress-end: ts/no-deep-relative
import { report, ts } from './WorkerReport';

/** `flow worker list` with neither `--json` nor `--follow`: one full read, then exit. */
async function runWorkerListOnce(service: FlowQueryService, json: boolean): Promise<void> {
	let result: WorkerListResult;
	try {
		result = await service.listWorkers();
	} catch (err) {
		if (!(err instanceof WorkerListError)) {
			throw err;
		}
		report('[fail]', normalizeError(err).message);
		process.exit(1);
	}
	warnIfSourcesUnreadable(result);
	if (json) {
		console.log(JSON.stringify(result.workers, null, 2));
		return;
	}
	if (result.emptyExplanation !== undefined) {
		console.log(result.emptyExplanation);
		return;
	}
	for (const w of result.workers) console.log(formatWorkerLine(w));
}

/** A damaged source registry does not fail the listing (the live workers are known); it is reported. */
function warnIfSourcesUnreadable(result: WorkerListResult): void {
	if (result.declaredSourcesError === undefined) {
		return;
	}
	report('[warn]', `could not read the declared worker sources: ${result.declaredSourcesError}`);
}

/**
 * `flow worker list --follow` -- a *live state view* (see shared-cli's
 * guiding-principles.md `--follow` convention), not an event log: the question is
 * "who is connected right now", and a worker disconnecting is exactly as meaningful as
 * one connecting. Each poll redraws the full current list in place via `LiveRegion`
 * (erasing exactly its own last render), so the operator always sees the actual current
 * state -- including a worker that just dropped off -- without the terminal scrolling.
 */
async function runWorkerListFollow(service: FlowQueryService, json: boolean): Promise<void> {
	const region = new LiveRegion();
	let lastFailureMessage: string | undefined;

	const renderOnce = async (): Promise<void> => {
		let result: WorkerListResult;
		try {
			result = await service.listWorkers();
		} catch (err) {
			if (!(err instanceof WorkerListError)) {
				throw err;
			}
			// A condition that stays fatal (e.g. the daemon staying too old) must not spam
			// the identical line every tick -- report it once per distinct failure only. The
			// region itself is left showing the last known-good state rather than cleared.
			const failureMessage = normalizeError(err).message;
			if (failureMessage !== lastFailureMessage) {
				report('[fail]', failureMessage);
			}
			lastFailureMessage = failureMessage;
			return;
		}
		lastFailureMessage = undefined;
		warnIfSourcesUnreadable(result);
		if (json) {
			// Split on embedded newlines so LiveRegion's line count (used to erase the
			// previous render) matches what actually prints -- it tracks array entries, not
			// terminal rows.
			region.render(JSON.stringify(result.workers, null, 2).split('\n'));
			return;
		}
		if (result.emptyExplanation !== undefined) {
			region.render(result.emptyExplanation.split('\n'));
			return;
		}
		region.render(result.workers.map(formatWorkerLine));
	};

	await renderOnce();
	process.stderr.write(`[${ts()}] [wait] Following the worker list -- Ctrl+C to stop\n`);
	await new Promise<void>(resolve => {
		const interval = setInterval(() => void renderOnce(), FOLLOW_POLL_INTERVAL_MS);
		process.on('SIGINT', () => {
			clearInterval(interval);
			resolve();
		});
	});
}

/**
 * `flow worker list` -- the live workers this daemon can currently dispatch to.
 *
 * Deliberately not a view of declared sources: only a connection proves availability
 * (D#4), so a declared source with nothing attached is absent rather than shown as idle
 * capacity. Use `flow worker source list` to see what has been declared.
 */
export function registerWorkerListCommand(worker: Command): void {
	worker
		.command('list')
		.description('List the workers currently connected to the daemon')
		.option('--json', 'Output as JSON')
		.option(
			'-f, --follow',
			'Keep following the worker list (tail -f style: only new/changed workers are printed after the initial read) until interrupted (Ctrl-C), instead of exiting after one read'
		)
		.action(async (options: { json?: boolean; follow?: boolean }) => {
			const service = FlowQueryService.forConfigDir(flowConfigDir());
			const json = options.json === true;
			if (options.follow === true) {
				await runWorkerListFollow(service, json);
			} else {
				await runWorkerListOnce(service, json);
			}
		});
}
