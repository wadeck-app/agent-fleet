import fs from 'fs';
import os from 'os';
import path from 'path';
import { dirname } from 'path';
import { fileURLToPath } from 'url';

// @formatter:off
try {
	// Get __dirname equivalent in ES modules
	const __filename = fileURLToPath(import.meta.url);
	const __dirname = dirname(__filename);

	// Get all arguments
	const args = process.argv.slice(2);
	const env = process.env;

	// Setup logging - try multiple locations
	let projectDir = env.CLAUDE_PROJECT_DIR || env.CLAUDE_CONTEXT_DIR || path.join(__dirname, '..', '..');
	let logFile = path.join(projectDir, 'SessionStart.log');

	// Immediately write that we started
	try {
		fs.appendFileSync(logFile, `[${new Date().toISOString()}] Hook script starting...\n`);
	} catch (e) {
		// If that fails, try in temp
		logFile = path.join(os.tmpdir(), 'agent-fleet-SessionStart.log');
		fs.appendFileSync(logFile, `[${new Date().toISOString()}] Hook script starting (fallback location)...\n`);
		fs.appendFileSync(logFile, `[${new Date().toISOString()}] Original error: ${e.message}\n`);
	}

	function log(message) {
		const timestamp = new Date().toISOString();
		fs.appendFileSync(logFile, `[${timestamp}] ${message}\n`);
	}

	log('SessionStart hook initialized');
	log(`CWD: ${process.cwd()}`);
	log(`__dirname: ${__dirname}`);
	log(`Project dir: ${projectDir}`);
	log(`Log file: ${logFile}`);

	// Read stdin
	let stdinData = '';

	process.stdin.setEncoding('utf8');

	process.stdin.on('data', chunk => {
		stdinData += chunk;
		log(`Received stdin chunk: ${chunk.length} bytes`);
	});

	process.stdin.on('end', () => {
		try {
			log('Stdin ended, processing...');

			// Parse stdin JSON
			let parsedStdin = null;
			try {
				parsedStdin = JSON.parse(stdinData);
				log('Stdin parsed as JSON successfully');
			} catch (e) {
				log(`Failed to parse stdin as JSON: ${e.message}`);
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

			log(`CLAUDE_ env vars found: ${Object.keys(content.env).length}`);

			// Write to project root
			const targetFile = path.join(projectDir, 'SessionStart.json');
			log(`Writing to ${targetFile}`);

			fs.appendFileSync(targetFile, JSON.stringify(content, null, 2) + '\n---\n');

			log('Data written successfully to SessionStart.json');
			console.log('SessionStart hook: data written to SessionStart.json');
		} catch (error) {
			log(`ERROR in stdin.end: ${error.message}`);
			log(`Stack: ${error.stack}`);
			console.error('SessionStart hook ERROR:', error.message);
			process.exit(1);
		}
	});

	process.stdin.on('error', error => {
		log(`Stdin error: ${error.message}`);
		console.error('SessionStart hook: stdin error:', error.message);
		process.exit(1);
	});
} catch (topLevelError) {
	// Last resort - write to temp with basic fs
	const emergencyLog = path.join(os.tmpdir(), 'agent-fleet-SessionStart-CRASH.log');
	fs.appendFileSync(emergencyLog, `CRASH: ${topLevelError.message}\n${topLevelError.stack}\n`);
	process.exit(1);
}
// @formatter:on
