#!/usr/bin/env node

/**
 * CJS-compatible entry point for the Go launcher.
 * FlowIndex.ts uses a top-level `await` which is not supported in CJS output.
 * This wrapper avoids TLA by using `void (async () => { ... })()`.
 * `createRequire(__filename)` is used instead of `createRequire(import.meta.url)`
 * since `__filename` is always available in CJS context.
 */
import { Command } from 'commander';
import { createRequire } from 'module';

import { registerDocsCommand } from './commands/DocsCommand';
import { registerRunCommand } from './commands/RunCommand';
import { registerShowCommand } from './commands/ShowCommand';
import { registerValidateCommand } from './commands/ValidateCommand';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const version: string = (createRequire(__filename)('../../package.json') as { version: string }).version;

const program = new Command();
program.name('flow').version(version).description('CLI for running and validating agent flows');

registerDocsCommand(program);
registerShowCommand(program);
registerValidateCommand(program);
registerRunCommand(program);

// Wrap in async IIFE -- avoids top-level await (incompatible with CJS output)
void (async () => {
	await program.parseAsync(process.argv);
})();
