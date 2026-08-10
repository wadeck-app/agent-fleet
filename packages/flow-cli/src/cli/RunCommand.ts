import { DaemonNotRunningError, createDaemonClient } from '@wadeck/singleton-daemon-kit';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { DEFAULT_CONFIG, startDaemon } from '../daemon/Daemon.js';
import type { ClientCommand, DaemonResponse } from '../ipc/Protocol.js';

type FlowCommands = {
	run: (payload: unknown) => Promise<DaemonResponse>;
};

export async function runRunCommand(args: string[]): Promise<never> {
	const filePath = args[0];
	if (!filePath) {
		process.stderr.write('Usage: flow run <file> [--quiet] [--flow-id <id>]\n');
		process.exit(1);
	}

	let quiet = false;
	let flowId: string | undefined;
	const inputs: Record<string, string> = {};

	for (let i = 1; i < args.length; i++) {
		if (args[i] === '--quiet') {
			quiet = true;
		} else if (args[i] === '--flow-id' && args[i + 1]) {
			flowId = args[++i];
		} else if (args[i]?.startsWith('--input=')) {
			const raw = args[i]!.slice('--input='.length);
			const eqIdx = raw.indexOf('=');
			if (eqIdx === -1) {
				process.stderr.write(`Invalid --input format: '${raw}'. Expected key=value\n`);
				process.exit(1);
			}
			inputs[raw.slice(0, eqIdx)] = raw.slice(eqIdx + 1);
		} else if (args[i] === '--input' && args[i + 1]) {
			const raw = args[++i]!;
			const eqIdx = raw.indexOf('=');
			if (eqIdx === -1) {
				process.stderr.write(`Invalid --input format: '${raw}'. Expected key=value\n`);
				process.exit(1);
			}
			inputs[raw.slice(0, eqIdx)] = raw.slice(eqIdx + 1);
		}
	}

	const daemonDir = path.join(os.homedir(), '.flow-daemon');
	const cmd: Extract<ClientCommand, { type: 'run' }> = {
		type: 'run',
		flowFile: filePath,
		flowId,
		inputs,
		quiet,
		cwd: process.cwd(),
	};

	// Load config for daemon startup
	let config = DEFAULT_CONFIG;
	const configFile = path.join(os.homedir(), '.flow-config.yaml');
	if (fs.existsSync(configFile)) {
		try {
			config = yaml.load(fs.readFileSync(configFile, 'utf8')) as typeof DEFAULT_CONFIG;
			// Merge with defaults to ensure all keys present
			config = {
				queue: { ...DEFAULT_CONFIG.queue, ...config.queue },
				logs: { ...DEFAULT_CONFIG.logs, ...config.logs },
				worker: { ...DEFAULT_CONFIG.worker, ...config.worker },
			};
		} catch (err) {
			process.stderr.write(`Warning: failed to parse ${configFile}, using defaults: ${String(err)}\n`);
		}
	}

	const client = createDaemonClient<FlowCommands>({
		configDir: daemonDir,
		commands: {
			run: async p => {
				return p as DaemonResponse;
			},
		},
	});

	let response: DaemonResponse;
	try {
		response = (await client.send('run', cmd)) as DaemonResponse;
	} catch (err) {
		if (err instanceof DaemonNotRunningError) {
			// Become the daemon — this call takes over the current process
			await startDaemon(config);

			// The daemon is now running. Send the original command via a new client.
			const inlineClient = createDaemonClient<FlowCommands>({
				configDir: daemonDir,
				commands: {
					run: async p => {
						return p as DaemonResponse;
					},
				},
			});
			try {
				response = (await inlineClient.send('run', cmd)) as DaemonResponse;
			} catch (innerErr) {
				process.stderr.write(JSON.stringify({ code: 'DAEMON_START_FAILED', message: String(innerErr) }) + '\n');
				process.exit(3);
			}
		} else {
			process.stderr.write(JSON.stringify({ code: 'DAEMON_ERROR', message: String(err) }) + '\n');
			process.exit(1);
		}
	}

	// D27 (v1 scope): CLI-side validation that type:secret inputs use a URI scheme
	// (env://, file://) is not yet implemented. The daemon validates flow schemas but
	// literal secret values would travel over Channel 1 in plaintext.

	if (response!.type === 'error') {
		if (response!.code === 'VALIDATION_FAILED') {
			let errors: unknown;
			try {
				errors = JSON.parse(response!.message);
			} catch {
				errors = [{ message: response!.message }];
			}
			process.stderr.write(JSON.stringify({ valid: false, errors }) + '\n');
			process.exit(2);
		}
		process.stderr.write(JSON.stringify({ code: response!.code, message: response!.message }) + '\n');
		process.exit(1);
	}

	if (!quiet) {
		process.stdout.write(response!.executionId + '\n');
	}
	process.exit(0);
}
