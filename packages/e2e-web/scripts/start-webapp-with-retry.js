#!/usr/bin/env node
/**
 * Starts webapp frontend with automatic port retry on conflicts
 * Uses try-fail-retry to avoid TOCTOU race conditions
 */
const { spawn, exec } = require('node:child_process');
const { writeFileSync } = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { performance } = require('node:perf_hooks');
const { mkdirSync } = require('node:fs');
const { promisify } = require('node:util');

const execAsync = promisify(exec);

const MAX_RETRIES = 100;
const workspaceId = parseInt(process.env.WORKSPACE_ID || '0', 10);
const basePort = 5050 + workspaceId * 100;

const projectRoot = path.resolve(__dirname, '../../..');
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
 * Attempts to start webapp frontend on given port
 * Returns promise that resolves if successful, rejects if port conflict detected
 */
function tryStartWebapp(port) {
	return new Promise((resolvePromise, rejectPromise) => {
		console.log(`🚀 Attempting to start webapp frontend on port ${port}...`);

		// CRITICAL: Launch webapp EXACTLY as Playwright's webServer does
		// Use npm run dev:e2e (same as Playwright webServer does)
		// On Windows, use shell to find npm in PATH
		const isWindows = process.platform === 'win32';

		const command = 'npm run dev:only-for-e2e --workspace=web-frontend';
		const webappProcess = spawn(command, {
			// Run from project root
			cwd: projectRoot,
			env: {
				...process.env,
				// Ensure port is used
				VITE_E2E_PORT: port.toString(),
				VITE_WORKSPACE_ID: workspaceId.toString(),
			},
			// Capture stdout/stderr to detect errors
			stdio: ['inherit', 'pipe', 'pipe'],
			// Use shell on Windows to resolve npm
			shell: isWindows,
			windowsHide: true,
		});

		let output = '';
		let startupComplete = false;
		let hasError = false;

		// Monitor stdout for success/failure indicators
		if (webappProcess.stdout) {
			webappProcess.stdout.on('data', data => {
				const text = data.toString();
				output += text;

				// Forward to console for visibility
				process.stdout.write(text);

				// Success indicators (Vite is ready)
				// Vite outputs: "Local:   http://localhost:5050/" or "ready in XXXms"
				if ((text.includes('Local:') || text.includes('ready in')) && !startupComplete) {
					startupComplete = true;

					// Extract actual port from Vite output
					// Format: "  ➜  Local:   http://localhost:5050/"
					const portMatch = text.match(/localhost:(\d+)/);
					const actualPort = portMatch ? parseInt(portMatch[1], 10) : port;

					console.log(`✅ Webapp frontend successfully started on port ${actualPort}`);

					// Write actual port to file for tests
					// Use RUN_ID to avoid conflicts between parallel runs
					const runId = process.env.RUN_ID || 'default';
					const filename = path.resolve(tempFolder, `.webapp-port-${runId}.json`);
					const webappUrl = `http://localhost:${actualPort}`;
					mkdirSync(tempFolder, { recursive: true });
					writeFileSync(filename, JSON.stringify({ port: actualPort }));
					console.log(`📋 Written webapp URL to ${filename}: ${webappUrl}`);
					console.log(`🎯 Playwright will use: ${webappUrl} (RUN_ID: ${runId})`);
					// IMPORTANT: This message is monitored by Playwright (see playwright.config.integration.ts wait.stdout)
					console.log(`Webapp frontend successfully started! URL: ${webappUrl}`);

					resolvePromise({ webappProcess, port: actualPort });
				}
			});
		}

		// Monitor stderr for port conflict errors
		if (webappProcess.stderr) {
			webappProcess.stderr.on('data', data => {
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
					killProcessTree(webappProcess);
					rejectPromise(new Error('PORT_IN_USE'));
				}
			});
		}

		// Handle process exit during startup (failure)
		webappProcess.on('exit', code => {
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
					rejectPromise(new Error(`Webapp frontend exited with code ${code} during startup`));
				}
			}
			// If startupComplete is true, this is intentional exit (Playwright killed it)
		});

		// Timeout after 15 seconds
		// If Vite doesn't start in 15s, it's likely a port conflict
		setTimeout(() => {
			if (!startupComplete && !hasError) {
				killProcessTree(webappProcess);
				rejectPromise(new Error('Webapp frontend startup timeout'));
			}
		}, 15000);
	});
}

/**
 * Main retry loop
 */
async function main() {
	const startTime = performance.now();
	console.log(`🔍 Starting webapp frontend with port retry (base port: ${basePort})`);

	// Find first available port to use as starting point
	console.log(`🔎 Checking for available ports starting from ${basePort}...`);
	const startPort = await findFreePort(basePort, MAX_RETRIES);

	if (!startPort) {
		console.error(`❌ No available ports found in range ${basePort}-${basePort + MAX_RETRIES - 1}`);
		process.exit(1);
	}

	const duration = performance.now() - startTime;
	console.log(`✓ Found available port: ${startPort} in ${duration.toFixed(2)}ms`);

	// Try to start webapp frontend on the found port
	// If it fails due to race condition (another process grabbed it), retry with next ports
	for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
		const port = startPort + attempt;

		try {
			const { webappProcess } = await tryStartWebapp(port);

			// Success! Keep process running (Playwright will manage it)
			// Forward signals to webapp process
			process.on('SIGTERM', () => {
				console.log('\n🛑 Received SIGTERM, stopping webapp frontend...');
				webappProcess.kill('SIGTERM');
			});
			process.on('SIGINT', () => {
				console.log('\n🛑 Received SIGINT, stopping webapp frontend...');
				webappProcess.kill('SIGINT');
			});

			// Wait for webapp to exit
			webappProcess.on('exit', code => {
				console.log(`Webapp frontend exited with code ${code}`);
				process.exit(code || 0);
			});

			return; // Success - keep running
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
				console.error(`❌ Failed to start webapp frontend: ${error.message}`);
				console.error(error);
				process.exit(1);
			}
		}
	}
}

main();
