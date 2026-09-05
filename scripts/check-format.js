#!/usr/bin/env node

/**
 * LLM Agent-Friendly Prettier Format Checker
 *
 * Features:
 * - Minimal console output on success
 * - Errors logged to file (format-errors.log) on failure
 * - Clean summary format for agent parsing
 * - Checks all files across the monorepo
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// Use chalk if available, otherwise fallback to plain text
let chalk;
try {
	const chalkModule = await import('chalk');
	chalk = chalkModule.default;
} catch (e) {
	chalk = {
		green: str => str,
		red: str => str,
		yellow: str => str,
		blue: str => str,
		gray: str => str,
		bold: { green: str => str, red: str => str, yellow: str => str },
	};
}

const ERROR_LOG = 'format-errors.log';

/**
 * Run Prettier check for all files
 */
function checkFormat() {
	return new Promise((resolve, reject) => {
		const command = 'npx prettier --check .';
		const prettier = spawn(command, {
			shell: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';

		prettier.stdout.on('data', data => {
			stdout += data.toString();
		});

		prettier.stderr.on('data', data => {
			stderr += data.toString();
		});

		prettier.on('close', code => {
			const output = stdout + stderr;
			const hasErrors = code !== 0;

			if (hasErrors) {
				// Parse files that need formatting
				const unformattedFiles = output
					.split('\n')
					.filter(
						line => line.trim() && !line.includes('Code style issues') && !line.includes('prettier --write')
					)
					.map(line => line.trim());

				resolve({
					hasErrors: true,
					files: unformattedFiles,
					output: output,
				});
			} else {
				resolve({
					hasErrors: false,
					files: [],
					output: output,
				});
			}
		});

		prettier.on('error', err => {
			reject(new Error(`Failed to run Prettier check: ${err.message}`));
		});
	});
}

/**
 * Main execution
 */
async function main() {
	// console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
	console.log(chalk.blue('🎨 Checking code formatting...'));
	// console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

	// Clear previous error log
	if (fs.existsSync(ERROR_LOG)) {
		fs.unlinkSync(ERROR_LOG);
	}

	console.log(chalk.gray('Running Prettier check...'));

	try {
		const result = await checkFormat();

		if (!result.hasErrors) {
			// SUCCESS
			// console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
			console.log(chalk.bold.green('✅ All files are properly formatted!'));
			// console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
			process.exit(0);
		} else {
			// FAILURE - Write errors to log
			const logContent = [];
			logContent.push('Prettier Format Issues Report');
			logContent.push('═'.repeat(80));
			logContent.push('');
			logContent.push('The following files need formatting:');
			logContent.push('');
			logContent.push(...result.files);
			logContent.push('');
			logContent.push('─'.repeat(80));
			logContent.push('');
			logContent.push('Full output:');
			logContent.push('');
			logContent.push(result.output);
			logContent.push('');
			logContent.push('─'.repeat(80));
			logContent.push('');
			logContent.push('To fix these issues, run:');
			logContent.push('  npm run format');
			logContent.push('');

			fs.writeFileSync(ERROR_LOG, logContent.join('\n'), 'utf8');

			// Print summary
			const fileCount = result.files.filter(
				f => !f.includes('Checking formatting') && !f.includes('[warn]')
			).length;
			console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
			console.log(chalk.bold.red(`❌ Formatting issues found in ${fileCount} file(s)`));
			console.log(chalk.yellow(`📄 See ${ERROR_LOG} for details`));
			console.log(chalk.yellow(`💡 Run "npm run format" to fix`));
			console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
			process.exit(1);
		}
	} catch (err) {
		console.error(chalk.bold.red('Fatal error:'), err.message);
		process.exit(1);
	}
}

// Run
main().catch(err => {
	console.error(chalk.bold.red('Fatal error:'), err);
	process.exit(1);
});
