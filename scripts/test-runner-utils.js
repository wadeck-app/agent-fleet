/**
 * Shared utilities for test runners (test-agent.js and test-all.js)
 *
 * Provides process lifecycle management to prevent orphaned Node.js processes
 * after test execution.
 */
// Track all spawned processes for cleanup
// Windows: Use taskkill with /T (tree) and /F (force)
// /T kills the entire process tree (npm → node → backend)
import { exec } from 'node:child_process';
import fs from 'node:fs';
import { globSync } from 'glob';
import path from 'node:path';

const spawnedProcesses = new Set();
let isShuttingDown = false;

/**
 * Kill a process tree (parent + all children)
 * Works cross-platform (Windows: taskkill /T /F, Unix: process groups)
 */
function killProcessTree(proc) {
	if (!proc || !proc.pid) {
		return Promise.resolve();
	}

	return new Promise(resolve => {
		const pid = proc.pid;

		try {
			if (process.platform === 'win32') {
				exec(`taskkill /PID ${pid} /T /F`, error => {
					// Ignore errors (process might already be dead)
					resolve();
				});
			} else {
				// Unix: Kill process group (negative PID)
				// When spawning with shell:true, Node creates a process group
				try {
					process.kill(-pid, 'SIGKILL');
				} catch (err) {
					// Process might already be dead
				}
				resolve();
			}
		} catch (err) {
			// Always resolve - we want cleanup to continue even if one process fails
			resolve();
		}
	});
}

/**
 * Cleanup orphaned backend servers by reading .test-servers-*.json files
 * This is a fallback in case Playwright's globalTeardownWebserver fails
 */
async function cleanupOrphanedBackendServers() {
	try {
		// Find all .test-servers-*.json files
		const serverFiles = globSync('.test-servers-*.json', { cwd: process.cwd() });

		if (serverFiles.length === 0) {
			return;
		}

		// Silently cleanup without logging unless there are issues
		for (const file of serverFiles) {
			try {
				const filePath = path.join(process.cwd(), file);
				const data = fs.readFileSync(filePath, 'utf-8');
				const servers = JSON.parse(data);

				for (const server of servers) {
					try {
						// Check if process is still running
						if (process.platform === 'win32') {
							const { exec } = require('node:child_process');
							exec(`taskkill /PID ${server.pid} /T /F`, () => {
								// Ignore errors - process might already be dead
							});
						} else {
							try {
								process.kill(server.pid, 'SIGKILL');
							} catch (err) {
								// Process already dead
							}
						}
					} catch (err) {
						// Ignore individual server errors
					}
				}

				// Delete the server file after killing processes
				try {
					fs.unlinkSync(filePath);
				} catch (err) {
					// Ignore cleanup errors
				}
			} catch (err) {
				// Ignore individual file errors
			}
		}
	} catch (err) {
		// Ignore glob errors - glob package might not be available
	}
}

/**
 * Cleanup all spawned processes
 * Called on exit, SIGINT, SIGTERM, or errors
 *
 * @param {Object} chalk - chalk instance for colored output (optional)
 */
async function cleanupAllProcesses(chalk) {
	if (isShuttingDown) {
		return; // Prevent duplicate cleanup
	}
	isShuttingDown = true;

	const hasSpawnedProcesses = spawnedProcesses.size > 0;

	if (hasSpawnedProcesses) {
		const message = `\nCleaning up ${spawnedProcesses.size} spawned process(es)...`;
		if (chalk && chalk.yellow) {
			console.log(chalk.yellow(message));
		} else {
			console.log(message);
		}

		// Kill all processes in parallel
		const killPromises = Array.from(spawnedProcesses).map(proc => killProcessTree(proc));

		// Clear the set now that we've captured the processes to kill
		spawnedProcesses.clear();

		// Wait for all kills to complete (with timeout)
		await Promise.race([
			Promise.all(killPromises),
			new Promise(resolve => setTimeout(resolve, 5000)), // 5s timeout
		]);
	}

	// Also cleanup orphaned backend servers from E2E tests
	// These might be left behind if Playwright's globalTeardownWebserver failed
	await cleanupOrphanedBackendServers();

	// Give OS time to release ports
	await new Promise(resolve => setTimeout(resolve, 1000));

	if (hasSpawnedProcesses) {
		const message = '✓ Cleanup complete';
		if (chalk && chalk.green) {
			console.log(chalk.green(message));
		} else {
			console.log(message);
		}
	}
}

/**
 * Register signal handlers for graceful shutdown
 * Must be called early in main()
 *
 * @param {Object} chalk - chalk instance for colored output (optional)
 */
function registerCleanupHandlers(chalk) {
	// Handle Ctrl+C (SIGINT)
	process.on('SIGINT', async () => {
		const message = '\n\nReceived SIGINT (Ctrl+C), cleaning up...';
		if (chalk && chalk.yellow) {
			console.log(chalk.yellow(message));
		} else {
			console.log(message);
		}
		await cleanupAllProcesses(chalk);
		process.exit(130); // Standard exit code for SIGINT
	});

	// Handle SIGTERM (kill command)
	process.on('SIGTERM', async () => {
		const message = '\nReceived SIGTERM, cleaning up...';
		if (chalk && chalk.yellow) {
			console.log(chalk.yellow(message));
		} else {
			console.log(message);
		}
		await cleanupAllProcesses(chalk);
		process.exit(143); // Standard exit code for SIGTERM
	});

	// Handle abnormal exits (crashes, uncaught exceptions)
	process.on('exit', code => {
		// Note: exit event is synchronous, can't use await
		// But cleanupAllProcesses will be called by other handlers first
		if (spawnedProcesses.size > 0 && !isShuttingDown) {
			const message1 = `\n⚠️  Abnormal exit (code ${code}) with ${spawnedProcesses.size} processes still running`;
			const message2 = '   Run the test command again or manually kill orphaned processes';
			if (chalk && chalk.red) {
				console.error(chalk.red(message1));
				console.error(chalk.red(message2));
			} else {
				console.error(message1);
				console.error(message2);
			}
		}
	});

	// Handle uncaught exceptions
	process.on('uncaughtException', async err => {
		const message = '\n❌ Uncaught exception:';
		if (chalk && chalk.red) {
			console.error(chalk.red(message), err);
		} else {
			console.error(message, err);
		}
		await cleanupAllProcesses(chalk);
		process.exit(1);
	});

	// Handle unhandled promise rejections
	process.on('unhandledRejection', async reason => {
		const message = '\n❌ Unhandled rejection:';
		if (chalk && chalk.red) {
			console.error(chalk.red(message), reason);
		} else {
			console.error(message, reason);
		}
		await cleanupAllProcesses(chalk);
		process.exit(1);
	});
}

/**
 * Track a spawned process for cleanup
 * Call this immediately after spawning a process
 *
 * @param {ChildProcess} proc - The process to track
 */
function trackProcess(proc) {
	if (proc && proc.pid) {
		spawnedProcesses.add(proc);
	}
}

/**
 * Get the count of tracked processes
 * Useful for debugging
 *
 * @returns {number} Number of tracked processes
 */
function getTrackedProcessCount() {
	return spawnedProcesses.size;
}

export {
	killProcessTree,
	cleanupAllProcesses,
	cleanupOrphanedBackendServers,
	registerCleanupHandlers,
	trackProcess,
	getTrackedProcessCount,
	// Export for direct access if needed
	spawnedProcesses,
};
