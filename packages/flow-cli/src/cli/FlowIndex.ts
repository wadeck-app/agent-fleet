#!/usr/bin/env node
import { runRunCommand } from './RunCommand.js';
import { runValidateCommand } from './ValidateCommand.js';

const [, , command, ...rest] = process.argv;

switch (command) {
	case 'validate':
		runValidateCommand(rest);
		break;
	case 'run':
		void runRunCommand(rest);
		break;
	case '--help':
	case undefined:
		process.stdout.write('Usage: flow <validate|run> [options]\n');
		process.exit(0);
		break;
	default:
		process.stderr.write(`Unknown command: ${command}\nUsage: flow <validate|run> [options]\n`);
		process.exit(1);
}
