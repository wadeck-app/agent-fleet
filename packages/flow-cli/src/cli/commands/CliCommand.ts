// flow cli <subcommand> -- meta-commands for managing the flow CLI itself.
import { ConfigDir, HookDispatcher, runSelfCheck } from '@wadeck-app/shared-cli';
import { readChannelFromConfig } from '@wadeck-app/shared-cli/ChannelConfig';
import {
	cliRollbackCommand,
	cliUpdateCommand,
	cliVersionCommand,
	warnUnknownArgs,
} from '@wadeck-app/shared-cli/CliMetaCommands';
import { devBuildRefusalMessage, isReleaseVersion } from '@wadeck-app/shared-cli/ReleaseVersion';
import { resolveOwnBundlePath } from '@wadeck-app/shared-cli/resolveOwnBundlePath';
import { Command } from 'commander';
import { FLOW_CONFIG_DIR_NAME, InvalidQueryError, createRemoteDaemonClient } from 'flow-core';
import { FlowExecutor, StepRunner } from 'flow-engine';
import * as yaml from 'js-yaml';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeError } from 'shared-common/utils/getErrorMessage';

// violations-suppress-start: ts/no-deep-relative no path alias configured for intra-package imports in flow-cli
import { FlowConfigLoader } from '../../config/FlowConfig.js';
import { flowConfigDir } from '../../config/FlowConfigDir.js';
import { PluginLoader } from '../../config/PluginLoader.js';
import { FLOW_BUNDLE_NAME } from '../FlowBundleName.js';
// violations-suppress-end: ts/no-deep-relative
import { classifyDaemonContactFailure, DAEMON_TIMEOUT_TEXT } from './DaemonContactFailure';
import { logsCommand } from './LogsCommand.js';
import { buildProcessesCommand } from './ProcessesCommand.js';

// Injected by esbuild at bundle time via define; falls back to package.json in dev mode (tsx).
declare const __FLOW_CLI_VERSION__: string;

const PKG_NAME = '@wadeck-app/flow-cli';

/**
 * Asks the running daemon to start/stop refusing new runs (see CommandHandler.setDraining).
 * No daemon running is not an error: there is nothing to drain or cancel.
 */
async function setDaemonDraining(draining: boolean): Promise<void> {
	try {
		const client = createRemoteDaemonClient<{ setDraining?: (payload?: unknown) => Promise<unknown> }>(
			flowConfigDir()
		);
		await client.send('setDraining', { draining });
	} catch (err) {
		const kind = classifyDaemonContactFailure(err);
		// A timeout means the daemon may hold state and may have applied the request: never "update directly".
		if (kind === 'timeout') {
			process.stderr.write(
				`[fail] Could not ${draining ? 'start' : 'cancel'} draining: ${DAEMON_TIMEOUT_TEXT}\n` +
					'       The update was not started.\n'
			);
			process.exit(1);
		}
		if (kind === 'not-running') {
			process.stdout.write(
				draining
					? '[ok] No daemon is running, so there is nothing to drain; updating directly.\n'
					: '[ok] No daemon is running, so there is no drain to cancel.\n'
			);
			return;
		}
		process.stderr.write(
			`[fail] Could not ${draining ? 'start' : 'cancel'} draining: ${normalizeError(err).message}\n` +
				'       Check the daemon with: flow daemon status\n'
		);
		process.exit(1);
	}
	process.stdout.write(
		draining
			? '[ok] Daemon is draining: new flow runs are refused until the update applies. Running executions continue.\n' +
					'     Changed your mind? Run: flow cli update --cancel-drain\n'
			: '[ok] Drain cancelled: the daemon accepts new flow runs again.\n'
	);
}

function getCurrentVersion(): string {
	try {
		return __FLOW_CLI_VERSION__;
	} catch {
		const require = createRequire(import.meta.url);
		return (require('../../../package.json') as { version: string }).version;
	}
}

function getUpdaterPath(): string | null {
	const bundlePath = resolveOwnBundlePath(FLOW_BUNDLE_NAME, fileURLToPath(import.meta.url));
	const dir = path.dirname(bundlePath);
	const updaterPath = path.join(dir, 'flow-updater.cjs');
	return fs.existsSync(updaterPath) ? updaterPath : null;
}

// ---- Self-check ----

// Checks are defined inline in the self-check command action below.

export function buildCliCommand(): Command {
	ConfigDir.migrateIfNeeded(FLOW_CONFIG_DIR_NAME);

	const cli = new Command('cli');
	cli.description('Meta-commands for managing the flow CLI itself');

	// flow cli version -- show installed + available version
	cli.command('version')
		.description('Show installed and available version')
		.action(async () => {
			const current = getCurrentVersion();
			const channel = readChannelFromConfig(flowConfigDir());
			await cliVersionCommand(PKG_NAME, current, channel);
		});

	// flow cli update [--check] [--log]
	const updateCmd = new Command('update');
	updateCmd.description('Update the flow CLI, or check/inspect update status');
	updateCmd.option('--check', 'Show available version without installing');
	updateCmd.option('--log', 'Print the update log');
	updateCmd.option(
		'--drain',
		'Refuse new flow runs until the update applies, so running executions can finish and the update is not deferred forever'
	);
	updateCmd.option('--cancel-drain', 'Stop refusing new flow runs (undo --drain)');
	updateCmd.allowUnknownOption(false);
	updateCmd.action(
		async (opts: { check?: boolean; log?: boolean; drain?: boolean; cancelDrain?: boolean }, cmd: Command) => {
			const rawArgs = cmd.args;
			warnUnknownArgs(
				rawArgs.filter(a => a.startsWith('-')),
				['--check', '--log', '--drain', '--cancel-drain'],
				'flow cli update'
			);
			if (opts.cancelDrain) {
				await setDaemonDraining(false);
				return;
			}
			if (opts.log) {
				const logFile = path.join(flowConfigDir(), 'update-log.txt');
				if (fs.existsSync(logFile)) {
					process.stdout.write(fs.readFileSync(logFile, 'utf-8'));
				} else {
					process.stdout.write('No update log found.\n');
				}
				return;
			}
			if (opts.check) {
				const current = getCurrentVersion();
				const channel = readChannelFromConfig(flowConfigDir());
				await cliVersionCommand(PKG_NAME, current, channel);
				return;
			}
			// Before anything with a side effect (drain, spawn): a repo-built bundle must never touch the global install.
			const currentVersion = getCurrentVersion();
			if (!isReleaseVersion(currentVersion)) {
				process.stderr.write(`[flow] ${devBuildRefusalMessage('flow', currentVersion)}\n`);
				process.exit(1);
				return;
			}
			const updaterPath = getUpdaterPath();
			if (!updaterPath) {
				process.stderr.write('Updater bundle not found (dev mode or missing build).\n');
				process.exit(1);
				return;
			}
			if (opts.drain) {
				await setDaemonDraining(true);
			}
			// Flag manual invocation so the updater bypasses autoUpdate:false in config
			process.env['UPDATER_MANUAL'] = '1';
			await cliUpdateCommand(updaterPath, PKG_NAME);
			delete process.env['UPDATER_MANUAL'];
		}
	);
	cli.addCommand(updateCmd);

	// flow cli rollback -- restore previous version
	cli.command('rollback')
		.description('Restore the previously installed version')
		.action(async () => {
			await cliRollbackCommand(PKG_NAME, flowConfigDir());
		});

	// flow cli self-check -- run health checks
	cli.command('self-check')
		.description('Run health checks to verify the CLI bundle is functional')
		.action(async () => {
			await runSelfCheck([
				// Check 1: Bundle integrity -- verify FlowExecutor is accessible from flow-engine
				async () => {
					try {
						if (typeof FlowExecutor !== 'function') {
							throw new Error('FlowExecutor is not a constructor');
						}
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
						if (config.workspace.retainDays === undefined) {
							throw new Error('workspace.retainDays is undefined');
						}
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
						if (parsed?.id !== 'self-check-test') {
							throw new Error(`Expected id 'self-check-test', got '${String(parsed?.id)}'`);
						}
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
			try {
				await logsCommand(flowConfigDir(), {
					follow: opts.follow ?? false,
					human: opts.human ?? false,
					lines: parseInt(opts.lines ?? '50', 10),
				});
			} catch (err) {
				if (!(err instanceof InvalidQueryError)) {
					throw err;
				}
				const message = normalizeError(err).message;
				process.stderr.write(`${message}\n`);
				process.exit(1);
			}
		});

	// flow cli processes [--json] -- read-only list of flow processes, to spot leaked daemons/workers
	cli.addCommand(buildProcessesCommand());

	return cli;
}
