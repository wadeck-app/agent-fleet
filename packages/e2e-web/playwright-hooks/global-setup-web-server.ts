/
  Global Setup for Playwright
  Starts one backend server per worker for complete isolation
 
  SAFETY FEATURES:
  - Uses dedicated port range (+) to avoid conflicts with dev servers
  - Detects port availability before spawning
  - Verifies test mode via /api/test/health endpoint
  - Retries with next port if one is occupied
 /
import type { FullConfig } from '@playwright/test';
import { ChildProcess, exec, spawn } from 'node:child_process';
import { readFile, readdir, stat, unlink, writeFile } from 'node:fs/promises';
import  as net from 'node:net';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const sleep = promisify(setTimeout);
const execAsync = promisify(exec);

interface ServerInfo {
	port: number;
	pid: number;
}

const projectRoot = path.resolve(__dirname, '../../..');
const tempFolder = path.resolve(projectRoot, 'packages/ee-web/temp');

const debug = true;

/
  Kill a process and all its children (process tree)
  CRITICAL: spawn('npm run ...', {shell: true}) creates:
  - Parent process: npm (PID )
  - Child process: Node.js backend (PID )
 
  proc.kill() only kills npm, leaving the backend as a zombie!
  This function kills the entire process tree to prevent leaks.
 /
async function killProcessTree(proc: ChildProcess, backendPid?: number): Promise<void> {
	if (!proc.pid) {
		return;
	}

	try {
		if (process.platform === 'win') {
			// Windows: Use /T (tree) flag to kill all child processes
			await execAsync(`taskkill /PID ${proc.pid} /T /F`);
			debug && console.log(`       Killed process tree for PID ${proc.pid}`);

			// Belt and suspenders: also kill backend if we have its PID
			if (backendPid) {
				try {
					await execAsync(`taskkill /PID ${backendPid} /F`);
					debug && console.log(`       Also killed backend PID ${backendPid}`);
				} catch {
					// Backend might already be dead
				}
			}
		} else {
			// Unix: Kill process group (negative PID)
			try {
				process.kill(-proc.pid, 'SIGKILL');
				debug && console.log(`       Killed process group for PID ${proc.pid}`);
			} catch {
				// Process might already be dead
			}

			// Fallback to backend PID
			if (backendPid) {
				try {
					process.kill(backendPid, 'SIGKILL');
					debug && console.log(`       Also killed backend PID ${backendPid}`);
				} catch {
					// Backend might already be dead
				}
			}
		}
	} catch (error) {
		// Process might already be dead, that's okay
		debug && console.log(`       Could not kill PID ${proc.pid}: ${error}`);
	}
}

/
  Check if a port is available
  Fast check with -second timeout
 /
async function isPortAvailable(port: number): Promise<boolean> {
	return new Promise(resolve => {
		const server = net.createServer();

		// Timeout after  seconds (should be instant)
		const timeout = setTimeout(() => {
			server.close();
			resolve(false);
		}, );

		server.once('error', (err: NodeJS.ErrnoException) => {
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

		server.listen(port, '...');
	});
}

/
  Start a backend server on an available port
  Tries multiple ports if needed
  Waits for stdout confirmation that the server successfully bound to the port
  This avoids fetchs that could contact a backend from another terminal
 /
async function startServerOnAvailablePort(
	startPort: number,
	workspaceId: number,
	workerId: number,
	expectedRunId: string,
	maxPortAttempts: number = 
): Promise<{ port: number; actualPid: number; process: ChildProcess }> {
	debug &&
		console.log(
			` Searching for available port in range ${startPort}-${startPort + maxPortAttempts - } (RUN_ID: ${expectedRunId})`
		);

	for (let portOffset = ; portOffset < maxPortAttempts; portOffset++) {
		const port = startPort + portOffset;

		debug && console.log(`  [${portOffset + }/${maxPortAttempts}] Trying port ${port}...`);

		// Check if port is available BEFORE spawning
		const available = await isPortAvailable(port);
		if (!available) {
			debug && console.log(`      Port ${port} is occupied`);
			continue;
		}

		debug && console.log(`      Port ${port} is available, spawning backend process...`);
		debug && console.log(`      Worker ID: ${workerId}, PROJECT_ID will be: ${workerId}`);

		const command = 'npm run start:only-for-ee --workspace=web-backend';
		const serverProcess = spawn(command, {
			env: {
				...process.env,
				PORT: port.toString(),
				NODE_ENV: 'development',
				EE_MODE: 'true',
				// Explicitly ensure production mode is OFF (safe by default)
				USE_PRODUCTION_DB: 'false',
				// Set WORKSPACE_ID to match test suite expectation
				// This ensures spawned backend servers use the same workspace ID as the test setup
				WORKSPACE_ID: workspaceId.toString(),
				// Set PROJECT_ID (should remain fixed for the project)
				PROJECT_ID: process.env.PROJECT_ID || '',
				// Set unique WORKER_ID per EE worker to ensure each gets its own Orchestrator WebSocket port
				// Worker  → WORKER_ID= → Orch WS port , Worker  → WORKER_ID= → Orch WS port , etc.
				WORKER_ID: workerId.toString(),
				// Pass RUN_ID to backend so it can identify which test run it belongs to
				RUN_ID: process.env.RUN_ID || 'unknown',
			},
			stdio: 'pipe',
			shell: true,
			cwd: projectRoot,
			windowsHide: true,
		});

		// Wait for server to confirm it successfully bound to the port
		// We listen to stdout for the EE_BACKEND_READY message instead of doing fetchs
		const silentLogs = process.env.EE_SILENT_LOGS === 'true';

		const serverReady = new Promise<{ actualPort: number; actualPid: number }>((resolve, reject) => {
			let alreadyResolved = false;
			let portBindError = false;
			let serverExited = false;
			let stdoutReceived = false;

			// Debug: Uncomment to see startup progress
			// console.log(`      Waiting for EE_BACKEND_READY message from port ${port}...`);

			// Monitor stderr for EADDRINUSE errors
			serverProcess.stderr?.on('data', data => {
				const message = data.toString();
				if (debug) {
					const lines = message.trim().split('\n');
					lines.forEach((line: string) => {
						if (line && !line.includes('@app/backend')) {
							console.log(`     [STDERR:${port}] ${line}`);
						}
					});
				}

				if (message.includes('EADDRINUSE') || message.includes('port already in use')) {
					if (message.includes(port.toString())) {
						// HTTP port conflict -- this is a real problem for this worker
						portBindError = true;
						console.error(
							`      Port ${port} binding failed (EADDRINUSE detected) (alreadyResolved=${alreadyResolved})`
						);
						reject(new Error('PORT_IN_USE'));
					} else {
						// Internal port conflict (e.g. Orchestrator WS port) -- not our HTTP port
						// Log as warning but don't reject: server may still start successfully
						console.warn(`       Internal EADDRINUSE (not HTTP port ${port}): ${message.trim()}`);
					}
				}
			});

			// Monitor stdout for success message: "EE_BACKEND_READY port= pid= runId=..."
			serverProcess.stdout?.on('data', data => {
				const text = data.toString();
				stdoutReceived = true;

				if (debug) {
					const lines = text.trim().split('\n');
					lines.forEach((line: string) => {
						if (line && !line.includes('@app/backend')) {
							console.log(`     [STDOUT:${port}] ${line}`);
						}
					});
				}

				// Check for ready message
				const match = text.match(/EE_BACKEND_READY port=(\d+) pid=(\d+) runId=(\S+)/);
				if (match) {
					const actualPort = parseInt(match[], );
					const actualPid = parseInt(match[], );
					const actualRunId = match[];

					debug &&
						console.log(
							`      Received EE_BACKEND_READY: port=${actualPort}, pid=${actualPid}, runId=${actualRunId}`
						);
					debug && console.log(`      Expected: port=${port}, runId=${expectedRunId}`);

					// Verify this is OUR backend (not one from another terminal)
					if (actualPort !== port) {
						reject(
							new Error(
								`Port mismatch: expected ${port}, got ${actualPort} (alreadyResolved=${alreadyResolved})`
							)
						);
						return;
					}
					// NOTE: We don't check PID because spawn('npm') creates a parent process,
					// and the actual backend runs in a child process with a different PID
					if (actualRunId !== expectedRunId) {
						reject(
							new Error(
								`RUN_ID mismatch: expected ${expectedRunId}, got ${actualRunId} (alreadyResolved=${alreadyResolved})`
							)
						);
						return;
					}

					// Success! This is our backend and it's ready
					debug && console.log(`      Backend on port ${port} verified and ready!`);

					alreadyResolved = true;
					resolve({ actualPort, actualPid });
				}
			});

			// Handle process exit during startup (failure)
			serverProcess.on('exit', code => {
				if (!serverExited && !alreadyResolved) {
					serverExited = true;
					if (portBindError) {
						reject(new Error('PORT_IN_USE'));
					} else {
						const msg = `Process exited with code ${code} before becoming ready (stdout received: ${stdoutReceived}) (alreadyResolved=${alreadyResolved})`;
						console.error(`      ${msg}`);
						reject(new Error(msg));
					}
				}
			});

			// Timeout after s: compiled backend starts in <s, s covers slow machines
			setTimeout(() => {
				if (!serverExited && !alreadyResolved) {
					const msg = `Server startup timeout (s) on port ${port}. Stdout received: ${stdoutReceived}. PID: ${serverProcess.pid}`;
					// ALWAYS log timeouts
					console.error(`      ${msg}`);
					reject(new Error(msg));
				}
			}, _);
		});

		try {
			// Wait for server to be ready and capture the actual backend PID
			const { actualPid } = await serverReady;

			// Success! Return the port, actual backend PID, and process
			debug && console.log(` Backend successfully started on port ${port}`);
			return { port, actualPid, process: serverProcess };
		} catch (error) {
			// Server failed to start, kill it and try next port
			debug && console.log(`       Killing failed process on port ${port}...`);
			await killProcessTree(serverProcess);

			if (error instanceof Error && String(error) === 'PORT_IN_USE') {
				debug && console.log(`       Port ${port} is in use, will try next port`);
				continue;
			}

			// Other errors (timeout, mismatch, etc.) - also retry
			debug &&
				console.log(
					`       Server failed on port ${port}: ${error instanceof Error ? String(error) : error}. Will try next port`
				);
			continue;
		}
	}

	// Exhausted all attempts
	throw new Error(
		` FATAL: Failed to find available port after ${maxPortAttempts} attempts starting from ${startPort}`
	);
}

/
  Detects if this is a single test case run (e.g., from IntelliJ)
  Only detects explicit single test targeting, not file-level runs
 /
function isSingleTestRun(config: FullConfig): boolean {
	const args = process.argv.slice();

	// Heuristic : Line number specified (e.g., file.spec.ts:)
	// This definitively means a single test case
	const hasLineNumber = args.some(arg => arg.match(/\.spec\.ts:\d+/));
	if (hasLineNumber) {
		return true;
	}

	// Heuristic : --grep flag explicitly passed in CLI
	// IDEs use --grep to target specific test cases
	const hasGrepFlag = args.some(arg => arg === '--grep' || arg.startsWith('--grep='));
	if (hasGrepFlag) {
		return true;
	}

	// Default: assume full suite
	// Note: File-level runs (e.g., chat.spec.ts) use all workers
	// since a file can contain multiple test cases
	return false;
}

/
  Kills backend servers from any previous test run that didn't clean up properly.
  Reads all .test-servers-.json files (regardless of age) and kills their PIDs.
  This prevents EADDRINUSE cascades when a run is interrupted without teardown.
 /
async function killStaleServers(): Promise<void> {
	try {
		const files = await readdir(tempFolder);
		const serverFiles = files.filter(f => f.startsWith('.test-servers-'));

		if (serverFiles.length === ) {
			return;
		}

		console.log(` Found ${serverFiles.length} stale server file(s) -- killing leftover processes...`);

		for (const filename of serverFiles) {
			const filePath = path.join(tempFolder, filename);
			try {
				const data = await readFile(filePath, 'utf-');
				const servers: ServerInfo[] = JSON.parse(data);

				for (const server of servers) {
					try {
						if (process.platform === 'win') {
							await execAsync(`taskkill /PID ${server.pid} /T /F`);
						} else {
							process.kill(server.pid, 'SIGKILL');
						}
						console.log(`     Killed stale server PID ${server.pid} (port ${server.port})`);
					} catch {
						// Process already dead -- that's fine
					}
				}

				await unlink(filePath);
			} catch {
				// File may have been removed concurrently, ignore
			}
		}
	} catch {
		// Temp folder doesn't exist yet -- nothing to clean up
	}
}

/
  Cleans up orphaned port files from previous test runs
  Removes files older than  hour based on both:
  - Timestamp in filename (RUN_ID format: timestamp-pid)
  - File modification time (fallback if filename parsing fails)
 /
async function cleanupOrphanedFiles(): Promise<void> {
	const oneHourAgo = Date.now() -     ;

	try {
		const files = await readdir(tempFolder);
		const portFiles = files.filter(
			f => f.startsWith('.test-servers-') || f.startsWith('.webapp-port-') || f.startsWith('.storybook-port-')
		);

		if (portFiles.length === ) {
			return;
		}

		let cleanedCount = ;
		for (const filename of portFiles) {
			const filePath = path.join(tempFolder, filename);

			try {
				// Extract timestamp from RUN_ID in filename (format: .xxx-port-TIMESTAMP-PID.json)
				const match = filename.match(/(\d{})-\d+\.json$/);
				let isOld = false;

				if (match) {
					// Check timestamp from filename
					const fileTimestamp = parseInt(match[], );
					isOld = fileTimestamp < oneHourAgo;
				} else {
					// Fallback: check file modification time
					const stats = await stat(filePath);
					isOld = stats.mtimeMs < oneHourAgo;
				}

				if (isOld) {
					await unlink(filePath);
					cleanedCount++;
				}
			} catch (err) {
				// File might have been deleted by another process, ignore
			}
		}

		if (cleanedCount > ) {
			console.log(` Cleaned up ${cleanedCount} orphaned port file(s) older than  hour`);
		}
	} catch (err) {
		// Directory read failed, not critical - continue with test setup
	}
}

/
  Analyzes server output to distinguish real crashes from clean teardown
  Returns true if this appears to be a real crash (should be logged as error)
  Returns false if this appears to be a normal teardown (suppress error)
 
  Detection is based on actual observed pattern from successful test completions:
  - Exit code  (npm killed)
  - HTTP request logs in output
  - npm lifecycle error message (expected when process is killed)
 /
function analyzeServerCrash(serverOutput: string, exitCode: number): boolean {
	if (!serverOutput) {
		// No output - likely a crash during startup
		return true;
	}

	// PATTERN : Normal teardown after successful tests
	// Check for the exact pattern observed in user logs:
	// . HTTP requests in logs (server was working)
	// . npm lifecycle script error (expected when killed)
	// Note: Logs have format "[timestamp] [ INFO] GET /api/..." with space inside brackets
	const httpRequestPattern =
		/\[\s(INFO|WARN|ERROR)\s\]\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS)\s+\/\S+\s+\d{}\s+\d+ms/;
	const hasHttpLogs = httpRequestPattern.test(serverOutput);
	// Note: Use includes() without the backticks to match both `start:only-for-ee` and 'start:only-for-ee'
	const hasNpmLifecycleError =
		serverOutput.includes('npm error Lifecycle script') && serverOutput.includes('start:only-for-ee');

	if (exitCode ===  && hasHttpLogs && hasNpmLifecycleError) {
		// This is the exact pattern from normal test completion
		return false; // Not a crash - normal teardown
	}

	// PATTERN : Check for actual application errors
	const lowerOutput = serverOutput.toLowerCase();
	const crashIndicators = [
		' fatal', // Fatal errors from our app
		'failed to start', // Startup failures
		'eaddrinuse', // Port binding errors
		'unhandled exception', // Unhandled exceptions
		'unhandled rejection', // Unhandled promise rejections
	];

	for (const indicator of crashIndicators) {
		if (lowerOutput.includes(indicator)) {
			return true; // Real crash detected
		}
	}

	// PATTERN : npm killed but no HTTP logs = startup failure
	if (exitCode ===  && !hasHttpLogs && hasNpmLifecycleError) {
		return true; // Server never started serving requests
	}

	// Default: If we can't clearly identify the pattern, report as crash
	// This is conservative - better to show false positives than miss real crashes
	return true;
}

async function globalSetupWebServer(config: FullConfig) {
	// RUN_ID should already be set by playwright.config.integration.ts
	// This is a fallback in case it's not set
	const runId = process.env.RUN_ID || `${Date.now()}-${process.pid}`;
	if (!process.env.RUN_ID) {
		// @ts-ignore - Store RUN_ID in process.env for global-teardown and hooks to use
		process.env.RUN_ID = runId;
	}

	// Kill any servers left over from a previous run that didn't clean up (interrupted, crashed, etc.)
	await killStaleServers();

	// Clean up orphaned port files from interrupted test runs (>  hour old)
	await cleanupOrphanedFiles();

	// Detect if this is likely a single test run (e.g., from IntelliJ)
	const isSingleTest = isSingleTestRun(config);

	// Adjust workers: use  for single test, configured amount for full suite
	const configuredWorkers = config.workers;
	const numWorkers = isSingleTest ?  : configuredWorkers;
	const projectCount = config.projects.length;

	// Only show startup banner if not in silent mode
	if (process.env.EE_SILENT_LOGS !== 'true') {
		console.log('\n === STARTING BACKEND SERVERS FOR PARALLEL TESTING ===');
		console.log(` RUN_ID: ${runId}`);
		console.log(` Projects: ${projectCount} (${config.projects.map(p => p.name).join(', ')})`);
		console.log(` Configured workers: ${configuredWorkers}`);
		if (isSingleTest) {
			console.log(` Single test detected → Starting one backend server`);
		} else {
			console.log(` Backend servers to start: ${numWorkers}`);
			if (projectCount > ) {
				console.log(`  Workers from multiple projects will share backend servers (safe with in-memory DB)`);
			}
		}
		console.log('');
	}

	// Build backend once before spawning all workers (avoids × parallel tsx compilations)
	console.log(' Building backend for EE (once for all workers)...');
	await execAsync('npm run build:for-ee --workspace=web-backend', { cwd: projectRoot });
	console.log(' Backend built successfully (dist/server-test)');

	// Calculate base port from WORKSPACE_ID for parallel testing across workspaces
	// WORKSPACE_ID= → -, WORKSPACE_ID= → -, WORKSPACE_ID= → -, etc.
	const workspaceId = parseInt(process.env.WORKSPACE_ID || '', );
	const basePort =  + workspaceId  ;

	const processes: ChildProcess[] = [];
	const reservedPorts = new Set<number>();

	// Start all servers in parallel with individual retry logic
	const serverPromises = Array.from({ length: numWorkers }, async (_, i) => {
		debug && console.log(`\n Setting up backend server ${i + }/${numWorkers}...`);

		let retryCount = ;
		const maxRetries = ; // Reduced from  to avoid infinite loops

		while (retryCount < maxRetries) {
			try {
				debug && console.log(`   Attempt ${retryCount + }/${maxRetries} for worker ${i + }`);

				// Calculate port with offset to reduce collisions
				const startPort = basePort + i   + retryCount;

				// Skip already reserved ports
				if (reservedPorts.has(startPort)) {
					debug && console.log(`   Port ${startPort} already reserved, incrementing retry count`);
					retryCount++;
					continue;
				}

				// Reserve this port to prevent other workers from trying it
				reservedPorts.add(startPort);

				// Try to start server on this port
				// startServerOnAvailablePort will wait for EE_BACKEND_READY message in stdout
				// This prevents false positives when another terminal's backend is already on this port
				const expectedRunId = process.env.RUN_ID || 'unknown';
				const {
					port,
					actualPid,
					process: serverProcess,
				} = await startServerOnAvailablePort(startPort, workspaceId, i, expectedRunId, ); // Increased to  to handle leftover processes

				processes.push(serverProcess);

				// Monitor for unexpected exits - capture both stdout and stderr
				let serverOutput = '';
				serverProcess.stdout?.on('data', data => {
					serverOutput += data.toString();
				});
				serverProcess.stderr?.on('data', data => {
					serverOutput += data.toString();
				});

				serverProcess.on('exit', code => {
					if (code !==  && code !== null) {
						// Analyze server output to determine if this is a real crash
						const isRealCrash = analyzeServerCrash(serverOutput, code);

						if (isRealCrash) {
							console.error(`\n Backend server on port ${port} crashed with exit code ${code}`);
							console.error(`   PID: ${serverProcess.pid}`);
							console.error(`   RUN_ID: ${runId}`);
							if (serverOutput) {
								console.error(`   Last  lines of output:`);
								const lines = serverOutput.split('\n').filter(line => line.trim());
								const lastLines = lines.slice(-);
								lastLines.forEach(line => console.error(`     ${line}`));
							}
							console.error('');
						}
					}
				});

				debug && console.log(` Worker ${i + } successfully started on port ${port}`);

				// CRITICAL: Use actualPid (from EE_BACKEND_READY), not serverProcess.pid
				// serverProcess.pid is npm's PID, actualPid is the Node.js backend's PID
				// This ensures SIGINT is sent to the actual server process, not npm
				return { port, pid: actualPid, npmPid: serverProcess.pid! };
			} catch (error) {
				debug &&
					console.log(
						`    Worker ${i + } failed on attempt ${retryCount + }: ${error instanceof Error ? String(error) : error}`
					);
				retryCount++;

				// If this is the last retry, give up on this worker
				if (retryCount >= maxRetries) {
					const msg = `Worker ${i + } failed to start after ${maxRetries} attempts. Last error: ${error}`;
					console.error(`\n FATAL: ${msg}\n`);
					throw new Error(msg);
				}

				// Small delay before retry to avoid hammering
				debug && console.log(`    Waiting ms before retry...`);
				await sleep();
			}
		}

		throw new Error(`Worker ${i + } exhausted all retries`);
	});

	// Use allSettled to collect both successful and failed server starts
	const results = await Promise.allSettled(serverPromises);

	// Extract successful servers
	const servers: ServerInfo[] = [];
	const errors: string[] = [];

	results.forEach((result, index) => {
		if (result.status === 'fulfilled') {
			servers.push(result.value);
		} else {
			errors.push(`Worker ${index + }: ${result.reason}`);
		}
	});

	// ALWAYS write .test-servers-${RUN_ID}.json, even if some workers failed
	// This allows teardown to clean up any servers that did start
	// RUN_ID ensures multiple parallel runs don't interfere with each other
	if (servers.length > ) {
		const filename = path.resolve(tempFolder, `.test-servers-${runId}.json`);
		// const filename = `.test-servers-${runId}.json`;
		mkdirSync(tempFolder, { recursive: true });
		await writeFile(filename, JSON.stringify(servers, null, ));

		// ALWAYS log allocated ports for debugging parallel runs (even with EE_SILENT_LOGS)
		console.log(`\n Backend servers allocated for RUN_ID ${runId}:`);
		servers.forEach((server, index) => {
			console.log(`   [${index}] Port ${server.port} (PID: ${server.pid})`);
		});
		console.log('');
	}

	// If any workers failed, kill all servers and throw error
	if (errors.length > ) {
		console.error(`\n FATAL ERROR: ${errors.length}/${results.length} workers failed to start\n`);
		errors.forEach(err => console.error(`  - ${err}`));

		// Kill all started servers on error (including process trees to avoid zombie backends)
		console.log(` Cleaning up ${processes.length} started server(s)...`);
		await Promise.all(
			processes.map(async (proc, index) => {
				const backendPid = servers[index]?.pid;
				await killProcessTree(proc, backendPid);
			})
		);

		throw new Error(`Failed to start ${errors.length} worker(s). See errors above.`);
	}

	// All workers succeeded - Give them a moment to stabilize
	await sleep();

	if (process.env.EE_SILENT_LOGS !== 'true') {
		console.log('\n All backend servers are ready and verified!\n');
		console.log(' Server mapping:');
		servers.forEach((server, index) => {
			console.log(`   Worker ${index} → http://localhost:${server.port} (PID: ${server.pid})`);
		});
		console.log(' All servers verified to be in test mode with in-memory DB');
		console.log('  Servers have been stable for  second');
		console.log('');
	}
}

export default globalSetupWebServer;
