import { type LeftoverSandboxes, formatAge } from './LeftoverSandboxes';
import { SandboxError } from './SandboxError';

export interface CommandOutput {
	out(line: string): void;
	err(line: string): void;
}

export const LEFTOVER_EXIT_OK = 0;
export const LEFTOVER_EXIT_FAILED = 1;
export const LEFTOVER_EXIT_USAGE = 2;

const USAGE = [
	'Usage: leftover list',
	'       leftover remove <sandbox-name>',
	'',
	'list    shows the plugin sandboxes (name flow-sbx-<wrapperId>-<executionId>) with status and age.',
	'remove  removes exactly that sandbox; refused when its run or wrapper is alive or the name has no marker.',
	'Exit codes: 0 done, 1 refused or failed, 2 usage error.',
];

/** `leftover list|remove <name>`: argument handling and output for the script in scripts/LeftoverCli.mjs. */
export class LeftoverCommand {
	constructor(
		private readonly leftovers: LeftoverSandboxes,
		private readonly output: CommandOutput
	) {}

	async run(args: readonly string[]): Promise<number> {
		const [verb, ...rest] = args;
		if (verb === 'list' && rest.length === 0) return this.guard(() => this.list());
		if (verb === 'remove' && rest.length === 1 && rest[0] !== undefined && !rest[0].startsWith('-')) {
			const name = rest[0];
			return this.guard(() => this.remove(name));
		}
		this.output.err(
			verb === undefined
				? 'Missing command.'
				: `Unknown or incomplete command "${args.join(' ')}". "remove" takes exactly one exact sandbox name (no pattern, no option).`
		);
		for (const line of USAGE) this.output.err(line);
		return LEFTOVER_EXIT_USAGE;
	}

	private async list(): Promise<number> {
		const leftovers = await this.leftovers.list();
		if (leftovers.length === 0) {
			this.output.out('No plugin sandboxes.');
			return LEFTOVER_EXIT_OK;
		}
		this.output.out('NAME\tWRAPPER\tRUN\tSTATUS\tAGE');
		for (const leftover of leftovers) {
			this.output.out(
				[
					leftover.name,
					leftover.wrapperId,
					leftover.executionId,
					leftover.status,
					formatAge(leftover.ageMs),
				].join('\t')
			);
		}
		return LEFTOVER_EXIT_OK;
	}

	private async remove(name: string): Promise<number> {
		await this.leftovers.remove(name);
		this.output.out(`Removed ${name}.`);
		return LEFTOVER_EXIT_OK;
	}

	private async guard(action: () => Promise<number>): Promise<number> {
		try {
			return await action();
		} catch (error) {
			const prefix = error instanceof SandboxError ? `${error.kind}: ` : '';
			this.output.err(`${prefix}${error instanceof Error ? error.message : String(error)}`);
			return LEFTOVER_EXIT_FAILED;
		}
	}
}
