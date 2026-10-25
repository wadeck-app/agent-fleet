#!/usr/bin/env node
import { UpdateManager } from '@wadeck-app/shared-cli';
import { cliLogsCommand } from '@wadeck-app/shared-cli/CliMetaCommands';
import { resolveOwnBundlePath } from '@wadeck-app/shared-cli/resolveOwnBundlePath';
import { readPortFile } from '@wadeck-app/singleton-daemon-kit';
import { Command } from 'commander';
import { createRemoteDaemonClient, logsDirOf } from 'flow-core';
import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as http from 'node:http';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

import { FlowConfigLoader } from '../config/FlowConfig.js';
import { flowConfigDir } from '../config/FlowConfigDir.js';
import { appCoreModuleOptions } from '../daemon/AppModuleLocator.js';
import { Daemon } from '../daemon/Daemon.js';
import { writeDaemonLog } from '../daemon/DaemonLog.js';
import { buildWindowsDaemonEnvLines, resolveFlowBashPath } from '../daemon/WindowsDaemonEnv.js';
import { resolveDaemonPort } from '../daemon/resolveDaemonPort.js';
import { createFlowEventPublisher } from '../events/createFlowEventPublisher.js';
import { describeCommandLine } from './CommandLineLog';
import { FLOW_BUNDLE_NAME } from './FlowBundleName.js';
import { buildCliCommand } from './commands/CliCommand.js';
import { registerDocsCommand } from './commands/DocsCommand';
import { registerHistoryCommand } from './commands/HistoryCommand';
import { registerPluginsCommand } from './commands/PluginsCommand';
import { registerResumeCommand } from './commands/ResumeCommand';
import { registerRunCommand } from './commands/RunCommand';
import { registerShowCommand } from './commands/ShowCommand';
import { registerValidateCommand } from './commands/ValidateCommand';
import { registerVersionsCommand } from './commands/VersionsCommand';
import { registerWorkerCommand } from './commands/WorkerCommand';
import { registerWorkerSourceCommand } from './commands/WorkerSourceCommand';
import { VERSION } from './version.js';

const CONCEPTS_TEXT = `
Concepts:
  flow      A YAML file defining a sequence of steps (model, script, subflow, user_intervention)
  flow ID   The "id:" field at the top of a flow YAML file; used to run/show/history a flow
  version   The "version:" field (semver) of a flow; a run records the version it ran. "flow run <id>" runs the latest, "flow run <id>@1.2.0" a given one
  daemon    Background service that executes flows; required for "run", "start", "stop", "status"
  config    ~/.config/flow/config.yaml  (XDG_CONFIG_HOME overrides ~/.config)
`;

const EXIT_CODES_TEXT = `
Exit codes:
  0  success
  1  error
  2  daemon not running
  3  not found

Status --json fields (flow status --json):
  { running: boolean, version?: string, pid?: number }

Environment variables:
  XDG_CONFIG_HOME   Override base config directory (default: ~/.config)
  FLOW_DAEMON_MODE  Internal - set to "1" by "flow start" to launch daemon mode
  FLOW_DAEMON_PORT  Daemon command port, 0 to let the OS pick one (default: standard range 47823-47833)

Daemon-required commands: run, start, stop, status
Standalone commands:      show, validate, history, versions, docs, logs, cli`;

const DAEMON_DIR = flowConfigDir();

// ---------------------------------------------------------------------------
// Daemon lifecycle commands
// ---------------------------------------------------------------------------

async function registerDaemonCommands(program: Command): Promise<void> {
	// flow start -- spawn daemon detached and return immediately
	program
		.command('start')
		.description('Start the flow daemon in the background')
		.action(async () => {
			const client = createRemoteDaemonClient(DAEMON_DIR);
			if (await client.isRunning()) {
				process.stdout.write('[ok] daemon already running\n');
				return;
			}
			const bundlePath = resolveOwnBundlePath(FLOW_BUNDLE_NAME, fileURLToPath(import.meta.url));
			if (process.platform === 'win32') {
				const vbsPath = path.join(os.tmpdir(), `flow-daemon-start-${Date.now()}.vbs`);
				const safeNode = process.execPath.replace(/"/g, '""');
				const safeBundle = bundlePath.replace(/"/g, '""');
				const daemonEnv: NodeJS.ProcessEnv = { ...process.env, FLOW_DAEMON_MODE: '1' };
				const resolvedBashPath = resolveFlowBashPath(daemonEnv);
				if (resolvedBashPath) {
					daemonEnv['FLOW_BASH_PATH'] = resolvedBashPath;
				}
				fs.writeFileSync(
					vbsPath,
					[
						'Dim oShell',
						'Set oShell = CreateObject("WScript.Shell")',
						'oShell.Environment("Process")("FLOW_DAEMON_MODE") = "1"',
						...buildWindowsDaemonEnvLines(daemonEnv),
						`oShell.Run """${safeNode}"" ""${safeBundle}""", 0, False`,
					].join('\r\n')
				);
				const wscript = spawn('wscript.exe', [vbsPath], {
					detached: true,
					stdio: 'ignore',
					windowsHide: true,
					env: daemonEnv,
				});
				wscript.unref();
			} else {
				// violations-suppress: cli/no-spawn-without-windows-hide this is the non-Windows branch (win32 uses wscript.exe above), where windowsHide has no effect
				const child = spawn(process.execPath, [bundlePath], {
					stdio: 'ignore',
					env: { ...process.env, FLOW_DAEMON_MODE: '1' },
				});
				child.unref();
			}
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
			// TTY detection disabled: always use human-readable format unless --json is passed
			const useJson = opts.json === true; /* || !process.stdout.isTTY */
			const client = createRemoteDaemonClient(DAEMON_DIR);

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
			} catch {
				if (useJson) {
					process.stdout.write(JSON.stringify({ running: true, version: null, pid: null }) + '\n');
				} else {
					process.stdout.write('[flow] running (version query failed)\n');
				}
			}
		});
}

async function printDaemonPid(): Promise<void> {
	const client = createRemoteDaemonClient(DAEMON_DIR);
	try {
		const info = await client.version();
		process.stdout.write(`pid=${info.pid}\n`);
	} catch {
		process.stdout.write('[fail] daemon not running\n');
		process.exit(2);
	}
}

async function main(): Promise<void> {
	// Daemon-only mode: spawned by `flow start`, keeps the daemon running without any CLI command.
	if (process.env['FLOW_DAEMON_MODE'] === '1') {
		const { config, legacyWarning } = FlowConfigLoader.loadForDaemon(DAEMON_DIR);
		// Printed by the daemon itself, since this is the process whose behaviour the ignored
		// file would have changed.
		if (legacyWarning !== undefined) {
			process.stderr.write(`[flow] ${legacyWarning}\n`);
		}
		// Must run before any worker is forked: ForkWorkerSource/WindowsDaemonEnv forward these
		// two vars from this process's own env, never overriding an operator's explicit export.
		FlowConfigLoader.applyOpenCodeEnvDefaults(config);
		// The packaged app-modules (flow, flow-chart) are registered with app-core (best-effort) once the daemon is up.
		const appCoreModules = appCoreModuleOptions(import.meta.url, message =>
			writeDaemonLog(logsDirOf(DAEMON_DIR), 'error', `[AppCoreRegistration] ${message}`)
		);
		const eventPublisher = createFlowEventPublisher(process.env, (level, message) =>
			writeDaemonLog(logsDirOf(DAEMON_DIR), level, message)
		);
		const port = resolveDaemonPort(process.env);
		await Daemon.start(config, DAEMON_DIR, {
			// Started by `flow run` / `flow start` because none answered: if one answers by now (concurrent runs each
			// start one), it stays, with its executions.
			existingDaemon: 'yield',
			appCoreModules,
			eventPublisher,
			...(port === undefined ? {} : { port }),
		});
		// Event loop drains naturally when the daemon shuts down (via /quit or SIGTERM).
		return;
	}

	// Handle --pid before Commander parsing: exit early with daemon PID
	if (process.argv.slice(2).includes('--pid')) {
		await printDaemonPid();
		return;
	}

	// Log every CLI invocation to ~/.config/flow/logs/YYYY-MM-DD.ndjson
	try {
		const logsDir = logsDirOf(flowConfigDir());
		const args = process.argv.slice(2);
		// Input values are omitted: any input may be a secret and the log is a plain file.
		writeDaemonLog(logsDir, 'info', describeCommandLine(args));
	} catch {
		// never block the CLI on logging failure
	}

	// Show update notice from a previous background update run
	const updateManager = new UpdateManager('@wadeck-app/flow-cli');
	const updateState = updateManager.readAndClearState();
	if (updateState?.status === 'success') {
		process.stderr.write(`[flow] Updated to v${updateState.targetVersion ?? updateState.newVersion}\n`);
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
	// Register --pid as a documented option (handled before parseAsync above)
	program.option('--pid', 'Show the daemon PID and exit');
	program.addHelpText('before', CONCEPTS_TEXT);
	program.addHelpText('after', EXIT_CODES_TEXT);

	registerDocsCommand(program);
	registerShowCommand(program);
	registerValidateCommand(program);
	registerRunCommand(program);
	registerResumeCommand(program);
	registerHistoryCommand(program);
	registerVersionsCommand(program);
	registerWorkerCommand(registerWorkerSourceCommand(program));
	registerPluginsCommand(program);
	program.addCommand(buildCliCommand());
	await registerDaemonCommands(program);

	// Top-level alias for `flow cli logs`
	program
		.command('logs')
		.description("Alias for: flow cli logs  (print today's daemon log)")
		.option('--follow', 'Follow the log file (tail -f style)')
		.action(async (opts: { follow?: boolean }) => {
			await cliLogsCommand(flowConfigDir(), { follow: opts.follow ?? false });
		});

	// Catch unknown top-level commands (must be registered after all addCommand calls, before parseAsync)
	program.on('command:*', (operands: string[]) => {
		const msg = `[flow] Unknown command: ${(operands as string[]).join(' ')}\n       Run: flow --help\n`;
		// Write to stderr only -- the bin-launcher bypass ensures stderr reaches the terminal.
		process.stderr.write(msg);
		process.exit(1);
	});

	// Schedule background updater even when a command throws
	const bundlePath = resolveOwnBundlePath(FLOW_BUNDLE_NAME, fileURLToPath(import.meta.url));
	try {
		await program.parseAsync(process.argv);
	} finally {
		// VERSION lets shared-cli refuse to spawn for a dev build (no mutating npm install -g from a repo checkout; incident 2026-10-25).
		updateManager.scheduleBackgroundUpdate(bundlePath, 'flow-updater.cjs', VERSION);
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
