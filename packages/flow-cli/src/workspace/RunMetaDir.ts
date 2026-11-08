import * as path from 'node:path';

/** Where the daemon keeps the metadata of the executions that run in a folder shared with others, relative to the project. */
export const RUN_META_RELATIVE_DIR = path.join('.flow', 'runs');

/**
 * The `.meta` folder of one execution of a workspace whose folder outlives or is shared by executions:
 * `<projectDir>/.flow/runs/<executionId>.meta`. One per execution, so two runs on the same folder never write their
 * outputs (`writeOutput` files) over each other.
 */
export function runMetaDirFor(projectDir: string, executionId: string): string {
	return path.join(projectDir, RUN_META_RELATIVE_DIR, `${executionId}.meta`);
}
