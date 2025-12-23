#!/usr/bin/env node

/**
 * LLM Agent-Friendly TypeScript Checker
 *
 * Features:
 * - Minimal console output on success
 * - Errors logged to file (ts-errors.log) on failure
 * - Clean summary format for agent parsing
 * - Checks all packages in monorepo: shared, backend, frontend
 */
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

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

const ERROR_LOG = 'ts-errors.log';
const PACKAGES = [
	'shared-frontend-backend',
	'shared-orch-backend',
	'shared-orch-worker',
	'shared-common',
	'web-backend',
	'web-frontend',
	'flow-engine',
	'orchestrator',
	'worker',
	'cli',
];

/**
 * Run TypeScript check for a package with a specific config
 */
function checkPackageWithConfig(packageName, config = 'tsconfig.json') {
	return new Promise((resolve, reject) => {
		const packagePath = path.join(process.cwd(), 'packages', packageName);

		// Check if package directory exists
		if (!fs.existsSync(packagePath)) {
			resolve({ package: packageName, config, skipped: true, errors: [] });
			return;
		}

		// Check if config file exists
		const configPath = path.join(packagePath, config);
		if (!fs.existsSync(configPath)) {
			resolve({ package: packageName, config, skipped: true, errors: [] });
			return;
		}

		const command = `npx tsc --noEmit --project ${config}`;
		const tsc = spawn(command, {
			cwd: packagePath,
			shell: true,
			stdio: ['ignore', 'pipe', 'pipe'],
		});

		let stdout = '';
		let stderr = '';

		tsc.stdout.on('data', data => {
			stdout += data.toString();
		});

		tsc.stderr.on('data', data => {
			stderr += data.toString();
		});

		tsc.on('close', code => {
			const output = stdout + stderr;
			const hasErrors = output.includes('error TS');

			if (hasErrors) {
				resolve({
					package: packageName,
					config,
					skipped: false,
					errors: output.split('\n').filter(line => line.trim()),
				});
			} else {
				resolve({
					package: packageName,
					config,
					skipped: false,
					errors: [],
				});
			}
		});

		tsc.on('error', err => {
			reject(new Error(`Failed to run TypeScript check for ${packageName} with ${config}: ${err.message}`));
		});
	});
}

/**
 * Run TypeScript check for a package (both main and test configs)
 */
async function checkPackage(packageName) {
	const results = await Promise.all([
		checkPackageWithConfig(packageName, 'tsconfig.json'),
		checkPackageWithConfig(packageName, 'tsconfig.test.json'),
	]);

	// Combine errors from both configs
	const allErrors = results.flatMap(r => r.errors);
	const allSkipped = results.every(r => r.skipped);

	return {
		package: packageName,
		skipped: allSkipped,
		errors: allErrors,
	};
}

/**
 * Main execution
 */
async function main() {
	// console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
	console.log(chalk.blue('🖥️ Checking TypeScript...'));
	// console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));

	// Clear previous error log
	if (fs.existsSync(ERROR_LOG)) {
		fs.unlinkSync(ERROR_LOG);
	}

	// Check all packages in parallel
	console.log(chalk.gray(`Checking ${PACKAGES.join(', ')}...`));
	const results = await Promise.all(
		PACKAGES.map(async pkg => {
			try {
				return await checkPackage(pkg);
			} catch (err) {
				console.error(chalk.red(`Error checking ${pkg}: ${err.message}`));
				return { package: pkg, skipped: false, errors: [err.message] };
			}
		})
	);

	// Analyze results
	const packagesWithErrors = results.filter(r => !r.skipped && r.errors.length > 0);
	const totalErrors = packagesWithErrors.reduce((sum, r) => sum + r.errors.length, 0);

	if (packagesWithErrors.length === 0) {
		// SUCCESS
		// console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
		console.log(chalk.bold.green('✅ All TypeScript checks passed!'));
		// console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
		process.exit(0);
	} else {
		// FAILURE - Write errors to log
		const logContent = [];
		logContent.push('TypeScript Errors Report');
		logContent.push('═'.repeat(80));
		logContent.push('');

		for (const result of packagesWithErrors) {
			logContent.push(`Package: ${result.package}`);
			logContent.push('─'.repeat(80));
			logContent.push(...result.errors);
			logContent.push('');
		}

		fs.writeFileSync(ERROR_LOG, logContent.join('\n'), 'utf8');

		// Print summary
		console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
		console.log(chalk.bold.red(`❌ TypeScript errors found in ${packagesWithErrors.length} package(s)`));
		console.log(chalk.yellow(`📝 Total errors: ${totalErrors}`));
		console.log(chalk.yellow(`📄 See ${ERROR_LOG} for details`));
		console.log(chalk.blue('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
		process.exit(1);
	}
}

// Run
main().catch(err => {
	console.error(chalk.bold.red('Fatal error:'), err);
	process.exit(1);
});
