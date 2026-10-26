import { defaultRegistryDir, loadRegistry, resolveReference } from '@wadeck-app/project-sdk';
import type { Command } from 'commander';
import { FlowQueryService, InvalidQueryError, createRegistryProjectLookup, describeSkippedExecutions } from 'flow-core';
import type { ExecutionFilterOptions } from 'flow-core';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { flowConfigDir } from '../../config/FlowConfigDir.js';
import { singleProjectValue } from './SingleProjectOption';

// stderr, so a piped table or --json document stays clean; the history itself is still shown.
function warnAboutSkippedFiles(warning: string | undefined): void {
	if (warning !== undefined) {
		console.error(`[flow] warning: ${warning}`);
	}
}

/**
 * The project id `flow history` filters on: `-p/--project`, else `FLOW_PROJECT` (blank counts as unset), else none.
 * Only an explicit choice filters: a listing is not scoped to the cwd. An unresolved reference is reported with the
 * place it came from and exits 1; it never falls back to an unfiltered listing.
 */
function resolveProjectFilter(flag: string | undefined, env: NodeJS.ProcessEnv): string | undefined {
	const fromEnv = env['FLOW_PROJECT'];
	const envRef = fromEnv !== undefined && fromEnv.trim() !== '' ? fromEnv : undefined;
	const ref = flag ?? envRef;
	if (ref === undefined) {
		return undefined;
	}
	try {
		return resolveReference(loadRegistry(defaultRegistryDir(env)), ref).id;
	} catch (err) {
		const from = flag === undefined ? `FLOW_PROJECT="${ref}"` : `--project "${ref}"`;
		// violations-suppress: security/no-raw-err-in-cli the project-sdk error messages are written for users (they name the reference and the registered projects)
		console.error(`${from}: ${normalizeError(err).message}`);
		return process.exit(1);
	}
}

export function registerHistoryCommand(program: Command, getConfigDir: () => string = flowConfigDir): void {
	program
		.command('history')
		.description(
			'List past flow executions\n' +
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
