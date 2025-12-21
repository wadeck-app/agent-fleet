#!/usr/bin/env node

/**
 * LLM Agent-Friendly Test Runner
 *
 * Features:
 * - Minimal console output on success
 * - Errors logged to file (test-errors.log) on failure
 * - Clean summary format for agent parsing
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { testSuiteType_E2E_FUNC, testSuiteType_UNIT, testSuites } from './test-config.js';
import { cleanupAllProcesses, registerCleanupHandlers, trackProcess } from './test-runner-utils.js';

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

// Parse CLI arguments
function parseArgs() {
	const args = process.argv.slice(2);
	const parsed = {
		grep: null,
		exclude: null,
		type: null,
		suite: null,
	};

	for (let i = 0; i < args.length; i++) {
		if (args[i].startsWith('--grep=')) {
			parsed.grep = args[i].split('=')[1];
		} else if (args[i] === '--grep' && args[i + 1]) {
			parsed.grep = args[++i];
		} else if (args[i].startsWith('--exclude=')) {
			parsed.exclude = args[i].split('=')[1];
		} else if (args[i] === '--exclude' && args[i + 1]) {
			parsed.exclude = args[++i];
		} else if (args[i].startsWith('--type=')) {
			parsed.type = args[i].split('=')[1];
		} else if (args[i] === '--type' && args[i + 1]) {
			parsed.type = args[++i];
		} else if (args[i].startsWith('--suite=')) {
			parsed.suite = args[i].split('=')[1];
		} else if (args[i] === '--suite' && args[i + 1]) {
			parsed.suite = args[++i];
		}
	}

	return parsed;
}

// Filter test suites based on criteria
function filterSuites(suites, filters) {
	let filtered = [...suites];

	// Filter by type
	if (filters.type) {
		filtered = filtered.filter(s => s.type === filters.type);
	}

	// Filter by suite name pattern
	if (filters.suite) {
		const pattern = new RegExp(filters.suite.replace(/\*/g, '.*'), 'i');
		filtered = filtered.filter(s => pattern.test(s.name));
	}

	// Exclude by pattern
	if (filters.exclude) {
		const pattern = new RegExp(filters.exclude.replace(/\*/g, '.*'), 'i');
		filtered = filtered.filter(s => !pattern.test(s.name));
	}

	return filtered;
}

// Results storage
const results = [];
const errorLog = [];

/**
 * Run a single test suite and capture output
 */
function runTestSuite(suite, filters) {
	return new Promise(resolve => {
		const startTime = Date.now();
		let stdout = '';
		let stderr = '';

		// Clone args to avoid mutation
		const args = [...suite.args];

		// Add grep filter for test runners
		if (filters.grep) {
			if (suite.type === testSuiteType_UNIT) {
				// Jest pattern: -- --testNamePattern=<pattern>
				args.push('--', '--testNamePattern', filters.grep);
			} else if (suite.type === testSuiteType_E2E_FUNC) {
				// Playwright pattern: --grep <pattern>
				args.push('--grep', filters.grep);
			}
		}

		// Build command string with proper spacing (kept for reference but not used)
		const command = suite.command + args.map(arg => ` ${arg}`).join('');

		const proc = spawn(command, {
			shell: true,
			cwd: process.cwd(),
			env: {
				...process.env,
				...(suite.env || {}),
			},
		});

		// Track this process for cleanup
		trackProcess(proc);

		// Capture stdout
		proc.stdout.on('data', data => {
			stdout += data.toString();
		});

		// Capture stderr
		proc.stderr.on('data', data => {
			stderr += data.toString();
		});

		proc.on('close', code => {
			const duration = Date.now() - startTime;
			const passed = code === 0;

			const result = {
				name: suite.name,
				type: suite.type,
				passed,
				duration,
				exitCode: code,
			};

			// If failed, capture error output
			if (!passed) {
				result.stdout = stdout;
				result.stderr = stderr;
				errorLog.push({
					suite: suite.name,
					exitCode: code,
					stdout,
					stderr,
					duration,
				});
			}

			results.push(result);
			resolve();
		});

		proc.on('error', err => {
			const duration = Date.now() - startTime;
			results.push({
				name: suite.name,
				type: suite.type,
				passed: false,
				duration,
				error: err.message,
			});
			errorLog.push({
				suite: suite.name,
				error: err.message,
				duration,
			});
			resolve();
		});
	});
}

/**
 * Write errors to file
 */
function writeErrorLog() {
	const logPath = path.join(process.cwd(), 'test-errors.log');
	const timestamp = new Date().toISOString();

	let logContent = `# Test Errors Report\n`;
	logContent += `Generated: ${timestamp}\n`;
	logContent += `${'='.repeat(80)}\n\n`;

	errorLog.forEach(error => {
		logContent += `## ${error.suite}\n`;
		logContent += `Exit Code: ${error.exitCode || 'N/A'}\n`;
		logContent += `Duration: ${(error.duration / 1000).toFixed(1)}s\n\n`;

		if (error.error) {
			logContent += `### Error:\n${error.error}\n\n`;
		}

		if (error.stderr) {
			logContent += `### STDERR:\n${error.stderr}\n\n`;
		}

		if (error.stdout) {
			logContent += `### STDOUT:\n${error.stdout}\n\n`;
		}

		logContent += `${'-'.repeat(80)}\n\n`;
	});

	fs.writeFileSync(logPath, logContent, 'utf8');
	return logPath;
}

/**
 * Display minimal summary
 */
function displaySummary() {
	const totalPassed = results.filter(r => r.passed).length;
	const totalFailed = results.filter(r => !r.passed).length;
	const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

	if (totalFailed === 0) {
		// Success: minimal output
		console.log(chalk.bold.green('✓ All tests passed'));
		console.log(chalk.gray(`  ${results.length} suites, ${(totalDuration / 1000).toFixed(1)}s`));
		return 0;
	} else {
		// Failure: write to file and show summary
		const logPath = writeErrorLog();

		console.log(chalk.bold.red('✗ Tests failed'));
		console.log(
			chalk.gray(`  ${totalPassed} passed, ${totalFailed} failed, ${(totalDuration / 1000).toFixed(1)}s`)
		);
		console.log(chalk.yellow(`  Error log: ${logPath}`));

		// Show which suites failed
		console.log(chalk.bold('\nFailed suites:'));
		results
			.filter(r => !r.passed)
			.forEach(result => {
				console.log(chalk.red(`  - ${result.name}`));
			});

		return 1;
	}
}

/**
 * Main execution
 */
async function main() {
	// Register cleanup handlers FIRST
	registerCleanupHandlers(chalk);

	// Parse CLI arguments
	const filters = parseArgs();

	// Filter suites based on arguments
	const suitesToRun = filterSuites(testSuites, filters);

	// Check if any suites match
	if (suitesToRun.length === 0) {
		console.log(chalk.yellow('No test suites match the specified filters.'));
		console.log(chalk.gray('Available filters: --suite, --type, --exclude, --grep'));
		await cleanupAllProcesses(chalk);
		process.exit(1);
	}

	// Display what we're running
	if (suitesToRun.length < testSuites.length) {
		console.log(chalk.blue(`Running ${suitesToRun.length} of ${testSuites.length} test suites...\n`));
	} else {
		console.log(chalk.blue('Running tests...\n'));
	}

	// Run filtered test suites sequentially
	for (const suite of suitesToRun) {
		process.stdout.write(chalk.gray(`  ${suite.name}... `));
		await runTestSuite(suite, filters);
		const result = results[results.length - 1];
		if (result.passed) {
			console.log(chalk.green('✓'));
		} else {
			console.log(chalk.red('✗'));
		}
	}

	console.log('');

	// Display summary and exit with appropriate code
	const exitCode = displaySummary();
	await cleanupAllProcesses(chalk);
	process.exit(exitCode);
}

// Run
main().catch(async err => {
	console.error(chalk.red('Fatal error:'), err);
	await cleanupAllProcesses(chalk);
	process.exit(1);
});
