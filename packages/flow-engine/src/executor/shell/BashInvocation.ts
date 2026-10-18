/**
 * Builds the argv of a bash script-step run. Strict mode is passed as bash options rather than
 * prepended to the script, so script line numbers in error output stay unchanged and a script
 * that starts with `set -eu` or later does `set +e` behaves exactly as written.
 */
export class BashInvocation {
	/** Appended to the failure message of a strict step. */
	public static readonly STRICT_FAILURE_HINT =
		'Step ran in strict mode (set -eu): add `strict: false` to the step to disable.';

	private static readonly STRICT_FLAGS = ['-e', '-u'];

	public static buildArgs(scriptPath: string, strict: boolean): string[] {
		return strict ? [...BashInvocation.STRICT_FLAGS, scriptPath] : [scriptPath];
	}
}
