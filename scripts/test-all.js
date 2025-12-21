#!/usr/bin/env node

/**
 * Unified Test Runner with Summary Report
 *
 * Runs all test types (unit + E2E) and displays a clean summary
 */
import chalk from 'chalk';
import { spawn } from 'child_process';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

import { testSuiteType_E2E_FUNC, testSuiteType_UNIT, testSuiteType_VISUAL, testSuites } from './test-config.js';
import { cleanupAllProcesses, registerCleanupHandlers, trackProcess } from './test-runner-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Results storage
const results = [];

/**
 * Parse test results from output
 * Supports both Jest and Playwright formats
 */
function parseTestResults(output) {
	const stats = {
		passed: 0,
		failed: 0,
		skipped: 0,
		total: 0,
		compilationErrors: 0,
		hasCompilationError: false,
	};

	// Strip ANSI color codes to avoid regex matching issues
	// ANSI codes like [32m can interfere with number matching
	const cleanOutput = output.replace(/\x1b\[[0-9;]*m/g, '');

	// Check for TypeScript compilation errors
	const tsErrorPattern = /error TS\d+:/g;
	const tsErrors = output.match(tsErrorPattern);
	if (tsErrors) {
		stats.hasCompilationError = true;
		stats.compilationErrors = tsErrors.length;
	}

	// Check for Jest test suite failures (files that failed to run)
	const failedSuitesMatch = output.match(/Test Suites:.*?(\d+)\s+failed/i);
	if (failedSuitesMatch && stats.hasCompilationError) {
		// Count failed test suites as compilation errors when TS errors are present
		stats.compilationErrors = Math.max(stats.compilationErrors, parseInt(failedSuitesMatch[1], 10));
	}

	// Jest format: "Tests: X failed, Y passed, Z total"
	const jestMatch = cleanOutput.match(/Tests:\s+(?:(\d+)\s+failed,\s*)?(\d+)\s+passed(?:,\s*(\d+)\s+total)?/i);
	if (jestMatch) {
		stats.failed = parseInt(jestMatch[1] || '0', 10);
		stats.passed = parseInt(jestMatch[2] || '0', 10);
		stats.total = parseInt(jestMatch[3] || stats.passed + stats.failed, 10);
		return stats;
	}

	// Playwright/Vitest format: "X passed" "Y failed" "Z skipped"
	// Match ALL occurrences and take the LAST one (test summary is at the end)
	// Require at least 2 spaces or start of line before number to avoid matching "Step 2 failed"
	const playwrightPassedMatches = [...cleanOutput.matchAll(/(?:^|\s{2,})(\d+)\s+passed\b/gim)];
	const playwrightFailedMatches = [...cleanOutput.matchAll(/(?:^|\s{2,})(\d+)\s+failed\b/gim)];
	const playwrightSkippedMatches = [...cleanOutput.matchAll(/(?:^|\s{2,})(\d+)\s+skipped\b/gim)];

	const playwrightPassedMatch = playwrightPassedMatches[playwrightPassedMatches.length - 1];
	const playwrightFailedMatch = playwrightFailedMatches[playwrightFailedMatches.length - 1];
	const playwrightSkippedMatch = playwrightSkippedMatches[playwrightSkippedMatches.length - 1];

	if (playwrightPassedMatch || playwrightFailedMatch || playwrightSkippedMatch) {
		stats.passed = playwrightPassedMatch ? parseInt(playwrightPassedMatch[1], 10) : 0;
		stats.failed = playwrightFailedMatch ? parseInt(playwrightFailedMatch[1], 10) : 0;
		stats.skipped = playwrightSkippedMatch ? parseInt(playwrightSkippedMatch[1], 10) : 0;
		stats.total = stats.passed + stats.failed + stats.skipped;
		return stats;
	}

	// Alternative Jest format in summary
	const jestSummaryMatch = cleanOutput.match(/(\d+)\s+passed,\s+(\d+)\s+total/i);
	if (jestSummaryMatch) {
		stats.passed = parseInt(jestSummaryMatch[1], 10);
		stats.total = parseInt(jestSummaryMatch[2], 10);
		stats.failed = stats.total - stats.passed;
		return stats;
	}

	return stats;
}

/**
 * Run a single test suite
 */
function runTestSuite(suite) {
	return new Promise(resolve => {
		console.log(chalk.blue(`\n▶ Running: ${suite.name}...`));
		console.log(chalk.gray('─'.repeat(120)));

		const startTime = Date.now();
		let output = '';

		// Build command string with proper spacing
		const command = suite.command + suite.args.map(arg => ` ${arg}`).join('');

		const proc = spawn(command, {
			stdio: ['inherit', 'pipe', 'pipe'],
			shell: true,
			cwd: process.cwd(),
			env: {
				...process.env,
				...(suite.env || {}),
			},
		});

		// Track this process for cleanup
		trackProcess(proc);

		// Capture stdout and stderr while also displaying them
		proc.stdout.on('data', data => {
			const str = data.toString();
			process.stdout.write(str);
			output += str;
		});

		proc.stderr.on('data', data => {
			const str = data.toString();
			process.stderr.write(str);
			output += str;
		});

		proc.on('close', code => {
			const duration = Date.now() - startTime;
			const testStats = parseTestResults(output);

			// Suite passes only if:
			// 1. Exit code is 0 AND
			// 2. No tests failed AND
			// 3. No compilation errors
			// This provides defense-in-depth against regex false positives
			const passed = code === 0 && testStats.failed === 0 && !testStats.hasCompilationError;

			results.push({
				name: suite.name,
				type: suite.type,
				passed,
				duration,
				exitCode: code,
				testsPassed: testStats.passed,
				testsFailed: testStats.failed,
				testsSkipped: testStats.skipped,
				testsTotal: testStats.total,
				compilationErrors: testStats.compilationErrors,
				hasCompilationError: testStats.hasCompilationError,
				command: suite.command,
				args: suite.args,
			});

			if (passed) {
				console.log(chalk.green(`✓ ${suite.name} passed (${(duration / 1000).toFixed(1)}s)`));
			} else {
				console.log(chalk.red(`✗ ${suite.name} failed (exit code: ${code})`));
			}

			resolve();
		});

		proc.on('error', err => {
			console.error(chalk.red(`Error running ${suite.name}:`), err);
			results.push({
				name: suite.name,
				type: suite.type,
				passed: false,
				duration: Date.now() - startTime,
				error: err.message,
				testsPassed: 0,
				testsFailed: 0,
				testsSkipped: 0,
				testsTotal: 0,
			});
			resolve();
		});
	});
}

/**
 * Display final summary report
 */
function displaySummary() {
	console.log('\n\n');
	console.log(chalk.bold.cyan('═'.repeat(120)));
	console.log(chalk.bold.cyan('  TEST SUMMARY REPORT'));
	console.log(chalk.bold.cyan('═'.repeat(120)));

	// Group by type
	const unitTests = results.filter(r => r.type === testSuiteType_UNIT);
	const functionalE2eTests = results.filter(r => r.type === testSuiteType_E2E_FUNC);
	const visualTests = results.filter(r => r.type === testSuiteType_VISUAL);

	// Display unit tests
	console.log(chalk.bold('\n📦 Unit Tests:'));
	unitTests.forEach(result => {
		const icon = result.passed ? chalk.green('✓') : chalk.red('✗');
		const duration = chalk.gray(`(${(result.duration / 1000).toFixed(1)}s)`);
		let testInfo = '';

		if (result.testsTotal > 0 || result.hasCompilationError) {
			// Build unified format: "X passed[, Y failed][, Z skipped][, W compilation errors]"
			const parts = [];

			// Always show passed count if any tests ran
			if (result.testsPassed > 0) {
				parts.push(chalk.green(`${result.testsPassed} passed`));
			}

			// Show failed count if any
			if (result.testsFailed > 0) {
				parts.push(chalk.red(`${result.testsFailed} failed`));
			}

			// Show skipped count if any
			if (result.testsSkipped > 0) {
				parts.push(chalk.yellow(`${result.testsSkipped} skipped`));
			}

			// Show compilation errors if any
			if (result.hasCompilationError && result.compilationErrors > 0) {
				parts.push(
					chalk.red(
						`${result.compilationErrors} compilation error${result.compilationErrors !== 1 ? 's' : ''}`
					)
				);
			}

			testInfo = ` - ${parts.join(', ')}`;
		} else if (!result.passed) {
			testInfo = chalk.red(' - failed to run');
		}

		console.log(`  ${icon} ${result.name} ${duration}${testInfo}`);

		// Add command hint for failed tests
		if (!result.passed && result.command && result.args) {
			const runCommand = `${result.command} ${result.args.join(' ')}`;
			console.log(chalk.gray(`     → Run alone: ${runCommand}`));
		}
	});

	// Display E2E Functional tests
	console.log(chalk.bold('\n🧪 E2E Functional Tests:'));
	functionalE2eTests.forEach(result => {
		const icon = result.passed ? chalk.green('✓') : chalk.red('✗');
		const duration = chalk.gray(`(${(result.duration / 1000).toFixed(1)}s)`);
		let testInfo = '';

		if (result.testsTotal > 0 || result.hasCompilationError) {
			// Build unified format: "X passed[, Y failed][, Z skipped][, W compilation errors]"
			const parts = [];

			// Always show passed count if any tests ran
			if (result.testsPassed > 0) {
				parts.push(chalk.green(`${result.testsPassed} passed`));
			}

			// Show failed count if any
			if (result.testsFailed > 0) {
				parts.push(chalk.red(`${result.testsFailed} failed`));
			}

			// Show skipped count if any
			if (result.testsSkipped > 0) {
				parts.push(chalk.yellow(`${result.testsSkipped} skipped`));
			}

			// Show compilation errors if any
			if (result.hasCompilationError && result.compilationErrors > 0) {
				parts.push(
					chalk.red(
						`${result.compilationErrors} compilation error${result.compilationErrors !== 1 ? 's' : ''}`
					)
				);
			}

			testInfo = ` - ${parts.join(', ')}`;
		} else if (!result.passed) {
			testInfo = chalk.red(' - failed to run');
		}

		console.log(`  ${icon} ${result.name} ${duration}${testInfo}`);

		// Add command hint for failed tests
		if (!result.passed && result.command && result.args) {
			const runCommand = `${result.command} ${result.args.join(' ')}`;
			console.log(chalk.gray(`     → Run alone: ${runCommand}`));
		}
	});

	// Display Visual Regression tests
	console.log(chalk.bold('\n📸 Visual Regression Tests:'));
	visualTests.forEach(result => {
		const icon = result.passed ? chalk.green('✓') : chalk.red('✗');
		const duration = chalk.gray(`(${(result.duration / 1000).toFixed(1)}s)`);
		let testInfo = '';

		if (result.testsTotal > 0 || result.hasCompilationError) {
			// Build unified format: "X passed[, Y failed][, Z skipped][, W compilation errors]"
			const parts = [];

			// Always show passed count if any tests ran
			if (result.testsPassed > 0) {
				parts.push(chalk.green(`${result.testsPassed} passed`));
			}

			// Show failed count if any
			if (result.testsFailed > 0) {
				parts.push(chalk.red(`${result.testsFailed} failed`));
			}

			// Show skipped count if any
			if (result.testsSkipped > 0) {
				parts.push(chalk.yellow(`${result.testsSkipped} skipped`));
			}

			// Show compilation errors if any
			if (result.hasCompilationError && result.compilationErrors > 0) {
				parts.push(
					chalk.red(
						`${result.compilationErrors} compilation error${result.compilationErrors !== 1 ? 's' : ''}`
					)
				);
			}

			testInfo = ` - ${parts.join(', ')}`;
		} else if (!result.passed) {
			testInfo = chalk.red(' - failed to run');
		}

		console.log(`  ${icon} ${result.name} ${duration}${testInfo}`);

		// Add command hint for failed tests
		if (!result.passed && result.command && result.args) {
			const runCommand = `${result.command} ${result.args.join(' ')}`;
			console.log(chalk.gray(`     → Run alone: ${runCommand}`));
		}
	});

	// Overall stats
	const totalPassed = results.filter(r => r.passed).length;
	const totalFailed = results.filter(r => !r.passed).length;
	const totalDuration = results.reduce((sum, r) => sum + r.duration, 0);

	console.log(chalk.bold('\n📊 Overall:'));
	console.log(`  Total Suites: ${results.length}`);
	console.log(`  ${chalk.green('Passed:')} ${totalPassed}`);
	console.log(`  ${chalk.red('Failed:')} ${totalFailed}`);
	console.log(`  ${chalk.gray('Total Time:')} ${(totalDuration / 1000).toFixed(1)}s`);

	console.log(chalk.bold.cyan('═'.repeat(120)));

	// Final status
	if (totalFailed === 0) {
		console.log(chalk.bold.green('\n✓ All tests passed!\n'));
		return 0;
	} else {
		console.log(chalk.bold.red(`\n✗ ${totalFailed} test suite(s) failed\n`));
		return 1;
	}
}

/**
 * Main execution
 */
async function main() {
	// Register cleanup handlers FIRST
	registerCleanupHandlers(chalk);

	console.log(chalk.bold.cyan('Starting comprehensive test suite...\n'));

	// Run all test suites sequentially
	for (const suite of testSuites) {
		await runTestSuite(suite);
	}

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
