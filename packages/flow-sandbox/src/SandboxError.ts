/**
 * Every failure of the sandbox layer. `kind` is the machine-readable discriminator callers branch on;
 * `message` is written for the person reading the log and always says what to do next.
 */
export type SandboxErrorKind =
	/** The sbx executable cannot be found or started. */
	| 'binary-missing'
	/** The installed sbx is not the pinned version. */
	| 'version-mismatch'
	/** The named sandbox does not exist. */
	| 'not-found'
	/** A sandbox with that name already exists. */
	| 'already-exists'
	/** The caller passed something this layer refuses to turn into a command line. */
	| 'invalid-argument'
	/** sbx ran and exited non-zero. */
	| 'command-failed'
	/** sbx printed something this code cannot read (format changed or truncated). */
	| 'output-unparsable'
	/** The caller's AbortSignal fired. */
	| 'aborted'
	/** The command exceeded its time limit and was killed. */
	| 'timeout'
	/** A path left the mounts it must stay inside. */
	| 'path-outside-mounts'
	/** Options failed validation. */
	| 'invalid-options'
	/** The worker already holds a sandbox for another run (or a step of this run is still active). */
	| 'worker-busy'
	/** Starting one more sandbox would exceed maxConcurrentSandboxes. */
	| 'capacity-exceeded'
	/** The run already received its end-of-run event; no sandbox is created or restarted for it. */
	| 'run-ended'
	/** A removal was refused (not a plugin sandbox, run or wrapper alive). */
	| 'removal-refused';

export interface SandboxErrorDetails {
	cause?: unknown;
	sandbox?: string;
	/** Argument array of the failed command (secrets are never part of it, see SbxCliRuntime). */
	argv?: readonly string[];
	exitCode?: number | null;
	stderr?: string;
}

export class SandboxError extends Error {
	readonly kind: SandboxErrorKind;
	readonly sandbox: string | undefined;
	readonly argv: readonly string[] | undefined;
	readonly exitCode: number | null | undefined;
	readonly stderr: string | undefined;

	constructor(kind: SandboxErrorKind, message: string, details: SandboxErrorDetails = {}) {
		super(message, details.cause === undefined ? undefined : { cause: details.cause });
		this.name = 'SandboxError';
		this.kind = kind;
		this.sandbox = details.sandbox;
		this.argv = details.argv;
		this.exitCode = details.exitCode;
		this.stderr = details.stderr;
	}
}
