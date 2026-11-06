/** The message of a caught value, for log lines and error texts. */
export function describeError(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
