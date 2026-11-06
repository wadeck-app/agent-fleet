import { type LeftoverSandboxes, formatAge } from './LeftoverSandboxes';
import { SandboxError } from './SandboxError';

/** The presence directory the check of "is that run alive?" reads; if it does not exist, nothing is known about the wrappers. */
export interface PresenceDirectoryStatus {
	directory: string;
	exists(): boolean;
}

export interface CommandOutput {
	out(line: string): void;
	err(line: string): void;
}

export const LEFTOVER_EXIT_OK = 0;
export const LEFTOVER_EXIT_FAILED = 1;
export const LEFTOVER_EXIT_USAGE = 2;

const USAGE = [
	'Usage: leftover list',
	'       leftover remove <sandbox-name> [--force]',
	'',
	'list    shows the plugin sandboxes (name flow-sbx-<wrapperId>-<executionId>) with status and age.',
	'remove  removes exactly that sandbox; refused when its run or wrapper is alive or the name has no marker,',
	'        and when the presence directory does not exist (--force overrides that one refusal).',
	'The presence directory is FLOW_SANDBOX_PRESENCE_DIR, else ~/.config/flow/sandbox-presence: the one the wrappers use.',
	'Exit codes: 0 done, 1 refused or failed, 2 usage error.',
];

/** `leftover list|remove <name>`: argument handling and output for the script in scripts/LeftoverCli.mjs. */
export class LeftoverCommand {
	constructor(
		private readonly leftovers: LeftoverSandboxes,
		private readonly output: CommandOutput,
		private readonly presence: PresenceDirectoryStatus
	) {}

	async run(args: readonly string[]): Promise<number> {
		const [verb, ...rest] = args;
		if (verb === 'list' && rest.length === 0) return this.guard(() => this.list());
		const force = rest.length === 2 && rest[1] === '--force';
		if (verb === 'remove' && (rest.length === 1 || force) && rest[0] !== undefined && !rest[0].startsWith('-')) {
			const name = rest[0];
			return this.guard(() => this.remove(name, force));
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
		this.warnIfPresenceMissing();
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

	private async remove(name: string, force: boolean): Promise<number> {
		if (!this.presence.exists()) {
			this.warnIfPresenceMissing();
			if (!force) {
				this.output.err(
					`Refusing to remove "${name}": without the presence files a live wrapper cannot be told from a dead one. Point FLOW_SANDBOX_PRESENCE_DIR at the directory your wrappers use, or add --force if you know no wrapper serves this run.`
				);
				return LEFTOVER_EXIT_FAILED;
			}
		}
		await this.leftovers.remove(name);
		this.output.out(`Removed ${name}.`);
		return LEFTOVER_EXIT_OK;
	}

	private warnIfPresenceMissing(): void {
		if (this.presence.exists()) return;
		this.output.err(
			`warning: the presence directory ${this.presence.directory} does not exist, so no wrapper is known to be alive. Wrong directory? Set FLOW_SANDBOX_PRESENCE_DIR to the one your wrappers use (--presence-dir).`
		);
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
