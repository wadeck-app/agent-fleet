export interface CommandRunRequest {
	/** Executable name or path. Never interpreted by a shell. */
	command: string;
	args: readonly string[];
	/** Environment of the child. Default: the environment of this process. */
	env?: NodeJS.ProcessEnv;
	/** The child is killed and the run rejects with a SandboxError of kind `timeout` when it takes longer. */
	timeoutMs: number;
}

export interface CommandRunResult {
	/** Exit code of the child. A non-zero code is a result, not an error. */
	exitCode: number;
	stdout: string;
	stderr: string;
}

/**
 * Runs a host command to completion. Injected wherever the sandbox layer needs a host tool (the AWS CLI),
 * so tests script the outputs without spawning anything.
 * Implementations reject with a SandboxError of kind `binary-missing` when the executable cannot be started
 * and of kind `timeout` when the time limit is exceeded.
 */
export interface CommandRunner {
	run(request: CommandRunRequest): Promise<CommandRunResult>;
}
