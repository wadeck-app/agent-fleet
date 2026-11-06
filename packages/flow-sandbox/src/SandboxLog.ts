/**
 * Where the sandbox layer reports what it did (credential issuance, rule changes, refused requests).
 * Injected so the wrapper decides where the lines go (daemon log) and tests can read them.
 * Messages never carry a secret, a credential or a bearer value.
 */
export interface SandboxLog {
	info(message: string): void;
	warn(message: string): void;
}
