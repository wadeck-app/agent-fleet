#!/usr/bin/env node
import { UpdateManager } from '@wadeck/shared-cli';
import { createDaemonClient, readPortFile } from '@wadeck/singleton-daemon-kit';
import { Command } from 'commander';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlowConfigLoader } from '../config/FlowConfig.js';
import { Daemon } from '../daemon/Daemon.js';
import { buildCliCommand } from './commands/CliCommand.js';
import { registerDocsCommand } from './commands/DocsCommand';
import { registerHistoryCommand } from './commands/HistoryCommand';
import { registerRunCommand } from './commands/RunCommand';
import { registerShowCommand } from './commands/ShowCommand';
import { registerValidateCommand } from './commands/ValidateCommand';
import { VERSION } from './version.js';

const EXIT_CODES_TEXT = `
Exit codes:
  0  success
  1  error
  2  daemon not running
  3  not found`;

const DAEMON_DIR = path.join(os.homedir(), '.flow-daemon');

// ---------------------------------------------------------------------------
// Daemon lifecycle commands
// ---------------------------------------------------------------------------

async function registerDaemonCommands(program: Command): Promise<void> {
	// flow start -- spawn daemon detached and return immediately
	program
		.command('start')
		.description('Start the flow daemon in the background')
		.action(async () => {
			const client = createDaemonClient({ configDir: DAEMON_DIR, commands: {} });
			if (await client.isRunning()) {
				process.stdout.write('[ok] daemon already running\n');
				return;
			}
			const bundlePath = process.env['LAUNCHER_BUNDLE_OVERRIDE'] ?? fileURLToPath(import.meta.url);
			const child = spawn(process.execPath, [bundlePath], {
				detached: true,
				stdio: 'ignore',
				env: { ...process.env, FLOW_DAEMON_MODE: '1' },
			});
			child.unref();
			process.stdout.write('[ok] daemon starting\n');
		});

	// flow stop -- POST /quit to the running daemon
	program
		.command('stop')
		.description('Stop the running flow daemon')
		.action(async () => {
			const portData = await readPortFile(DAEMON_DIR);
			if (!portData) {
				process.stdout.write('[fail] daemon not running\n');
				process.exit(2);
				return;
			}
			const tokenPath = path.join(DAEMON_DIR, 'health_token');
			if (!fs.existsSync(tokenPath)) {
				process.stdout.write('[fail] daemon not running\n');
				process.exit(2);
				return;
			}
			const token = fs.readFileSync(tokenPath, 'utf8').trim();
			await new Promise<void>((resolve, reject) => {
				const req = http.request(
					{
						hostname: '127.0.0.1',
						port: portData.port,
						method: 'POST',
						path: '/quit',
						headers: { Authorization: `Bearer ${token}` },
					},
					res => {
						res.resume();
						res.on('end', resolve);
					}
				);
				req.on('error', reject);
				req.end();
			});
			process.stdout.write('[ok] daemon stopped\n');
		});

	// flow status -- query daemon health, print running state/version/pid
	program
		.command('status')
		.description('Show the current daemon status')
		.option('--json', 'Machine-readable JSON output')
		.action(async (opts: { json?: boolean }) => {
			const useJson = opts.json === true || !process.stdout.isTTY;
			const client = createDaemonClient({ configDir: DAEMON_DIR, commands: {} });

			let running: boolean;
			try {
				running = await client.isRunning();
			} catch {
				running = false;
			}

			if (!running) {
				if (useJson) {
					process.stdout.write(JSON.stringify({ running: false }) + '\n');
				} else {
					process.stdout.write('[flow] stopped\n');
				}
				return;
			}

			try {
				const info = await client.version();
				if (useJson) {
					process.stdout.write(
						JSON.stringify({ running: true, version: info.version, pid: info.pid }) + '\n'
					);
				} else {
					process.stdout.write(`[flow] running  pid=${info.pid}  version=${info.version}\n`);
				}
			} catch (err) {
				if (useJson) {
					process.stdout.write(JSON.stringify({ running: true, version: null, pid: null }) + '\n');
				} else {
					process.stdout.write(`[flow] running (version query failed: ${String(err)})\n`);
				}
			}
		});
}

async function main(): Promise<void> {
	// Daemon-only mode: spawned by `flow start`, keeps the daemon running without any CLI command.
	if (process.env['FLOW_DAEMON_MODE'] === '1') {
		const config = FlowConfigLoader.load(path.join(os.homedir(), '.flow-config.yaml'));
		await Daemon.start(config, DAEMON_DIR);
		// Event loop drains naturally when the daemon shuts down (via /quit or SIGTERM).
		return;
	}

	// Show update notice from a previous background update run
	const updateManager = new UpdateManager('@wadeck/flow-cli');
	const updateState = updateManager.readAndClearState();
	if (updateState?.status === 'success') {
		process.stderr.write(`[flow] Updated to v${updateState.newVersion}\n`);
	}
	if (updateState?.status === 'rolled-back') {
		process.stderr.write(
			`[flow] Update to v${updateState.targetVersion} failed (self-check failed). Rolled back to v${updateState.previousVersion}. Run: flow cli update --log\n`
		);
	}
	if (updateState?.status === 'update-failed') {
		process.stderr.write(`[flow] Update check failed (${updateState.reason}). Run: flow cli update\n`);
	}

	const program = new Command();
	program.name('flow').version(VERSION).description('CLI for running and validating agent flows');
	program.addHelpText('after', EXIT_CODES_TEXT);

	registerDocsCommand(program);
	registerShowCommand(program);
	registerValidateCommand(program);
	registerRunCommand(program);
	registerHistoryCommand(program);
	program.addCommand(buildCliCommand());
	await registerDaemonCommands(program);

	// Schedule background updater even when a command throws
	const bundlePath = process.env['LAUNCHER_BUNDLE_OVERRIDE'] ?? fileURLToPath(import.meta.url);
	try {
		await program.parseAsync(process.argv);
	} finally {
		updateManager.scheduleBackgroundUpdate(bundlePath, 'flow-updater.cjs');
	}
}

const isEntryPoint =
	process.argv[1] !== undefined &&
	(process.argv[1] === fileURLToPath(import.meta.url) ||
		process.argv[1].endsWith('FlowIndex.js') ||
		process.argv[1].endsWith('FlowIndex.ts'));

if (isEntryPoint) {
	main().catch(error => {
		process.stderr.write(`Error: ${String(error)}\n`);
		process.exit(1);
	});
}
