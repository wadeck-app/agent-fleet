import fssync from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Validates if a filename matches the temporary Claude file pattern
 * Pattern: tmpclaude-XXXX-cwd where XXXX is 4 hexadecimal characters
 */
function isTempClaudeFile(filename) {
	const pattern = /^tmpclaude-[0-9a-f]{4}-cwd$/i;
	return pattern.test(filename);
}

/**
 * Recursively finds all temporary Claude files in the project directory
 */
async function findTempFiles(projectDir, logToFile) {
	const tempFiles = [];

	try {
		const entries = await fs.readdir(projectDir, {
			recursive: true,
			withFileTypes: true,
		});

		for (const entry of entries) {
			if (entry.isFile() && isTempClaudeFile(entry.name)) {
				const fullPath = path.join(entry.parentPath || entry.path, entry.name);
				tempFiles.push(fullPath);
			}
		}
	} catch (error) {
		logToFile(`Error scanning for temp files: ${error.message}`);
	}

	return tempFiles;
}

/**
 * Safely deletes temporary Claude files with validation
 */
async function cleanupTemporaryFiles(projectDir, logToFile) {
	logToFile('Starting temporary file cleanup...');

	const tempFiles = await findTempFiles(projectDir, logToFile);
	logToFile(`Found ${tempFiles.length} temporary files to clean`);

	let deleted = 0;
	let failed = 0;

	for (const filePath of tempFiles) {
		try {
			// Safety check: verify file is within project directory
			const resolvedPath = path.resolve(filePath);
			const resolvedProject = path.resolve(projectDir);

			if (!resolvedPath.startsWith(resolvedProject)) {
				logToFile(`Skipping file outside project: ${filePath}`);
				failed++;
				continue;
			}

			// Safety check: verify file size (temp files should be tiny)
			const stats = await fs.stat(filePath);
			if (stats.size > 1024) {
				logToFile(`Skipping large file: ${filePath} (${stats.size} bytes)`);
				failed++;
				continue;
			}

			// Delete the file
			await fs.unlink(filePath);
			deleted++;
			logToFile(`Deleted: ${filePath}`);
		} catch (error) {
			failed++;
			logToFile(`Failed to delete ${filePath}: ${error.message}`);
		}
	}

	logToFile(`Cleanup complete: ${deleted} deleted, ${failed} failed`);
	console.log(`Temp file cleanup: ${deleted} deleted, ${failed} failed`);
}

// Get all arguments
const args = process.argv.slice(2);
const env = process.env;

// Read stdin
let stdinData = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
	stdinData += chunk;
});

process.stdin.on('end', async () => {
	// Parse stdin JSON
	let parsedStdin = null;
	try {
		parsedStdin = JSON.parse(stdinData);
	} catch (e) {
		parsedStdin = stdinData; // Keep as string if parsing fails
	}

	// Prepare content to write with stdin, args and env
	const content = {
		timestamp: new Date().toISOString(),
		stdin: parsedStdin,
		args: args,
		env: Object.keys(env)
			.filter(key => key.startsWith('CLAUDE_'))
			.reduce((obj, key) => {
				obj[key] = env[key];
				return obj;
			}, {}),
	};

	// Write to project root (use CLAUDE_PROJECT_DIR)
	const projectDir = env.CLAUDE_PROJECT_DIR || path.join(__dirname, '..', '..');
	// fs.appendFileSync(
	//   path.join(projectDir, 'Stop.json'),
	//   JSON.stringify(content, null, 2) + '\n---\n'
	// );

	console.log('Stop hook: data written to Stop.json');

	// Helper function to log to Stop.txt
	const logToFile = message => {
		const logPath = path.join(projectDir, 'Stop.txt');
		const timestamp = new Date().toISOString();
		// fssync.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
	};

	// Run cleanup before WebSocket logic
	try {
		await cleanupTemporaryFiles(projectDir, logToFile);
	} catch (error) {
		logToFile(`Cleanup error: ${error.message}`);
		console.error('Temp cleanup error:', error.message);
		// Continue with stop logic even if cleanup fails
	}

	// Check if stoppable mode is enabled
	const isStoppable = env.CLAUDE_CODE_STOPPABLE === 'true';
	const workerSocket = env.CLAUDE_WORKER_SOCKET;
	const workerId = env.CLAUDE_WORKER_ID;
	const taskId = env.CLAUDE_TASK_ID;

	logToFile(`Stoppable mode: ${isStoppable}`);
	logToFile(`Worker socket: ${workerSocket}`);

	if (!isStoppable) {
		console.log('Stop hook: Stoppable mode disabled, ignoring stop request');
		logToFile('Stoppable mode disabled - not sending stop request');
		process.exit(0);
		return;
	}

	if (workerSocket) {
		console.log('Stop hook: Sending stop request to worker...');
		logToFile(`Connecting to worker socket: ${workerSocket}`);

		try {
			const ws = new WebSocket(workerSocket);

			ws.on('open', () => {
				logToFile('WebSocket connection established');

				const stopMessage = {
					type: 'STOP_REQUESTED',
					workerId: workerId,
					taskId: taskId,
					timestamp: new Date().toISOString(),
				};

				ws.send(JSON.stringify(stopMessage));
				logToFile(`Stop request sent: ${JSON.stringify(stopMessage)}`);
				console.log('Stop request sent to worker');

				// Close connection after sending
				setTimeout(() => {
					ws.close();
					logToFile('WebSocket closed');
					process.exit(0);
				}, 100);
			});

			ws.on('error', error => {
				logToFile(`WebSocket error: ${error.message}`);
				console.error('Failed to connect to worker socket:', error.message);
				process.exit(1);
			});

			ws.on('close', () => {
				logToFile('WebSocket connection closed');
			});
		} catch (error) {
			logToFile(`Error creating WebSocket: ${error.message}`);
			console.error('Error creating WebSocket:', error.message);
			process.exit(1);
		}
	} else {
		console.log('No worker socket configured, stop request ignored');
		logToFile('No CLAUDE_WORKER_SOCKET environment variable found');
	}
});
