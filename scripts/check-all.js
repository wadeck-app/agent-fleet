#!/usr/bin/env node

/**
 * LLM Agent-Friendly Combined Checker
 *
 * Features:
 * - Runs TypeScript, ESLint, and Prettier checks
 * - Minimal console output on success
 * - Clean summary format for agent parsing
 * - Shows combined results from all checks
 */
import chalk from 'chalk';
import { spawn } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run a check script
 */
function runCheck(scriptName, displayName) {
	return new Promise(resolve => {
		const command = `node scripts/${scriptName}`;
		const check = spawn(command, {
			cwd: process.cwd(),
			shell: true,
			stdio: 'inherit',
		});

		check.on('close', code => {
			resolve({
				name: displayName,
				passed: code === 0,
			});
		});

		check.on('error', err => {
			console.error(chalk.red(`Failed to run ${displayName}: ${err.message}`));
			resolve({
				name: displayName,
				passed: false,
			});
		});
	});
}

/**
 * Main execution
 */
async function main() {
	// console.log(chalk.blue('╔═══════════════════════════════════════════╗'));
	// console.log(chalk.blue('║  🔍 Running All Checks...                ║'));
	console.log(chalk.blue('Running All Checks...'));
	// console.log(chalk.blue('╚═══════════════════════════════════════════╝'));
	console.log('');

	const checks = [
		{ script: 'check-ts.js', name: 'TypeScript' },
		{ script: 'check-eslint.js', name: 'ESLint' },
		{ script: 'check-format.js', name: 'Prettier' },
	];

	const results = [];
	for (const check of checks) {
		const result = await runCheck(check.script, check.name);
		results.push(result);
		console.log(''); // Add spacing between checks
	}

	// Analyze results
	const failedChecks = results.filter(r => !r.passed);

	// console.log(chalk.blue('╔═══════════════════════════════════════════╗'));
	if (failedChecks.length === 0) {
		// SUCCESS
		// console.log(chalk.bold.green('║  ✅ All checks passed!                    ║'));
		console.log(chalk.bold.green('✅ All checks passed!'));
		// console.log(chalk.blue('╚═══════════════════════════════════════════╝'));
		process.exit(0);
	} else {
		// FAILURE
		console.log(
			// chalk.bold.red(`║  ❌ ${failedChecks.length} check(s) failed:                   ║`)
			chalk.bold.red(`❌ ${failedChecks.length} check(s) failed:`)
		);
		for (const failed of failedChecks) {
			// console.log(chalk.red(`║     • ${failed.name}                            ║`));
			console.log(chalk.red(`  • ${failed.name}`));
		}
		// console.log(chalk.blue('╚═══════════════════════════════════════════╝'));
		console.log('');
		console.log(chalk.yellow('📄 Check the error logs for details:'));
		if (results.find(r => r.name === 'TypeScript' && !r.passed)) {
			console.log(chalk.yellow('   - ts-errors.log'));
		}
		if (results.find(r => r.name === 'ESLint' && !r.passed)) {
			console.log(chalk.yellow('   - eslint-errors.log'));
		}
		if (results.find(r => r.name === 'Prettier' && !r.passed)) {
			console.log(chalk.yellow('   - format-errors.log'));
		}
		process.exit(1);
	}
}

// Run
main().catch(err => {
	console.error(chalk.bold.red('Fatal error:'), err);
	process.exit(1);
});
