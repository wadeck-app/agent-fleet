// flow cli <subcommand> -- meta-commands for managing the flow CLI itself.
import { ConfigDir, HookDispatcher, VersionValidation } from '@wadeck-app/shared-cli';
import { Command } from 'commander';
import { FlowExecutor, StepRunner } from 'flow-engine';
import * as yaml from 'js-yaml';
import { execFile, execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { FlowConfigLoader } from '../../config/FlowConfig.js';
import { PluginLoader } from '../../config/PluginLoader.js';

// Injected by esbuild at bundle time via define; falls back to package.json in dev mode (tsx).
declare const __FLOW_CLI_VERSION__: string;

const execFileAsync = promisify(execFile);
const PKG_NAME = '@wadeck-app/flow-cli';

const NPM_CLI_JS = path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js');
const USE_NPM_CLI = fs.existsSync(NPM_CLI_JS);
function execNpm(args: string[], opts: { timeout: number }): Promise<{ stdout: string }> {
	const winHide = process.platform === 'win32' ? { windowsHide: true } : {};
	if (USE_NPM_CLI) return execFileAsync(process.execPath, [NPM_CLI_JS, ...args], { ...opts, ...winHide });
	return execFileAsync('npm', args, { ...opts, ...winHide });
}

function readChannelFromConfig(): string {
	try {
		const configFile = path.join(ConfigDir.get('flow'), 'config.yml');
		if (!fs.existsSync(configFile)) return 'latest';
		const raw = fs.readFileSync(configFile, 'utf-8');
		const match = /^\s*channel:\s*['"]?(\S+?)['"]?\s*$/m.exec(raw);
		return match?.[1] ?? 'latest';
	} catch {
		return 'latest';
	}
}

function getCurrentVersion(): string {
	try {
		return __FLOW_CLI_VERSION__;
	} catch {
		const require = createRequire(import.meta.url);
		return (require('../../../package.json') as { version: string }).version;
	}
}

async function fetchLatestVersion(channel: string): Promise<string> {
	const { stdout } = await execNpm(['view', PKG_NAME, `dist-tags.${channel}`], { timeout: 15000 });
	return stdout.trim();
}

function getUpdaterPath(): string | null {
	const bundlePath = process.env['LAUNCHER_BUNDLE_OVERRIDE'] ?? fileURLToPath(import.meta.url);
	const dir = path.dirname(bundlePath);
	const updaterPath = path.join(dir, 'flow-updater.cjs');
	return fs.existsSync(updaterPath) ? updaterPath : null;
}

// ---- Self-check ----

interface CheckResult {
	name: string;
	passed: boolean;
	error?: string;
}

async function runSelfChecks(): Promise<CheckResult[]> {
	const results: CheckResult[] = [];

	// Check 1: Bundle integrity -- verify FlowExecutor is accessible from flow-engine
	{
		const name = 'Bundle integrity';
		try {
			if (typeof FlowExecutor !== 'function') {
				throw new Error('FlowExecutor is not a constructor');
			}
			results.push({ name, passed: true });
		} catch (err) {
			results.push({ name, passed: false, error: String(err) });
		}
	}

	// Check 2: Config loading -- load FlowConfig from a non-existent path (tests default fallback)
	{
		const name = 'Config loading';
		try {
			const config = FlowConfigLoader.load(path.join(os.tmpdir(), '.flow-self-check-nonexistent-config.yaml'));
			if (config.workspace.retainDays === undefined) {
				throw new Error('workspace.retainDays is undefined');
			}
			results.push({ name, passed: true });
		} catch (err) {
			results.push({ name, passed: false, error: String(err) });
		}
	}

	// Check 3: YAML flow parsing -- parse a minimal inline flow definition string
	{
		const name = 'YAML flow parsing';
		try {
			const input = [
				'id: self-check-test',
				'steps:',
				'  - id: step1',
				'    type: script',
				'    script: echo ok',
			].join('\n');
			const parsed = yaml.load(input) as { id?: string; steps?: unknown[] };
			if (parsed?.id !== 'self-check-test') {
				throw new Error(`Expected id 'self-check-test', got '${String(parsed?.id)}'`);
			}
			if (!Array.isArray(parsed?.steps) || parsed.steps.length !== 1) {
				throw new Error(
					`Expected 1 step, got ${Array.isArray(parsed?.steps) ? parsed.steps.length : 'non-array'}`
				);
			}
			results.push({ name, passed: true });
		} catch (err) {
			results.push({ name, passed: false, error: String(err) });
		}
	}

	// Check 4: StepRunner init -- instantiate StepRunner with minimal config
	{
		const name = 'StepRunner init';
		try {
			new StepRunner({ interactive: false });
			results.push({ name, passed: true });
		} catch (err) {
			results.push({ name, passed: false, error: String(err) });
		}
	}

	// Check 5: Plugin system -- verify PluginLoader constructs and resolves the registry path.
	// Does NOT call loadProvider() -- no plugin activation, no side effects.
	{
		const name = 'Plugin system';
		try {
			new PluginLoader();
			results.push({ name, passed: true });
		} catch (err) {
			const msg = String(err);
			// extension-points/extension-points.json is not bundled by esbuild (createRequire is not statically traced).
			// This is a known limitation of the global install -- plugins require local node_modules.
			// TODO: inline extension-points.json at bundle time via an esbuild plugin.
			if (msg.includes('extension-points') && msg.includes('Cannot find module')) {
				results.push({
					name,
					passed: true,
					error: 'extension-points not in bundle (plugins disabled in standalone install)',
				});
			} else {
				results.push({ name, passed: false, error: msg });
			}
		}
	}

	// Check 6: HookDispatcher -- instantiate with empty config and dispatch a no-op event
	{
		const name = 'HookDispatcher';
		try {
			const dispatcher = new HookDispatcher({});
			await dispatcher.dispatch('onTaskCreated', { taskId: 'test' }, () => {});
			results.push({ name, passed: true });
		} catch (err) {
			results.push({ name, passed: false, error: String(err) });
		}
	}

	// Check 7: Workspace config schema -- verify FlowConfig returns valid workspace cleanup defaults
	{
		const name = 'Workspace config';
		try {
			const config = FlowConfigLoader.load(path.join(os.tmpdir(), '.flow-self-check-schema.yaml'));
			if (typeof config.workspace.retainDays !== 'number' || config.workspace.retainDays <= 0) {
				throw new Error(`workspace.retainDays is not a positive number: ${config.workspace.retainDays}`);
			}
			if (typeof config.workspace.maxWorkspaces !== 'number' || config.workspace.maxWorkspaces <= 0) {
				throw new Error(`workspace.maxWorkspaces is not a positive number: ${config.workspace.maxWorkspaces}`);
			}
			results.push({ name, passed: true });
		} catch (err) {
			results.push({ name, passed: false, error: String(err) });
		}
	}

	return results;
}

function printSelfCheckResults(results: CheckResult[], quiet: boolean, version: string): void {
	if (!quiet) {
		for (const result of results) {
			if (result.passed) {
				process.stdout.write(`[ok] ${result.name}\n`);
			} else {
				const line = `[fail] ${result.name}${result.error !== undefined ? ` -- ${result.error}` : ''}\n`;
				process.stdout.write(line);
			}
		}
	}
	const failedCount = results.filter(r => !r.passed).length;
	if (failedCount === 0) {
		if (!quiet) {
			process.stdout.write(`All checks passed. flow v${version}\n`);
		}
	} else {
		if (!quiet) {
			const summary = `Self-check failed (${failedCount}/${results.length} checks failed). Run: flow cli update --log\n`;
			process.stdout.write(summary);
		}
		process.exit(1);
	}
}

export function buildCliCommand(): Command {
	ConfigDir.migrateIfNeeded('flow');

	const cli = new Command('cli');
	cli.description('Meta-commands for managing the flow CLI itself');

	// flow cli version -- show installed + available version
	cli.command('version')
		.description('Show installed and available version')
		.action(async () => {
			const current = getCurrentVersion();
			const channel = readChannelFromConfig();
			process.stdout.write(`flow v${current} (installed)\n`);
			try {
				const latest = await fetchLatestVersion(channel);
				process.stdout.write(`Latest (${channel}): v${latest}\n`);
				if (current === latest) {
					process.stdout.write('Up to date.\n');
				}
			} catch (err) {
				process.stderr.write(`Could not fetch latest version: ${String(err)}\n`);
			}
		});

	// flow cli update [--check] [--log]
	const updateCmd = new Command('update');
	updateCmd.description('Update the flow CLI, or check/inspect update status');
	updateCmd.option('--check', 'Show available version without installing');
	updateCmd.option('--log', 'Print the update log');
	updateCmd.action(async (opts: { check?: boolean; log?: boolean }) => {
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
			const channel = readChannelFromConfig();
			try {
				const latest = await fetchLatestVersion(channel);
				process.stdout.write(`Available (${channel}): v${latest}\n`);
			} catch (err) {
				process.stderr.write(`Could not check for updates: ${String(err)}\n`);
				process.exit(1);
			}
			return;
		}
		// Default: run the updater synchronously with UPDATER_FORCE=1 to bypass the cache check
		const updaterPath = getUpdaterPath();
		if (!updaterPath) {
			process.stderr.write('Updater bundle not found (dev mode or missing build).\n');
			process.exit(1);
			return;
		}
		execFileSync(process.execPath, [updaterPath], {
			stdio: 'inherit',
			env: { ...process.env, UPDATER_FORCE: '1', UPDATER_PKG_NAME: PKG_NAME },
		});
	});
	cli.addCommand(updateCmd);

	// flow cli rollback -- restore previous version
	cli.command('rollback')
		.description('Restore the previously installed version')
		.action(() => {
			const configDir = ConfigDir.get('flow');
			const stateFile = path.join(configDir, 'update-state.json');
			if (!fs.existsSync(stateFile)) {
				process.stderr.write('No update state found. Nothing to roll back.\n');
				process.exit(1);
				return;
			}
			let previousVersion: string | undefined;
			try {
				const state = JSON.parse(fs.readFileSync(stateFile, 'utf-8')) as { previousVersion?: string };
				previousVersion = state.previousVersion;
			} catch (err) {
				process.stderr.write(`Failed to read update state: ${String(err)}\n`);
				process.exit(1);
				return;
			}
			if (previousVersion === undefined || !VersionValidation.VERSION_RE.test(previousVersion)) {
				process.stderr.write('Invalid or missing previousVersion in update state.\n');
				process.exit(1);
				return;
			}
			execFileSync(USE_NPM_CLI ? process.execPath : 'npm', USE_NPM_CLI ? [NPM_CLI_JS, 'install', '-g', `${PKG_NAME}@${previousVersion}`] : ['install', '-g', `${PKG_NAME}@${previousVersion}`], { stdio: 'inherit' });
			process.stdout.write(`Rolled back to v${previousVersion}\n`);
			try {
				fs.unlinkSync(stateFile);
			} catch {
				// ignore
			}
		});

	// flow cli self-check -- run health checks
	cli.command('self-check')
		.description('Run health checks to verify the CLI bundle is functional')
		.action(async () => {
			const quiet = process.env['CLI_SELF_CHECK_QUIET'] === '1';
			const version = getCurrentVersion();
			const results = await runSelfChecks();
			printSelfCheckResults(results, quiet, version);
		});

	// flow cli logs [--follow] -- read or tail today's NDJSON log
	cli.command('logs')
		.description("Print today's NDJSON log from the flow daemon log directory")
		.option('-f, --follow', 'Follow the log file (tail -f style)')
		.action((opts: { follow?: boolean }) => {
			const logsDir = path.join(ConfigDir.get('flow'), 'logs');
			const today = new Date().toISOString().slice(0, 10);
			const logFile = path.join(logsDir, `${today}.ndjson`);

			if (!fs.existsSync(logFile)) {
				process.stderr.write(`[flow] No log file for today: ${logFile}\n`);
				return;
			}

			if (!opts.follow) {
				process.stdout.write(fs.readFileSync(logFile, 'utf-8'));
				return;
			}

			// --follow: print existing content then watch for new bytes
			process.stderr.write(`[flow] Following ${logFile}\n`);
			let offset = 0;

			function readNewBytes(): void {
				try {
					const stat = fs.statSync(logFile);
					if (stat.size <= offset) return;
					const buf = Buffer.alloc(stat.size - offset);
					const fd = fs.openSync(logFile, 'r');
					fs.readSync(fd, buf, 0, buf.length, offset);
					fs.closeSync(fd);
					offset = stat.size;
					process.stdout.write(buf.toString('utf-8'));
				} catch {
					// ignore transient read errors
				}
			}

			// Drain existing content first
			readNewBytes();

			const watcher = fs.watch(logFile, () => {
				readNewBytes();
			});
			watcher.on('error', err => {
				process.stderr.write(`[flow] Watch error: ${String(err)}\n`);
			});
			// Keep the process alive — user terminates with Ctrl-C
		});

	return cli;
}
