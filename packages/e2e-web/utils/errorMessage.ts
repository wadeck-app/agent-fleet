/**
 * Bare message of an unknown throwable.
 *
 * e2e-web does not depend on shared-common, so it cannot use getErrorMessage(). Note
 * that `String(thrown)` on an Error yields "Error: <msg>", which is wrong when the
 * result is embedded in a sentence -- hence the explicit branch.
 */
export function messageOf(thrown: unknown): string {
	return thrown instanceof Error ? thrown.message : String(thrown);
}
