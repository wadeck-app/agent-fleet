import { ConfigDir } from '@wadeck-app/shared-cli';
import type { Command } from 'commander';
import {
	DEFAULT_TAIL_CHARS,
	ExecutionLookupError,
	FlowQueryService,
	looksLikeExecutionId,
	renderFlowSummary,
} from 'flow-core';
import type { FlowDefinition } from 'flow-engine/types';
import * as fs from 'node:fs';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { loadYaml } from '../../utils/loadYaml';

/** Default flow config directory, resolved lazily so ConfigDir is read at run time. */
function defaultConfigDir(): string {
	return ConfigDir.get('flow');
}

function isExistingFile(target: string): boolean {
	try {
		return fs.statSync(target).isFile();
	} catch {
		return false;
	}
}

function showFlowFile(file: string, opts: { json?: boolean }): void {
	const raw = loadYaml(file);

	const flow = raw as FlowDefinition;
	if (!Array.isArray(flow.steps) || !flow.workspace) {
		console.error(`Invalid flow: missing required fields 'steps' or 'workspace' in ${file}`);
		process.exit(1);
	}

	if (opts.json) {
		process.stdout.write(JSON.stringify(flow) + '\n');
		return;
	}

	console.log(renderFlowSummary(flow));
}

function showExecution(
	target: string,
	service: FlowQueryService,
	opts: { json?: boolean; tail?: number; full?: boolean }
): void {
	const tail = opts.tail ?? DEFAULT_TAIL_CHARS;
	if (!Number.isInteger(tail) || tail < 0) {
		console.error(`Invalid --tail value: expected a non-negative integer (number of characters).`);
		process.exit(1);
	}
	try {
		if (opts.json) {
			// Raw record, untruncated (same convention as `flow history --json`).
			process.stdout.write(JSON.stringify(service.getExecution(target).record) + '\n');
			return;
		}
		console.log(service.renderExecution(target, { tail, full: opts.full === true }));
	} catch (err) {
		if (!(err instanceof ExecutionLookupError)) throw err;
		console.error(err.message);
		if (err.kind === 'not-found') {
			console.error(
				`'${target}' is also not an existing flow file (cwd: ${process.cwd()}).\n` +
					'  List execution ids with: flow history'
			);
		}
		process.exit(1);
	}
}

export function registerShowCommand(program: Command, getConfigDir: () => string = defaultConfigDir): void {
	program
		.command('show <target>')
		.description(
			'Display a flow YAML file summary, or the steps of a past execution\n' +
				'  <target>       Path to a .yaml file, or an execution id (or unique prefix) from `flow history`\n' +
				'                 An existing file always wins; otherwise <target> is treated as an execution id\n' +
				'  --json         Machine-readable output (execution: raw record, untruncated)\n' +
				`  --tail <n>     Execution only: trailing chars of stdout/stderr of failed steps (default: ${DEFAULT_TAIL_CHARS})\n` +
				'  --full         Execution only: print stdout/stderr of failed steps untruncated'
		)
		.option('--json', 'Machine-readable JSON output')
		.option('--tail <n>', 'Execution only: trailing characters of stdout/stderr shown for failed steps', v =>
			Number(v)
		)
		.option('--full', 'Execution only: do not truncate stdout/stderr of failed steps')
		.action((target: string, opts: { json?: boolean; tail?: number; full?: boolean }) => {
			if (isExistingFile(target)) {
				showFlowFile(target, opts);
				return;
			}
			if (looksLikeExecutionId(target)) {
				showExecution(target, FlowQueryService.forConfigDir(getConfigDir()), opts);
				return;
			}
			console.error(
				`'${target}' is neither an existing flow file nor an execution id.\n` +
					`  As a file:       no such file (cwd: ${process.cwd()})\n` +
					'  As an execution: not a valid id (lowercase letters/digits, e.g. a6wug7bh)\n' +
					'  List execution ids with: flow history'
			);
			process.exit(1);
		});
}
