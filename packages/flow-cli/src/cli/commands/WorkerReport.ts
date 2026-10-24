export function ts(): string {
	return new Date().toISOString().slice(11, 19);
}

/**
 * Prints one prefixed line for the operator.
 *
 * The message is extracted by the caller so the printing happens in one place: what
 * reaches the terminal is an authored, actionable sentence, and for an unexpected failure
 * the detail is itself what the user needs in order to act.
 */
export function report(prefix: '[fail]' | '[wait]' | '[warn]', message: string): void {
	console.error(`[${ts()}] ${prefix} ${message}`);
}
