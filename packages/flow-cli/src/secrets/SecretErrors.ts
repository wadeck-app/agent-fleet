import { MIN_SECRET_LENGTH } from './SecretMasker';

/** What a secret reference can be, repeated in every message that refuses one. */
export const ACCEPTED_REFERENCES = 'env://VARIABLE_NAME or file://./relative/path';

/** Base of every failure to turn a declared secret into a value. */
export class SecretResolutionError extends Error {
	constructor(
		message: string,
		/** Name of the declared secret input. Never its value. */
		readonly secretName: string
	) {
		super(message);
		this.name = new.target.name;
	}
}

/** The reference is well-formed but yields nothing (variable unset or empty, file missing or empty). */
export class SecretUnresolvedError extends SecretResolutionError {}

/** The reference itself is refused (unsupported scheme, literal, absolute path, traversal). */
export class SecretSourceError extends SecretResolutionError {}

/** The resolved value is below the minimum that can be masked reliably. */
export class SecretTooShortError extends SecretResolutionError {
	constructor(secretName: string, reference: string) {
		super(
			`Secret '${secretName}' (from ${reference}) is shorter than ${MIN_SECRET_LENGTH} characters. ` +
				`Masking such a short value would destroy unrelated output and it is easy to guess: ` +
				`use a value of at least ${MIN_SECRET_LENGTH} characters.`,
			secretName
		);
	}
}

/** Every secret that could not be resolved for one run, reported together. */
export class SecretsResolutionFailedError extends Error {
	constructor(readonly failures: readonly SecretResolutionError[]) {
		super(
			`${failures.length} secret(s) could not be resolved, the flow was not started:\n` +
				failures.map(failure => `  - ${failure.message}`).join('\n')
		);
		this.name = 'SecretsResolutionFailedError';
	}
}
