import type { Command } from 'commander';
import {
	DefinitionSnapshotStore,
	FlowCoreError,
	definitionsDirOf,
	listFlowVersions,
	renderVersionTable,
} from 'flow-core';
import * as path from 'node:path';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { flowConfigDir } from '../../config/FlowConfigDir.js';
import { ProjectResolverFactory } from '../../config/ProjectResolverFactory';

// violations-suppress-end: ts/no-deep-relative

export function registerVersionsCommand(
	program: Command,
	getConfigDir: () => string = flowConfigDir,
	getCwd: () => string = () => process.cwd()
): void {
	program
		.command('versions <flowId>')
		.description(
			'List the known versions of a flow: those that ran (immutable snapshots) and the one in the project registry\n' +
				'  The version marked * is what `flow run <flowId>` runs; pin another with `flow run <flowId>@<version>`'
		)
		.option('--json', 'Machine-readable JSON output')
		.action((flowId: string, opts: { json?: boolean }) => {
			let rows;
			try {
				// The registry is optional: without a project only the snapshots are listed.
				const projectRoot = ProjectResolverFactory.create().tryResolve(getCwd())?.projectRoot;
				const registryFile =
					projectRoot === undefined ? undefined : path.join(projectRoot, '.flow', 'flows.yml');
				rows = listFlowVersions(
					new DefinitionSnapshotStore(definitionsDirOf(getConfigDir())),
					flowId,
					registryFile
				);
			} catch (err) {
				if (!(err instanceof FlowCoreError)) {
					throw err;
				}
				console.error(normalizeError(err).message);
				process.exit(1);
			}
			if (opts.json) {
				process.stdout.write(JSON.stringify(rows) + '\n');
				return;
			}
			if (rows.length === 0) {
				console.error(renderVersionTable(flowId, rows));
				process.exit(1);
			}
			console.log(renderVersionTable(flowId, rows));
		});
}
