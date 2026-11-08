import type { WorkspaceDeclarationIssue } from './WorkspaceDeclarationParser';

const ACCEPTED = ['baseDir', 'prefix', 'branchStrategy'];
/** The characters the worktree provider accepts in the prefix of a branch name. */
const BRANCH_PREFIX = /^[a-zA-Z0-9._-]+$/;

/**
 * What a flow can know about the options of the `worktree` provider before it runs, so `flow validate` says what the run
 * would: the same rules as the provider (`baseDir` given, `prefix` fit for a branch name, no unknown option).
 */
export class WorktreeOptionRules {
	static check(options: Record<string, unknown>): (WorkspaceDeclarationIssue & { missing: boolean })[] {
		const issues: (WorkspaceDeclarationIssue & { missing: boolean })[] = [];
		for (const key of Object.keys(options)) {
			if (!ACCEPTED.includes(key)) {
				issues.push({
					field: `workspace.${key}`,
					message: `Unknown option "${key}" for the workspace provider "worktree".`,
					suggestion: `Accepted options: ${ACCEPTED.join(', ')}.`,
					missing: false,
				});
			}
		}
		const baseDir = options['baseDir'];
		if (baseDir === undefined) {
			issues.push({
				field: 'workspace.baseDir',
				message: 'The workspace provider "worktree" needs "baseDir", the folder that receives the worktrees.',
				suggestion:
					'Write "workspace: { provider: worktree, baseDir: ../worktrees }" (outside the project folder).',
				missing: true,
			});
		} else if (typeof baseDir !== 'string' || baseDir.trim() === '') {
			issues.push({
				field: 'workspace.baseDir',
				message: `"workspace.baseDir" must be a non-empty folder path, got ${JSON.stringify(baseDir)}.`,
				suggestion: 'Write for instance "baseDir: ../worktrees" (relative to the project folder).',
				missing: false,
			});
		}
		const prefix = options['prefix'];
		if (prefix !== undefined && (typeof prefix !== 'string' || (prefix !== '' && !BRANCH_PREFIX.test(prefix)))) {
			issues.push({
				field: 'workspace.prefix',
				message: `"workspace.prefix" ${JSON.stringify(prefix)} cannot start a git branch name: only letters, digits, ".", "_" and "-" are accepted (no "/").`,
				suggestion: 'Use a plain prefix such as "flow-".',
				missing: false,
			});
		}
		return issues;
	}
}
