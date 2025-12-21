import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import WebSocket from 'ws';

// Get __dirname equivalent in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Get all arguments
const args = process.argv.slice(2);
const env = process.env;

// Read stdin
let stdinData = '';

process.stdin.setEncoding('utf8');

process.stdin.on('data', chunk => {
	stdinData += chunk;
});

process.stdin.on('end', () => {
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
		//    fs.appendFileSync(logPath, `[${timestamp}] ${message}\n`);
	};

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
