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
import { FLOW_PROJECT_ENV, ProjectScopeError, ProjectScopeResolver } from '../../config/ProjectScopeResolver';
// violations-suppress-end: ts/no-deep-relative
import { isFileLikeReference } from './FlowReference';
import { singleProjectValue } from './SingleProjectOption';

/**
 * The `.flow/flows.yml` of the project this command works on, or undefined when the working directory is in no registered
 * project (only the snapshots are listed then, and the reason goes to stderr). A project that was NAMED (`--project`,
 * `FLOW_PROJECT`) and cannot be resolved is an error: listing something else would answer a different question.
 */
function registryFileOf(projectRef: string | undefined, cwd: string): string | undefined {
	const resolver = new ProjectScopeResolver();
	const named = projectRef !== undefined || (process.env[FLOW_PROJECT_ENV] ?? '').trim() !== '';
	try {
		const folder = resolver.requirePath(
			resolver.resolve({ cwd, ...(projectRef === undefined ? {} : { projectRef }) })
		);
		return path.join(folder, '.flow', 'flows.yml');
	} catch (err) {
		if (err instanceof ProjectScopeError && !named && err.code === 'NO_PROJECT_IN_SCOPE') {
			console.error(
				`[flow] The registry of the project was not read, only the snapshots of flows that ran are listed.\n${normalizeError(err).message}`
			);
			return undefined;
		}
		throw err;
	}
}

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
		.option(
			'-p, --project <ref>',
			'Project (name, alias or id) whose registry is read. Default: FLOW_PROJECT, then the registered project containing the cwd',
			singleProjectValue
		)
		.action((flowId: string, opts: { json?: boolean; project?: string }) => {
			if (isFileLikeReference(flowId)) {
				console.error(
					`'${flowId}' looks like a file path, but flow versions takes a flow id (see the ids in the project's .flow/flows.yml). ` +
						'A flow that has only a file gets its first version when it runs: flow run <path>.'
				);
				process.exit(1);
			}
			let rows;
			try {
				const registryFile = registryFileOf(opts.project, getCwd());
				rows = listFlowVersions(
					new DefinitionSnapshotStore(definitionsDirOf(getConfigDir())),
					flowId,
					registryFile
				);
			} catch (err) {
				if (!(err instanceof FlowCoreError) && !(err instanceof ProjectScopeError)) {
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
