import { ConfigDir } from '@wadeck-app/shared-cli';
import type { Command } from 'commander';
import { FlowQueryService, InvalidQueryError } from 'flow-core';
import type { ExecutionFilterOptions } from 'flow-core';

/** Default flow config directory, resolved lazily so ConfigDir is read at run time. */
function defaultConfigDir(): string {
	return ConfigDir.get('flow');
}

export function registerHistoryCommand(program: Command, getConfigDir: () => string = defaultConfigDir): void {
	program
		.command('history')
		.description(
			'List past flow executions\n' +
				'  --limit N      Max results (default: 20)\n' +
				'  --offset N     Skip first N (pagination)\n' +
				'  --status s     Filter: completed|failed|running|queued\n' +
				'  --flow <id>    Filter by flow ID\n' +
				'  --id <execId>  Show step detail for one execution'
		)
		.option('-n, --limit <n>', 'Max number of executions to show (default: 20)', parseInt)
		.option('--offset <n>', 'Skip first N executions (for pagination)', parseInt)
		.option('--status <status>', 'Filter by status (completed|failed|running|queued)')
		.option('--flow <flowId>', 'Filter by flow ID')
		.option('--id <executionId>', 'Show detail for a specific execution (steps + injected* markers)')
		.option('--json', 'Machine-readable JSON output')
		.action((opts: ExecutionFilterOptions & { json?: boolean }) => {
			const service = FlowQueryService.forConfigDir(getConfigDir());
			try {
				if (!opts.json) {
					console.log(service.renderHistory(opts));
					return;
				}
				// Same selection as the table, but raw records
				const { items } = service.listExecutions(opts);
				const output = opts.id && items.length === 1 ? items[0] : items;
				process.stdout.write(JSON.stringify(output) + '\n');
			} catch (err) {
				if (!(err instanceof InvalidQueryError)) throw err;
				console.error(err.message);
				process.exit(1);
			}
		});
}
