import type { Command } from 'commander';
import { InvalidQueryError, describeSkippedExecutions, executionsDirOf, loadExecutionReport } from 'flow-core';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { flowConfigDir } from '../../config/FlowConfigDir.js';
import { ExecutionRecordRemover } from '../../storage/ExecutionRecordRemover';
import { IsoDateOption } from './IsoDateOption';
import { resolveProjectFilter } from './ProjectFilter';
import { type PruneOutcome, PruneReport } from './PruneReport';
import { type PruneCriteria, PruneSelector } from './PruneSelector';
import { singleProjectValue } from './SingleProjectOption';

interface PruneOptions {
	project?: string;
	flow?: string[];
	status?: string;
	before?: string;
	dryRun?: boolean;
	yes?: boolean;
	json?: boolean;
}

function collectFlow(value: string, previous: string[] = []): string[] {
	return [...previous, value];
}

function fail(message: string): never {
	console.error(message);
	return process.exit(1);
}

export function registerPruneCommand(program: Command, getConfigDir: () => string = flowConfigDir): void {
	program
		.command('prune')
		.description(
			'Delete useless execution records (e.g. probe runs) so they leave flow history and flow cost (times are UTC)\n' +
				'  At least one filter is required. Only completed and failed runs are deleted; queued, running and paused runs are refused.\n' +
				'  Without --yes nothing is deleted: the command lists what it would delete (same as --dry-run).\n' +
				'  Deleted with a record: its leftover restart snapshot and its plugin workspace metadata folder.\n' +
				'  Never deleted: daemon logs, <project>/.flow/runs/<id>.meta folders.\n' +
				'  Exit codes: 0 done (or dry run); 1 usage error, a refused run when --status asked for unfinished runs only, or a record that could not be deleted\n' +
				'  --json              One JSON document (schema 1): { schema, dryRun, deleted | wouldDelete: [{executionId, flowId, status, startedAt}], refused: [{executionId, reason}] }'
		)
		.option(
			'-p, --project <ref>',
			'Only the executions of a project: name, alias or id (default: FLOW_PROJECT)',
			singleProjectValue
		)
		.option('--flow <flowId>', 'Only the executions of this flow ID (repeatable)', collectFlow)
		.option(
			'--status <status>',
			'Only this status (completed|failed; queued, running and paused runs are always refused)'
		)
		.option('--before <date>', 'Only runs started strictly before this ISO date or datetime (UTC when no offset)')
		.option('--dry-run', 'List what would be deleted, delete nothing')
		.option('--yes', 'Delete for real (without it nothing is deleted)')
		.option('--json', 'Machine-readable JSON output')
		.action((opts: PruneOptions) => {
			const projectId = resolveProjectFilter(opts.project, process.env);
			let criteria: PruneCriteria;
			try {
				criteria = {
					flows: opts.flow ?? [],
					...(projectId === undefined ? {} : { projectId }),
					...(opts.status === undefined ? {} : { status: opts.status }),
					...(opts.before === undefined ? {} : { beforeMs: IsoDateOption.parse(opts.before, '--before') }),
				};
				if (opts.status !== undefined) {
					PruneSelector.assertKnownStatus(opts.status);
				}
			} catch (err) {
				if (err instanceof InvalidQueryError) {
					return fail(err.message);
				}
				throw err;
			}
			// FLOW_PROJECT alone is an ambient default, not a request: it narrows a filter, it never replaces one.
			const { projectId: scopedProjectId, ...withoutProject } = criteria;
			const explicitFilter: PruneCriteria = {
				...withoutProject,
				...(opts.project === undefined || scopedProjectId === undefined ? {} : { projectId: scopedProjectId }),
			};
			if (!PruneSelector.hasFilter(explicitFilter)) {
				return fail(
					'flow prune needs at least one filter, so it never deletes the whole history by accident: ' +
						'-p/--project <ref>, --flow <flowId>, --status <status> or --before <date>. Add --dry-run to preview.'
				);
			}
			const configDir = getConfigDir();
			const executionsDir = executionsDirOf(configDir);
			let report;
			try {
				report = loadExecutionReport(executionsDir);
			} catch (err) {
				return fail(
					`Cannot read the executions directory ${executionsDir} (${normalizeError(err).message}). ` +
						'Check that it exists and is readable, or that FLOW_CONFIG_DIR / XDG_CONFIG_HOME point to the flow config directory.'
				);
			}
			const warning = describeSkippedExecutions(report.skipped);
			if (warning !== undefined) {
				console.error(
					`[flow] warning: ${warning} (flow prune never deletes a file it cannot read as an execution)`
				);
			}
			const selection = PruneSelector.select(report.executions, criteria);
			const dryRun = opts.dryRun === true || opts.yes !== true;
			const confirmationMissing = opts.dryRun !== true && opts.yes !== true;
			let outcome: PruneOutcome;
			let exitCode = 0;
			if (dryRun) {
				outcome = {
					dryRun: true,
					items: selection.deletable.map(PruneReport.item),
					refused: selection.refused,
					snapshotsRemoved: 0,
					pluginMetaRemoved: 0,
				};
			} else {
				const remover = new ExecutionRecordRemover(
					executionsDir,
					record => PruneSelector.refusalReason(record) === undefined
				);
				const doomed = new Set(selection.deletable.map(record => record.executionId));
				const removal = remover.remove(
					[...doomed],
					report.executions.filter(record => !doomed.has(record.executionId))
				);
				const removedIds = new Set(removal.removed.map(removed => removed.executionId));
				outcome = {
					dryRun: false,
					items: selection.deletable
						.filter(record => removedIds.has(record.executionId))
						.map(PruneReport.item),
					refused: [...selection.refused, ...removal.notRemoved],
					snapshotsRemoved: removal.snapshotsRemoved,
					pluginMetaRemoved: removal.pluginMetaRemoved,
				};
				if (removal.notRemoved.length > 0) {
					exitCode = 1;
				}
			}
			if (PruneSelector.asksForUnfinished(opts.status) && selection.refused.length > 0) {
				exitCode = 1;
			}
			if (opts.json) {
				process.stdout.write(JSON.stringify(PruneReport.toJson(outcome)) + '\n');
				// stdout stays one JSON document; the reminder goes to stderr.
				if (confirmationMissing) {
					console.error('[flow] nothing deleted, rerun with --yes to delete.');
				}
			} else {
				console.log(PruneReport.renderText(outcome, confirmationMissing));
			}
			if (exitCode !== 0) {
				process.exitCode = exitCode;
			}
		});
}
