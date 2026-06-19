import type { Command } from 'commander';

import { FlowCliRunner } from '../FlowCliRunner.js';

function parseInputs(rawInputs: string[]): Record<string, string> {
	const result: Record<string, string> = {};
	for (const entry of rawInputs) {
		const separatorIndex = entry.indexOf('=');
		if (separatorIndex === -1) {
			console.error(`Invalid input format: '${entry}'. Expected key=value.`);
			process.exit(1);
		}
		const key = entry.slice(0, separatorIndex);
		if (!key) {
			console.error(`Invalid input format: '${entry}'. Key cannot be empty.`);
			process.exit(1);
		}
		const value = entry.slice(separatorIndex + 1);
		result[key] = value;
	}
	return result;
}

export function registerRunCommand(program: Command): void {
	program
		.command('run <flowRef>')
		.description('Run a flow by file path or flow ID')
		.option(
			'-i, --inputs <key=value>',
			'Input key=value pair (repeatable)',
			(val, acc: string[]) => {
				acc.push(val);
				return acc;
			},
			[] as string[]
		)
		.option('--cwd <dir>', 'Working directory for flow execution')
		.action(async (flowRef: string, options: { inputs: string[]; cwd?: string }) => {
			const cwd = options.cwd ?? process.cwd();
			const inputs = parseInputs(options.inputs);

			const runner = new FlowCliRunner(cwd);

			const start = Date.now();
			let result;
			try {
				result = await runner.run({ flowRef, inputs, cwd });
			} catch (err) {
				console.error(`Flow execution failed: ${err instanceof Error ? err.message : String(err)}`);
				process.exit(1);
				return;
			}

			const durationMs = Date.now() - start;

			if (!result.success) {
				console.error(`Flow failed: ${result.error ?? 'unknown error'}`);
				process.exit(1);
			}

			console.log(`✓ Flow '${flowRef}' completed in ${durationMs}ms`);

			const outputEntries = Object.entries(result.outputs);
			if (outputEntries.length > 0) {
				console.log('\nOutputs:');
				for (const [stepId, stepOutputs] of outputEntries) {
					for (const [key, value] of Object.entries(stepOutputs)) {
						const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
						console.log(`  ${stepId}.${key}: ${display}`);
					}
				}
			}
		});
}
