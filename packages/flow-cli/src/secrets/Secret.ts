export const REDACTED = '[REDACTED]';

/**
 * Wraps a sensitive string value so it never leaks into logs, JSON, or error messages.
 * Plaintext is only accessible via .use().
 */
export class Secret {
	readonly #value: string;

	constructor(value: string) {
		this.#value = value;
	}

	use(): string {
		return this.#value;
	}

	toString(): string {
		return REDACTED;
	}

	toJSON(): string {
		return REDACTED;
	}

	[Symbol.toPrimitive](): string {
		return REDACTED;
	}

	[Symbol.for('nodejs.util.inspect.custom')](): string {
		return REDACTED;
	}
}
