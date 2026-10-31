import { defaultRegistryDir } from '@wadeck-app/project-sdk';
import type { Command } from 'commander';
import { FlowQueryService, InvalidQueryError, createRegistryProjectLookup, describeSkippedExecutions } from 'flow-core';
import type { ExecutionFilterOptions } from 'flow-core';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { flowConfigDir } from '../../config/FlowConfigDir.js';
import { resolveProjectFilter } from './ProjectFilter';
import { singleProjectValue } from './SingleProjectOption';

// stderr, so a piped table or --json document stays clean; the history itself is still shown.
function warnAboutSkippedFiles(warning: string | undefined): void {
	if (warning !== undefined) {
		console.error(`[flow] warning: ${warning}`);
	}
}

export function registerHistoryCommand(program: Command, getConfigDir: () => string = flowConfigDir): void {
	program
		.command('history')
		.description(
			'List past flow executions (times are UTC)\n' +
				'  --limit N      Max results (default: 20)\n' +
				'  --offset N     Skip first N (pagination)\n' +
				'  --status s     Filter: completed|failed|running|queued\n' +
				'  --flow <id>    Filter by flow ID\n' +
				'  --id <execId>  Show step detail for one execution\n' +
				'  -p, --project <ref>  Only the executions of a project (name, alias or id; or FLOW_PROJECT)'
		)
		.option('-n, --limit <n>', 'Max number of executions to show (default: 20)', parseInt)
		.option('--offset <n>', 'Skip first N executions (for pagination)', parseInt)
		.option('--status <status>', 'Filter by status (completed|failed|running|queued)')
		.option('--flow <flowId>', 'Filter by flow ID')
		.option('--id <executionId>', 'Show detail for a specific execution (steps + injected* markers)')
		.option(
			'-p, --project <ref>',
			'Only the executions of a project: name, alias or id (default: FLOW_PROJECT)',
			singleProjectValue
		)
		.option('--json', 'Machine-readable JSON output')
		.action((rawOpts: ExecutionFilterOptions & { json?: boolean; project?: string }) => {
			const { project, ...rest } = rawOpts;
			const projectId = resolveProjectFilter(project, process.env);
			const opts: ExecutionFilterOptions & { json?: boolean } = {
				...rest,
				...(projectId === undefined ? {} : { projectId }),
			};
			const service = FlowQueryService.forConfigDir(
				getConfigDir(),
				undefined,
				createRegistryProjectLookup(defaultRegistryDir(process.env))
			);
			try {
				if (!opts.json) {
					const { text, skippedWarning } = service.renderHistoryReport(opts);
					console.log(text);
					warnAboutSkippedFiles(skippedWarning);
					return;
				}
				// Same selection as the table, but raw records
				const { items, skipped } = service.listExecutions(opts);
				warnAboutSkippedFiles(describeSkippedExecutions(skipped));
				const output = opts.id && items.length === 1 ? items[0] : items;
				process.stdout.write(JSON.stringify(output) + '\n');
			} catch (err) {
				if (!(err instanceof InvalidQueryError)) {
					throw err;
				}
				console.error(normalizeError(err).message);
				process.exit(1);
			}
		});
}
