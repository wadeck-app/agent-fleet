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
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { flowConfigDir } from '../../config/FlowConfigDir.js';
// violations-suppress: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { loadYaml } from '../../utils/loadYaml';
import { renderSecretsSummary } from './SecretsSummary';

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
	const secrets = renderSecretsSummary(flow);
	if (secrets !== '') {
		console.log(secrets + '\n');
	}
}

function showExecution(
	target: string,
	service: FlowQueryService,
	opts: { json?: boolean; tail?: number; full?: boolean; io?: boolean }
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
		console.log(service.renderExecution(target, { tail, full: opts.full === true, io: opts.io === true }));
	} catch (err) {
		if (!(err instanceof ExecutionLookupError)) {
			throw err;
		}
		console.error(normalizeError(err).message);
		if (err.kind === 'not-found') {
			console.error(
				`'${target}' is also not an existing flow file (cwd: ${process.cwd()}).\n` +
					'  List execution ids with: flow history'
			);
		}
		process.exit(1);
	}
}

export function registerShowCommand(program: Command, getConfigDir: () => string = flowConfigDir): void {
	program
		.command('show <target>')
		.description(
			'Display a flow YAML file summary, or the steps of a past execution\n' +
				'  <target>       Path to a .yaml file, or an execution id (or unique prefix) from `flow history`\n' +
				'                 An existing file always wins; otherwise <target> is treated as an execution id\n' +
				'  --json         Machine-readable output (execution: raw record, untruncated)\n' +
				`  --tail <n>     Execution only: trailing chars of stdout/stderr of failed steps (default: ${DEFAULT_TAIL_CHARS})\n` +
				'  --full         Execution only: print stdout/stderr of failed steps untruncated\n' +
				'  --io           Execution only: print what each step received and produced (inputs, outputs, stdout/stderr tails; capped, secrets masked)'
		)
		.option('--json', 'Machine-readable JSON output')
		.option('--tail <n>', 'Execution only: trailing characters of stdout/stderr shown for failed steps', v =>
			Number(v)
		)
		.option('--full', 'Execution only: do not truncate stdout/stderr of failed steps')
		.option('--io', 'Execution only: print the recorded inputs, outputs and stdout/stderr tails of each step')
		.action((target: string, opts: { json?: boolean; tail?: number; full?: boolean; io?: boolean }) => {
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
