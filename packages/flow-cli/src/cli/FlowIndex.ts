#!/usr/bin/env node
import { Command } from 'commander';
import { createRequire } from 'module';
import { fileURLToPath } from 'node:url';
import { UpdateManager } from 'shared-cli/index';

import { buildCliCommand } from './commands/CliCommand.js';
import { registerDocsCommand } from './commands/DocsCommand';
import { registerHistoryCommand } from './commands/HistoryCommand';
import { registerRunCommand } from './commands/RunCommand';
import { registerShowCommand } from './commands/ShowCommand';
import { registerValidateCommand } from './commands/ValidateCommand';

// Injected by esbuild at bundle time via define; falls back to package.json in dev mode (tsx).
declare const __FLOW_CLI_VERSION__: string;

async function main(): Promise<void> {
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

	let version: string;
	try {
		version = __FLOW_CLI_VERSION__;
	} catch {
		const require = createRequire(import.meta.url);
		// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
		version = (require('../../package.json') as { version: string }).version;
	}

	const program = new Command();
	program.name('flow').version(version).description('CLI for running and validating agent flows');

	registerDocsCommand(program);
	registerShowCommand(program);
	registerValidateCommand(program);
	registerRunCommand(program);
	registerHistoryCommand(program);
	program.addCommand(buildCliCommand());

	await program.parseAsync(process.argv);

	// Schedule background updater after command completes
	const bundlePath = process.env['LAUNCHER_BUNDLE_OVERRIDE'] ?? fileURLToPath(import.meta.url);
	updateManager.scheduleBackgroundUpdate(bundlePath, 'flow-updater.cjs');
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
