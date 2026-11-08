/**
 * Texts the user reads when the git side of a workspace cannot be set up: what was attempted, the cause, and the fix.
 * Everything coming from git is passed through {@link redactGitText} (remote URLs can carry a token).
 */
import { redactGitText } from './RedactGitText';
import type { WorkspaceGitFailureCause } from './WorkspaceTypes';

/** Every value of the `gitStrategy` workspace setting, in the order shown to the user. */
export const GIT_STRATEGIES = ['main-only', 'feature-branch', 'any', 'worktree', 'none'] as const;

export interface GitFailureContext {
	strategy: string;
	projectRoot: string;
	branch: string;
}

export interface GitFailureDetails {
	/** The git call that failed (git-command-failed). */
	command?: string;
	/** Raw error text of git (git-command-failed); redacted and capped here. */
	gitOutput?: string;
	/** Branch checked out in the project repository (branch-missing). */
	currentBranch?: string;
}

const USE_NONE = 'use the workspace gitStrategy "none" in the flow';

function fixFor(context: GitFailureContext, cause: WorkspaceGitFailureCause, details: GitFailureDetails): string {
	switch (cause) {
		case 'git-not-installed':
			return `git was not found (the "git --version" probe failed). Fix: install git and make sure it is on the PATH of the process that runs flow (restart the daemon after changing the PATH), or ${USE_NONE}.`;
		case 'not-a-repository':
			return `"${context.projectRoot}" is not a git repository. Fix: run flow from inside the repository, or ${USE_NONE} (no git), or use the workspace mode "manual" to work directly in a directory.`;
		case 'no-commits':
			return `the repository at "${context.projectRoot}" has no commit yet, so there is nothing to clone or branch from. Fix: make a first commit (git commit --allow-empty -m init), or ${USE_NONE}.`;
		case 'branch-missing': {
			const current = details.currentBranch;
			const where =
				current === undefined || current === 'HEAD'
					? 'HEAD is detached or unreadable'
					: `the current branch is "${current}"`;
			const source = current === undefined || current === 'HEAD' ? 'HEAD' : current;
			return `branch "${context.branch}" does not exist in the project repository (${where}). The flow configuration has no field to choose another branch. Fix: create it (git branch ${context.branch} ${source}), or use the gitStrategy "worktree" (it starts from the current commit), or ${USE_NONE}.`;
		}
		case 'unknown-strategy':
			return `the gitStrategy "${context.strategy}" is not known. Fix: use one of ${GIT_STRATEGIES.join(', ')}.`;
		case 'git-command-failed':
			return `${details.command ?? 'a git command'} failed.\nGit said:\n${redactGitText(details.gitOutput ?? '(no output)')}\nFix: run that command by hand in the project directory to see the full error and correct the repository, or ${USE_NONE}.`;
	}
}

/** The message of a refused allocation: strategy, directory and branch, then the cause with its fix. */
export function describeGitFailure(
	context: GitFailureContext,
	cause: WorkspaceGitFailureCause,
	details: GitFailureDetails = {}
): string {
	const branch = context.strategy === 'worktree' ? 'new branch from HEAD' : `branch "${context.branch}"`;
	return `Git setup failed (gitStrategy "${context.strategy}", project directory "${context.projectRoot}", ${branch}). The run was not started: it would have run in an empty directory. Cause: ${fixFor(context, cause, details)}`;
}

/** The warning of a manual workspace git cannot describe (manual mode never fails for it: the user chose a directory). */
export function describeNotUsableForManual(workspacePath: string, cause: WorkspaceGitFailureCause): string {
	switch (cause) {
		case 'git-not-installed':
			return `Manual workspace "${workspacePath}": git was not found, so its state cannot be read. The run goes on, without git information. Install git and put it on the PATH to get it.`;
		case 'not-a-repository':
			return `Manual workspace "${workspacePath}" is not a git repository: the run goes on, but its changes cannot be reviewed or reverted with git. Run "git init" in it, or run flow from inside your repository, if you want that.`;
		case 'no-commits':
			return `Manual workspace "${workspacePath}" is a git repository without any commit: the run goes on, without git information. Make a first commit to get it.`;
		case 'branch-missing':
		case 'unknown-strategy':
		case 'git-command-failed':
			return `Manual workspace "${workspacePath}": git could not read its state. The run goes on, without git information. Run "git status" in it to see why.`;
	}
}

/** The warning of a manual workspace with uncommitted changes. */
export function describeDirtyManual(workspacePath: string): string {
	return `Manual workspace "${workspacePath}" has uncommitted changes and the run edits it directly: its changes will be mixed with yours. Commit or stash them first (git stash) if you want to tell them apart.`;
}
