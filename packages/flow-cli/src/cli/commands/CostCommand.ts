import { defaultRegistryDir } from '@wadeck-app/project-sdk';
import type { Command } from 'commander';
import { FlowQueryService, InvalidQueryError, createRegistryProjectLookup, describeSkippedExecutions } from 'flow-core';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { flowConfigDir } from '../../config/FlowConfigDir.js';
import { CostReportBuilder } from './CostReportBuilder';
import { CostSince } from './CostSince';
import { CostTextRenderer } from './CostTextRenderer';
import { exitOnReferenceError, resolveExecutionReference } from './ExecutionReference';
import { singleProjectValue } from './SingleProjectOption';

interface CostOptions {
	project?: string;
	flow?: string;
	status?: string;
	since?: string;
	limit?: number;
	by?: string;
	json?: boolean;
}

export function registerCostCommand(program: Command, getConfigDir: () => string = flowConfigDir): void {
	program
		.command('cost')
		.description(
			'Cost of past flow executions, from the recorded step costs (same figures as flow show; times are UTC)\n' +
				'  --by flow           One row per flow: runs, total, median and max per run\n' +
				'  --by input:<name>   One row per value of the run input <name> (read from the recorded step inputs)\n' +
				'  --since <date>      Only runs started at or after an ISO date/datetime (e.g. 2026-11-01)\n' +
				'  --json              One JSON document on stdout (schema 1); an unknown cost is an absent field, never 0'
		)
		.option(
			'-p, --project <ref>',
			'Only the executions of a project: name, alias or id (default: FLOW_PROJECT)',
			singleProjectValue
		)
		.option('--flow <flowId>', 'Filter by flow ID')
		.option('--status <status>', 'Filter by status (completed|failed|running|queued)')
		.option('--since <date>', 'Only runs started at or after this ISO date or datetime (UTC when no offset)')
		.option('-n, --limit <n>', 'Max number of runs considered, newest first (default: unlimited)', parseInt)
		.option('--by <grouping>', 'Group the rows: flow | input:<name> (default: one row per run)')
		.option('--json', 'Machine-readable JSON output')
		.action((opts: CostOptions) => {
			const service = FlowQueryService.forConfigDir(
				getConfigDir(),
				undefined,
				createRegistryProjectLookup(defaultRegistryDir(process.env))
			);
			const { projectId } = exitOnReferenceError(() => resolveExecutionReference('', opts.project, process.env));
			try {
				const grouping = CostReportBuilder.parseGrouping(opts.by);
				const sinceMs = opts.since === undefined ? undefined : CostSince.parse(opts.since);
				if (opts.limit !== undefined && (!Number.isInteger(opts.limit) || opts.limit < 0)) {
					throw new InvalidQueryError(
						`Invalid limit '${String(opts.limit)}': expected a non-negative integer.`
					);
				}
				// No page: the cost of a period must not silently stop at the 20 runs `flow history` shows.
				const { items, skipped } = service.listExecutions({
					limit: Number.MAX_SAFE_INTEGER,
					...(opts.status === undefined ? {} : { status: opts.status }),
					...(opts.flow === undefined ? {} : { flow: opts.flow }),
					...(projectId === undefined ? {} : { projectId }),
				});
				const warning = describeSkippedExecutions(skipped);
				if (warning !== undefined) {
					console.error(`[flow] warning: ${warning}`);
				}
				const since =
					sinceMs === undefined ? items : items.filter(item => CostSince.includes(item.startedAt, sinceMs));
				const records = opts.limit === undefined ? since : since.slice(0, opts.limit);
				const report = CostReportBuilder.build(records, grouping, {
					...(opts.project === undefined ? {} : { project: opts.project }),
					...(projectId === undefined ? {} : { projectId }),
					...(opts.flow === undefined ? {} : { flow: opts.flow }),
					...(opts.status === undefined ? {} : { status: opts.status }),
					...(opts.since === undefined ? {} : { since: opts.since }),
					...(opts.limit === undefined ? {} : { limit: opts.limit }),
				});
				if (opts.json) {
					process.stdout.write(JSON.stringify(report) + '\n');
				} else {
					console.log(CostTextRenderer.render(report));
				}
			} catch (err) {
				if (err instanceof InvalidQueryError) {
					console.error(err.message);
					process.exit(1);
				}
				const code = (err as NodeJS.ErrnoException).code;
				if (typeof code === 'string') {
					console.error(
						`Cannot read the executions directory under ${getConfigDir()} (${code}: ${normalizeError(err).message}). ` +
							'Check that it exists and is readable, or that FLOW_CONFIG_DIR / XDG_CONFIG_HOME point to the flow config directory.'
					);
					process.exit(1);
				}
				throw err;
			}
		});
}
