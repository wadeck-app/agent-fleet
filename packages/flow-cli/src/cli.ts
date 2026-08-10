import { createRequire } from 'module';
import { Command } from 'commander';

import { registerDocsCommand } from './commands/DocsCommand.js';
import { registerRunCommand } from './commands/RunCommand.js';
import { registerShowCommand } from './commands/ShowCommand.js';
import { registerValidateCommand } from './commands/ValidateCommand.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
const version: string = (require('../../package.json') as { version: string }).version;

const program = new Command();

program.name('flow').version(version).description('CLI for running and validating agent flows');

registerDocsCommand(program);
registerShowCommand(program);
registerValidateCommand(program);
registerRunCommand(program);

await program.parseAsync(process.argv);
