#!/usr/bin/env node
/**
 * Starts Storybook with automatic port retry on conflicts
 * Uses try-fail-retry to avoid TOCTOU race conditions
 */
const { spawn, exec } = require('child_process');
const { writeFileSync } = require('fs');
const path = require('path');
const net = require('net');
const { performance } = require('perf_hooks');
const { mkdirSync } = require('node:fs');
const { promisify } = require('util');

const execAsync = promisify(exec);

const MAX_RETRIES = 100;
const workspaceId = parseInt(process.env.WORKSPACE_ID || '0', 10);
const basePort = 6100 + workspaceId * 1000;

const projectRoot = path.resolve(__dirname, '../../..');
const staticDir = path.resolve(projectRoot, 'packages/e2e-web/temp/storybook-static');
const tempFolder = path.resolve(projectRoot, 'packages/e2e-web/temp');

/**
 * Kill a process and all its children (process tree)
 * CRITICAL: spawn('npm run ...', {shell: true}) creates parent npm + child processes
 * proc.kill() only kills npm, leaving children as zombies!
 */
async function killProcessTree(proc) {
	if (!proc.pid) {
		return;
	}

	try {
		if (process.platform === 'win32') {
			// Windows: Use /T (tree) flag to kill all child processes
			await execAsync(`taskkill /PID ${proc.pid} /T /F`);
		} else {
			// Unix: Kill process group (negative PID)
			try {
				process.kill(-proc.pid, 'SIGKILL');
			} catch {
				// Process might already be dead
			}
		}
	} catch (error) {
		// Process might already be dead, that's okay
	}
}

/**
 * Checks if a port is available by attempting to bind to it
 * Fast check with 2-second timeout
 * @param {number} port Port number to check
 * @returns {Promise<boolean>} Promise that resolves to true if port is free
 */
function isPortAvailable(port) {
	return new Promise(resolve => {
		const server = net.createServer();

		// Timeout after 2 seconds (should be instant)
		const timeout = setTimeout(() => {
			server.close();
			resolve(false);
		}, 2000);

		server.once('error', err => {
			clearTimeout(timeout);
			if (err.code === 'EADDRINUSE') {
				resolve(false);
			} else {
				resolve(false);
			}
		});

		server.once('listening', () => {
			clearTimeout(timeout);
			server.close();
			resolve(true);
		});

		server.listen(port);
	});
}

/**
 * Finds the first available port starting from basePort
 * @param {number} startPort Starting port number
 * @param {number} maxAttempts Maximum number of ports to check
 * @returns {Promise<number|null>} First available port or null if none found
 */
async function findFreePort(startPort, maxAttempts = 100) {
	for (let i = 0; i < maxAttempts; i++) {
		const port = startPort + i;
		const available = await isPortAvailable(port);
		if (available) {
			return port;
		}
	}
	return null;
}

/**
 * Attempts to start Storybook on given port
 * Returns promise that resolves if successful, rejects if port conflict detected
 */
function tryStartStorybook(port) {
	return new Promise((resolvePromise, rejectPromise) => {
		console.log(`🚀 Attempting to start Storybook on port ${port}...`);

		// Serve pre-built static Storybook: starts in <1s, no compilation, no interactive prompt
		// Static dir built once in main() via storybook:build-e2e before this function is called
		// On Windows, use shell to resolve npx from PATH
		const isWindows = process.platform === 'win32';

		const command = `npx serve "${staticDir}" -l ${port} --single --no-clipboard`;
		const storybookProcess = spawn(command, {
			// Run from project root
			cwd: projectRoot,
			env: {
				...process.env,
				// Ensure port is used
				STORYBOOK_E2E_PORT: port.toString(),
			},
			// Capture stdout/stderr to detect errors
			stdio: ['inherit', 'pipe', 'pipe'],
			// Use shell on Windows to resolve npm
			shell: isWindows,
		});

		let output = '';
		let startupComplete = false;
		let hasError = false;

		// Monitor stdout for success/failure indicators
		if (storybookProcess.stdout) {
			storybookProcess.stdout.on('data', data => {
				const text = data.toString();
				output += text;

				// Forward to console for visibility
				process.stdout.write(text);

				// Port conflict: Storybook shows interactive prompt instead of exiting
				if (text.includes('Would you like to run Storybook on port') && !startupComplete) {
					console.log(
						`⚠️  Port ${port} is already in use (detected interactive prompt), will retry with next port...`
					);
					hasError = true;
					killProcessTree(storybookProcess);
					rejectPromise(new Error('PORT_IN_USE'));
				}

				// Success indicators (serve ready): "Local:" (box format) or "Accepting connections" (info format)
				if (
					(text.includes('Local:') ||
						text.includes('On your network') ||
						text.includes('Accepting connections')) &&
					!startupComplete
				) {
					startupComplete = true;

					// Extract actual port from Storybook output
					// Format: "- Local:             http://localhost:6100/"
					const portMatch = text.match(/localhost:(\d+)/);
					const actualPort = portMatch ? parseInt(portMatch[1], 10) : port;

					console.log(`✅ Storybook successfully started on port ${actualPort}`);

					// Write actual port to file for tests
					// Use RUN_ID to avoid conflicts between parallel runs
					const runId = process.env.RUN_ID || 'default';
					const filename = path.resolve(tempFolder, `.storybook-port-${runId}.json`);
					mkdirSync(tempFolder, { recursive: true });
					writeFileSync(filename, JSON.stringify({ port: actualPort }));

					const storybookUrl = `http://localhost:${actualPort}`;
					console.log(`📋 Written Storybook URL to ${filename}: ${storybookUrl}`);
					console.log(`🎯 Playwright will use: ${storybookUrl} (RUN_ID: ${runId})`);
					// IMPORTANT: This message is monitored by Playwright (see playwright.config.storybook.ts wait.stdout)
					console.log(`Storybook ready! URL: ${storybookUrl}`);

					resolvePromise({ storybookProcess, port: actualPort });
				}
			});
		}

		// Monitor stderr for port conflict errors
		if (storybookProcess.stderr) {
			storybookProcess.stderr.on('data', data => {
				const text = data.toString();
				output += text;

				// Forward to console
				process.stderr.write(text);

				// Port conflict indicators (check multiple patterns)
				if (
					text.includes('EADDRINUSE') ||
					text.includes('address already in use') ||
					text.includes('port is already in use') ||
					(text.includes('Port') && text.includes('is already in use')) || // Vite error
					(text.includes('Port') && text.includes('is in use')) // Alternative Vite error
				) {
					console.log(
						`⚠️  Port ${port} is already in use (detected in stderr), will retry with next port...`
					);
					hasError = true;
					killProcessTree(storybookProcess);
					rejectPromise(new Error('PORT_IN_USE'));
				}
			});
		}

		// Handle process exit during startup (failure)
		storybookProcess.on('exit', code => {
			if (!startupComplete && !hasError) {
				// Startup failed - check if it's a port conflict
				if (
					output.includes('EADDRINUSE') ||
					output.includes('address already in use') ||
					(output.includes('Port') && output.includes('is already in use')) ||
					(output.includes('Port') && output.includes('is in use'))
				) {
					rejectPromise(new Error('PORT_IN_USE'));
				} else {
					rejectPromise(new Error(`Storybook exited with code ${code} during startup`));
				}
			}
			// If startupComplete is true, this is intentional exit (Playwright killed it)
		});

		// Safety net for genuine crashes — static server starts in <1s, 5s covers slow machines
		setTimeout(() => {
			if (!startupComplete && !hasError) {
				killProcessTree(storybookProcess);
				rejectPromise(new Error('Storybook startup timeout'));
			}
		}, 5000);
	});
}

/**
 * Main retry loop
 */
async function main() {
	const startTime = performance.now();
	console.log(`🔍 Starting Storybook with port retry (base port: ${basePort})`);

	// Build Storybook once before spawning the server (avoids compilation on each retry)
	console.log('🔨 Building Storybook for E2E (once, ~17s)...');
	const buildStart = performance.now();
	await execAsync('npm run storybook:build-e2e --workspace=web-frontend', { cwd: projectRoot });
	console.log(`✅ Storybook built in ${((performance.now() - buildStart) / 1000).toFixed(1)}s`);

	// Find first available port to use as starting point
	console.log(`🔎 Checking for available ports starting from ${basePort}...`);
	const startPort = await findFreePort(basePort, MAX_RETRIES);

	if (!startPort) {
		console.error(`❌ No available ports found in range ${basePort}-${basePort + MAX_RETRIES - 1}`);
		process.exit(1);
	}

	const duration = performance.now() - startTime;
	console.log(`✓ Found available port: ${startPort} in ${duration.toFixed(2)}ms`);

	// Try to start Storybook on the found port
	// If it fails due to race condition (another process grabbed it), retry with next ports
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		const port = startPort + attempt;

		try {
			const { storybookProcess } = await tryStartStorybook(port);

			// Success! Keep process running (Playwright will manage it)
			// Forward signals to Storybook process
			process.on('SIGTERM', () => {
				console.log('\n🛑 Received SIGTERM, stopping Storybook...');
				storybookProcess.kill('SIGTERM');
			});
			process.on('SIGINT', () => {
				console.log('\n🛑 Received SIGINT, stopping Storybook...');
				storybookProcess.kill('SIGINT');
			});

			// Wait for Storybook to exit
			storybookProcess.on('exit', code => {
				console.log(`Storybook exited with code ${code}`);
				process.exit(code || 0);
			});

			return; // Success - keep running

			// await new Promise(resolve => {
			// 	console.warn("setTimeout1")
			// 	setTimeout(() => {
			// 		console.warn("setTimeout2")
			// 		resolve();
			// 	}, 2000);
			// });
		} catch (error) {
			if (error.message === 'PORT_IN_USE') {
				// Expected failure - retry with next port
				if (attempt < MAX_RETRIES - 1) {
					console.log(`Retrying with port ${startPort + attempt + 1}...`);
					continue;
				} else {
					console.error(
						`❌ Exhausted all ${MAX_RETRIES} port attempts (${startPort}-${startPort + MAX_RETRIES - 1})`
					);
					process.exit(1);
				}
			} else {
				// Unexpected error
				console.error(`❌ Failed to start Storybook: ${error.message}`);
				console.error(error);
				process.exit(1);
			}
		}
	}
}

main();
