#!/usr/bin/env node
import { UpdateManager } from '@wadeck/shared-cli';
import { Command } from 'commander';
import { fileURLToPath } from 'node:url';

import { buildCliCommand } from './commands/CliCommand.js';
import { registerDocsCommand } from './commands/DocsCommand';
import { registerHistoryCommand } from './commands/HistoryCommand';
import { registerRunCommand } from './commands/RunCommand';
import { registerShowCommand } from './commands/ShowCommand';
import { registerValidateCommand } from './commands/ValidateCommand';
import { VERSION } from './version.js';

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

	const program = new Command();
	program.name('flow').version(VERSION).description('CLI for running and validating agent flows');

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
