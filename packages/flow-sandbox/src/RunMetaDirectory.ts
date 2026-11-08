import { SandboxError } from './SandboxError';

const OUTPUTS_SUFFIX = /[\\/]outputs$/;

/**
 * The host directory of a run's `.meta`, from the assignment's execution context, the way the daemon's worker adapter derives it:
 * `outputsDir` is `<meta>/outputs`. Since the workspace providers the meta directory is NOT always `<workspace>.meta`
 * (`in-place` and `pool` keep it in `<project>/.flow/runs/<executionId>.meta`).
 *
 * There is no fallback to `<workspace>.meta` (the daemon's own old convention): it is wrong for `in-place` and `pool`, and a wrong
 * mount is a wrong exposure. A missing `outputsDir`, or one that does not end in `outputs`, is refused.
 */
export class RunMetaDirectory {
	static of(executionContext: { workspaceDir: string; outputsDir?: unknown }): string {
		const outputsDir = executionContext.outputsDir;
		if (outputsDir === undefined || outputsDir === null || outputsDir === '') {
			throw new SandboxError(
				'invalid-argument',
				"The assignment has no executionContext.outputsDir, so the run's .meta mount cannot be derived. The daemon always sends it: " +
					'check that the daemon and the sandbox plugin come from compatible flow-cli versions (update both), then retry.'
			);
		}
		if (typeof outputsDir !== 'string' || !OUTPUTS_SUFFIX.test(outputsDir)) {
			throw new SandboxError(
				'invalid-argument',
				`executionContext.outputsDir ${JSON.stringify(outputsDir)} is not "<run meta directory>/outputs": the run's .meta mount cannot be derived from it.`
			);
		}
		return outputsDir.replace(OUTPUTS_SUFFIX, '');
	}
}
