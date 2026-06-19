import { Command } from 'commander';

import { registerDocsCommand } from './commands/DocsCommand.js';
import { registerRunCommand } from './commands/RunCommand.js';
import { registerShowCommand } from './commands/ShowCommand.js';
import { registerValidateCommand } from './commands/ValidateCommand.js';

const program = new Command();

program.name('flow').version('1.0.0').description('CLI for running and validating agent flows');

registerDocsCommand(program);
registerShowCommand(program);
registerValidateCommand(program);
registerRunCommand(program);

await program.parseAsync(process.argv);
