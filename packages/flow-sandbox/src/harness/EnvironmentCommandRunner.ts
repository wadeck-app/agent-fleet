import type { CommandRunRequest, CommandRunResult, CommandRunner } from '../CommandRunner';

/**
 * Gives every command run through it a fixed environment (instead of the one of this process). The harness is
 * started by a daemon that may run with a redirected home directory (isolated test daemon); the AWS CLI must still
 * find the real SSO session of the person, so the wrapper is told which variables to hand to `aws`.
 */
export class EnvironmentCommandRunner implements CommandRunner {
	constructor(
		private readonly inner: CommandRunner,
		private readonly environment: NodeJS.ProcessEnv
	) {}

	run(request: CommandRunRequest): Promise<CommandRunResult> {
		return this.inner.run({ ...request, env: request.env ?? this.environment });
	}
}
