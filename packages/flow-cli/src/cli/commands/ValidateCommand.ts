import type { Command } from 'commander';

import { validateFlowFile } from '../../validation/FlowFileValidator';

export function registerValidateCommand(program: Command): void {
	program
		.command('validate <file>')
		.description('Validate a flow YAML file')
		.option('--json', 'Output JSON (machine-readable, exit codes 0/1/2/3)')
		.option('--human', 'Force human-readable output')
		.action((file: string, options: { json?: boolean; human?: boolean }) => {
			const result = validateFlowFile(file);

			if (options.json && !options.human) {
				// Machine-readable: Repo B contract
				switch (result.exit) {
					case 0:
						process.stdout.write(JSON.stringify({ valid: true }) + '\n');
						process.exit(0);
					case 1:
						process.stdout.write(JSON.stringify({ valid: false, errors: result.errors }) + '\n');
						process.exit(1);
					case 2:
						process.stdout.write(
							JSON.stringify({
								valid: false,
								errors: [{ type: 'file_not_found', message: result.message, path: '' }],
							}) + '\n'
						);
						process.exit(2);
					case 3:
						process.stdout.write(JSON.stringify({ valid: false, errors: result.errors }) + '\n');
						process.exit(3);
					default: {
						const _exhaustive: never = result;
						throw new Error(`Unexpected result: ${JSON.stringify(_exhaustive)}`);
					}
				}
			}

			// Human-readable: Repo A contract
			if (result.exit === 2) {
				console.error(`✗ ${result.message}`);
				process.exit(1);
			}
			if (result.exit === 3) {
				console.error(`✗ Parse error: ${result.errors[0]?.message ?? 'unknown'}`);
				process.exit(1);
			}
			if (result.exit === 1) {
				console.error(`✗ Flow has ${result.errors.length} error${result.errors.length > 1 ? 's' : ''}`);
				for (const err of result.errors) {
					const loc = err.path ? ` [${err.path}]` : '';
					// violations-suppress: security/no-raw-err-in-cli err is a structured validation-result object, not a caught exception
					console.error(`  - ${err.message}${loc}`);
				}
				process.exit(1);
			}
			console.log('✓ Flow is valid');
			process.exit(0);
		});
}
