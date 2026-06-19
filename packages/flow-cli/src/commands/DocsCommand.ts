import type { Command } from 'commander';
import { FlowCapabilitiesGenerator } from 'flow-engine';
import * as fs from 'fs';

export function registerDocsCommand(program: Command): void {
	program
		.command('docs')
		.description('Print flow engine capabilities documentation')
		.option('-o, --output <file>', 'Write output to a file instead of stdout')
		.action((options: { output?: string }) => {
			const generator = new FlowCapabilitiesGenerator();
			const content = generator.generate();

			if (options.output) {
				fs.writeFileSync(options.output, content, 'utf-8');
				console.log(`✓ Docs written to ${options.output}`);
			} else {
				process.stdout.write(content + '\n');
			}
		});
}
