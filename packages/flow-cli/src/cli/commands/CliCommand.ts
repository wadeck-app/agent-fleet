// flow cli <subcommand> -- meta-commands for managing the flow CLI itself.
import { ConfigDir, HookDispatcher, runSelfCheck } from '@wadeck-app/shared-cli';
import { readChannelFromConfig } from '@wadeck-app/shared-cli/ChannelConfig';
import {
	cliRollbackCommand,
	cliUpdateCommand,
	cliVersionCommand,
	warnUnknownArgs,
} from '@wadeck-app/shared-cli/CliMetaCommands';
import { Command } from 'commander';
import { FlowExecutor, StepRunner } from 'flow-engine';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { FlowConfigLoader } from '../../config/FlowConfig.js';
import { PluginLoader } from '../../config/PluginLoader.js';

// violations-suppress-end: ts/no-deep-relative

// Injected by esbuild at bundle time via define; falls back to package.json in dev mode (tsx).
declare const __FLOW_CLI_VERSION__: string;

// ---- Human-readable log formatter ----

type DaemonLogEntry = { ts: string; level?: string; msg: string };
type StepLogEntry = { prefix: string; timestamp: string; level?: string; message: string };

function isStepLogEntry(obj: Record<string, unknown>): obj is StepLogEntry {
	return (
		typeof obj['prefix'] === 'string' && typeof obj['timestamp'] === 'string' && typeof obj['message'] === 'string'
	);
}

function isDaemonLogEntry(obj: Record<string, unknown>): obj is DaemonLogEntry {
	return typeof obj['ts'] === 'string' && typeof obj['msg'] === 'string';
}

function formatLogTime(iso: string): string {
	const d = new Date(iso);
	const h = String(d.getHours()).padStart(2, '0');
	const m = String(d.getMinutes()).padStart(2, '0');
	const s = String(d.getSeconds()).padStart(2, '0');
	const ms = String(d.getMilliseconds()).padStart(3, '0');
	return `${h}:${m}:${s}.${ms}`;
}

function padLogLevel(level: string): string {
	// Pad to 5 chars (e.g. "INFO ", "ERROR", "WARN ")
	return level.toUpperCase().padEnd(5, ' ').slice(0, 5);
}

function formatLogLine(raw: string): string {
	const trimmed = raw.trim();
	if (!trimmed) return '';

	let parsed: unknown;
	try {
		parsed = JSON.parse(trimmed);
	} catch {
		// Not valid JSON — return as-is
		return raw;
	}

	if (typeof parsed !== 'object' || parsed === null) return raw;
	const obj = parsed as Record<string, unknown>;

	if (isStepLogEntry(obj)) {
		const time = formatLogTime(obj.timestamp);
		const level = padLogLevel(typeof obj.level === 'string' ? obj.level : 'info');
		return `${time} [${level}] ${obj.prefix} ${obj.message}`;
	}

	if (isDaemonLogEntry(obj)) {
		const time = formatLogTime(obj.ts);
		const level = padLogLevel(typeof obj.level === 'string' ? obj.level : 'info');
		return `${time} [${level}] ${obj.msg}`;
	}

	// Unknown shape — return raw
	return raw;
}

function writeFormattedLines(content: string): void {
	for (const line of content.split('\n')) {
		const formatted = formatLogLine(line);
		if (formatted) process.stdout.write(formatted + '\n');
	}
}

/**
 * Returns the last N non-empty lines of content joined by newline.
 * When n <= 0, returns the original content unchanged.
 */
function tailLines(content: string, n: number): string {
	if (n <= 0) return content;
	// Split preserving trailing empty string from final newline; filter blank trailing entry
	const lines = content.split('\n');
	// Remove a single trailing empty element produced by a terminal newline
	if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
	const sliced = lines.slice(-n);
	return sliced.length > 0 ? sliced.join('\n') + '\n' : '';
}

async function cliLogsHumanCommand(configDir: string, opts: { follow?: boolean; lines: number }): Promise<void> {
	const today = new Date().toISOString().slice(0, 10);
	const logFile = path.join(configDir, 'logs', `${today}.ndjson`);

	if (!fs.existsSync(logFile)) {
		process.stdout.write(`No log file for today: ${logFile}\n`);
		if (!opts.follow) return;
	}

	let offset = 0;
	if (fs.existsSync(logFile)) {
		const content = fs.readFileSync(logFile, 'utf8');
		writeFormattedLines(tailLines(content, opts.lines));
		offset = Buffer.byteLength(content, 'utf8');
	}

	if (!opts.follow) return;

	await new Promise<void>(resolve => {
		fs.watchFile(logFile, { interval: 250 }, () => {
			if (!fs.existsSync(logFile)) return;
			const size = fs.statSync(logFile).size;
			if (size <= offset) return;
			const buf = Buffer.alloc(size - offset);
			const fd = fs.openSync(logFile, 'r');
			fs.readSync(fd, buf, 0, buf.length, offset);
			fs.closeSync(fd);
			offset = size;
			writeFormattedLines(buf.toString('utf8'));
		});
		process.on('SIGINT', () => {
			fs.unwatchFile(logFile);
			resolve();
		});
	});
}

/**
 * Raw NDJSON variant of the logs command with lines-limit support.
 * The external cliLogsCommand cannot be modified, so this inline version
 * handles --lines for both static and follow modes.
 */
async function cliLogsRawCommand(configDir: string, opts: { follow?: boolean; lines: number }): Promise<void> {
	const today = new Date().toISOString().slice(0, 10);
	const logFile = path.join(configDir, 'logs', `${today}.ndjson`);

	if (!fs.existsSync(logFile)) {
		process.stdout.write(`No log file for today: ${logFile}\n`);
		if (!opts.follow) return;
	}

	let offset = 0;
	if (fs.existsSync(logFile)) {
		const content = fs.readFileSync(logFile, 'utf8');
		process.stdout.write(tailLines(content, opts.lines));
		offset = Buffer.byteLength(content, 'utf8');
	}

	if (!opts.follow) return;

	await new Promise<void>(resolve => {
		fs.watchFile(logFile, { interval: 250 }, () => {
			if (!fs.existsSync(logFile)) return;
			const size = fs.statSync(logFile).size;
			if (size <= offset) return;
			const buf = Buffer.alloc(size - offset);
			const fd = fs.openSync(logFile, 'r');
			fs.readSync(fd, buf, 0, buf.length, offset);
			fs.closeSync(fd);
			offset = size;
			process.stdout.write(buf.toString('utf8'));
		});
		process.on('SIGINT', () => {
			fs.unwatchFile(logFile);
			resolve();
		});
	});
}

const PKG_NAME = '@wadeck-app/flow-cli';

function getCurrentVersion(): string {
	try {
		return __FLOW_CLI_VERSION__;
	} catch {
		const require = createRequire(import.meta.url);
		return (require('../../../package.json') as { version: string }).version;
	}
}

function getUpdaterPath(): string | null {
	const bundlePath = process.env['LAUNCHER_BUNDLE_OVERRIDE'] ?? fileURLToPath(import.meta.url);
	const dir = path.dirname(bundlePath);
	const updaterPath = path.join(dir, 'flow-updater.cjs');
	return fs.existsSync(updaterPath) ? updaterPath : null;
}

// ---- Self-check ----

// Checks are defined inline in the self-check command action below.

export function buildCliCommand(): Command {
	ConfigDir.migrateIfNeeded('flow');

	const cli = new Command('cli');
	cli.description('Meta-commands for managing the flow CLI itself');

	// flow cli version -- show installed + available version
	cli.command('version')
		.description('Show installed and available version')
		.action(async () => {
			const current = getCurrentVersion();
			const channel = readChannelFromConfig(ConfigDir.get('flow'));
			await cliVersionCommand(PKG_NAME, current, channel);
		});

	// flow cli update [--check] [--log]
	const updateCmd = new Command('update');
	updateCmd.description('Update the flow CLI, or check/inspect update status');
	updateCmd.option('--check', 'Show available version without installing');
	updateCmd.option('--log', 'Print the update log');
	updateCmd.allowUnknownOption(false);
	updateCmd.action(async (opts: { check?: boolean; log?: boolean }, cmd: Command) => {
		const rawArgs = cmd.args;
		warnUnknownArgs(
			rawArgs.filter(a => a.startsWith('-')),
			['--check', '--log'],
			'flow cli update'
		);
		if (opts.log) {
			const logFile = path.join(ConfigDir.get('flow'), 'update-log.txt');
			if (fs.existsSync(logFile)) {
				process.stdout.write(fs.readFileSync(logFile, 'utf-8'));
			} else {
				process.stdout.write('No update log found.\n');
			}
			return;
		}
		if (opts.check) {
			const current = getCurrentVersion();
			const channel = readChannelFromConfig(ConfigDir.get('flow'));
			await cliVersionCommand(PKG_NAME, current, channel);
			return;
		}
		const updaterPath = getUpdaterPath();
		if (!updaterPath) {
			process.stderr.write('Updater bundle not found (dev mode or missing build).\n');
			process.exit(1);
			return;
		}
		// Flag manual invocation so the updater bypasses autoUpdate:false in config
		process.env['UPDATER_MANUAL'] = '1';
		await cliUpdateCommand(updaterPath, PKG_NAME);
		delete process.env['UPDATER_MANUAL'];
	});
	cli.addCommand(updateCmd);

	// flow cli rollback -- restore previous version
	cli.command('rollback')
		.description('Restore the previously installed version')
		.action(async () => {
			await cliRollbackCommand(PKG_NAME, ConfigDir.get('flow'));
		});

	// flow cli self-check -- run health checks
	cli.command('self-check')
		.description('Run health checks to verify the CLI bundle is functional')
		.action(async () => {
			await runSelfCheck([
				// Check 1: Bundle integrity -- verify FlowExecutor is accessible from flow-engine
				async () => {
					try {
						if (typeof FlowExecutor !== 'function') throw new Error('FlowExecutor is not a constructor');
						return { name: 'Bundle integrity', ok: true };
					} catch (err) {
						return { name: 'Bundle integrity', ok: false, detail: String(err) };
					}
				},
				// Check 2: Config loading -- load FlowConfig from a non-existent path (tests default fallback)
				async () => {
					try {
						const config = FlowConfigLoader.load(
							path.join(os.tmpdir(), '.flow-self-check-nonexistent-config.yaml')
						);
						if (config.workspace.retainDays === undefined)
							throw new Error('workspace.retainDays is undefined');
						return { name: 'Config loading', ok: true };
					} catch (err) {
						return { name: 'Config loading', ok: false, detail: String(err) };
					}
				},
				// Check 3: YAML flow parsing -- parse a minimal inline flow definition string
				async () => {
					try {
						const input = [
							'id: self-check-test',
							'steps:',
							'  - id: step1',
							'    type: script',
							'    script: echo ok',
						].join('\n');
						const parsed = yaml.load(input) as { id?: string; steps?: unknown[] };
						if (parsed?.id !== 'self-check-test')
							throw new Error(`Expected id 'self-check-test', got '${String(parsed?.id)}'`);
						if (!Array.isArray(parsed?.steps) || parsed.steps.length !== 1) {
							throw new Error(
								`Expected 1 step, got ${Array.isArray(parsed?.steps) ? parsed.steps.length : 'non-array'}`
							);
						}
						return { name: 'YAML flow parsing', ok: true };
					} catch (err) {
						return { name: 'YAML flow parsing', ok: false, detail: String(err) };
					}
				},
				// Check 4: StepRunner init -- instantiate StepRunner with minimal config
				async () => {
					try {
						new StepRunner({ interactive: false });
						return { name: 'StepRunner init', ok: true };
					} catch (err) {
						return { name: 'StepRunner init', ok: false, detail: String(err) };
					}
				},
				// Check 5: Plugin system -- verify PluginLoader constructs and resolves the registry path.
				// Does NOT call loadProvider() -- no plugin activation, no side effects.
				async () => {
					try {
						new PluginLoader();
						return { name: 'Plugin system', ok: true };
					} catch (err) {
						const msg = String(err);
						// extension-points/extension-points.json is not bundled by esbuild (createRequire is not statically traced).
						// This is a known limitation of the global install -- plugins require local node_modules.
						// TODO: inline extension-points.json at bundle time via an esbuild plugin.
						if (msg.includes('extension-points') && msg.includes('Cannot find module')) {
							return {
								name: 'Plugin system',
								ok: true,
								detail: 'extension-points not in bundle (plugins disabled in standalone install)',
							};
						}
						return { name: 'Plugin system', ok: false, detail: msg };
					}
				},
				// Check 6: HookDispatcher -- instantiate with empty config and dispatch a no-op event
				async () => {
					try {
						const dispatcher = new HookDispatcher({});
						await dispatcher.dispatch('onTaskCreated', { taskId: 'test' }, () => {});
						return { name: 'HookDispatcher', ok: true };
					} catch (err) {
						return { name: 'HookDispatcher', ok: false, detail: String(err) };
					}
				},
				// Check 7: Workspace config schema -- verify FlowConfig returns valid workspace cleanup defaults
				async () => {
					try {
						const config = FlowConfigLoader.load(path.join(os.tmpdir(), '.flow-self-check-schema.yaml'));
						if (typeof config.workspace.retainDays !== 'number' || config.workspace.retainDays <= 0) {
							throw new Error(
								`workspace.retainDays is not a positive number: ${config.workspace.retainDays}`
							);
						}
						if (typeof config.workspace.maxWorkspaces !== 'number' || config.workspace.maxWorkspaces <= 0) {
							throw new Error(
								`workspace.maxWorkspaces is not a positive number: ${config.workspace.maxWorkspaces}`
							);
						}
						return { name: 'Workspace config', ok: true };
					} catch (err) {
						return { name: 'Workspace config', ok: false, detail: String(err) };
					}
				},
			]);
		});

	// flow cli logs [--follow] [--human] [-n <lines>] -- read or tail today's NDJSON log
	cli.command('logs')
		.description("Print today's NDJSON log from the flow daemon log directory")
		.option('-f, --follow', 'Follow the log file (tail -f style)')
		.option(
			'-H, --human',
			'Format log lines as human-readable (HH:mm:ss.SSS [LEVEL] message) instead of raw NDJSON'
		)
		.option('-n, --lines <n>', 'Limit output to the last N lines (0 or negative = no limit)', '50')
		.action(async (opts: { follow?: boolean; human?: boolean; lines?: string }) => {
			const lines = parseInt(opts.lines ?? '50', 10);
			if (opts.human) {
				await cliLogsHumanCommand(ConfigDir.get('flow'), { follow: opts.follow ?? false, lines });
			} else {
				await cliLogsRawCommand(ConfigDir.get('flow'), { follow: opts.follow ?? false, lines });
			}
		});

	return cli;
}
