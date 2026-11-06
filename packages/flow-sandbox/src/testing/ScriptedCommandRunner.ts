import type { CommandRunRequest, CommandRunResult, CommandRunner } from '../CommandRunner';

export type ScriptedOutcome = CommandRunResult | Error | ((request: CommandRunRequest) => Promise<CommandRunResult>);

/**
 * A CommandRunner for tests: answers each call from a queue (or one fixed outcome) and records the requests.
 * A call with nothing left to answer throws, so a test cannot silently run more commands than it expects.
 */
export class ScriptedCommandRunner implements CommandRunner {
	readonly requests: CommandRunRequest[] = [];
	private readonly queue: ScriptedOutcome[];

	constructor(
		outcomes: readonly ScriptedOutcome[] = [],
		private readonly repeat?: ScriptedOutcome
	) {
		this.queue = [...outcomes];
	}

	async run(request: CommandRunRequest): Promise<CommandRunResult> {
		this.requests.push(request);
		const outcome = this.queue.shift() ?? this.repeat;
		if (outcome === undefined) {
			throw new Error(
				`ScriptedCommandRunner has no outcome left for call ${this.requests.length}: ${request.command} ${request.args.join(' ')}`
			);
		}
		if (outcome instanceof Error) throw outcome;
		if (typeof outcome === 'function') return outcome(request);
		return Promise.resolve(outcome);
	}
}
