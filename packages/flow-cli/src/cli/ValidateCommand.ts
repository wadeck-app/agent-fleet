import { validateFlowFile } from '../validation/FlowValidator.js';

export function runValidateCommand(args: string[]): never {
	const filePath = args[0];
	if (!filePath) {
		process.stderr.write('Usage: flow validate <file>\n');
		process.exit(1);
	}

	const result = validateFlowFile(filePath);

	switch (result.exit) {
		case 0:
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
			throw new Error(`Unexpected validate result: ${JSON.stringify(_exhaustive)}`);
		}
	}
}
