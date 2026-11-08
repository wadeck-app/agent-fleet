import { SandboxError } from './SandboxError';

const OUTPUTS_SUFFIX = /[\\/]outputs$/;

/**
 * The host directory of a run's `.meta`, from the assignment's execution context, the way the daemon's worker adapter derives it:
 * `outputsDir` is `<meta>/outputs`. Since the workspace providers the meta directory is NOT always `<workspace>.meta`
 * (`in-place` and `pool` keep it in `<project>/.flow/runs/<executionId>.meta`).
 *
 * Without `outputsDir` the older sibling convention `<workspace>.meta` applies, as in the daemon. An `outputsDir` that does not end
 * in `outputs` is refused, because guessing a mount from it could expose another directory.
 */
export class RunMetaDirectory {
	static of(executionContext: { workspaceDir: string; outputsDir?: unknown }): string {
		const outputsDir = executionContext.outputsDir;
		if (outputsDir === undefined || outputsDir === null || outputsDir === '') {
			return `${executionContext.workspaceDir}.meta`;
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
