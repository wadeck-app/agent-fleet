/**
 * WorkspaceGitStrategy -- git operations for workspace setup.
 * Handles clone, feature-branch, worktree, and state inspection.
 *
 * A setup that cannot be done is never swallowed: it throws a {@link WorkspaceGitSetupError} (see WorkspaceGitMessages)
 * and the run is refused, rather than going on in an empty directory.
 */
import { HARDENED_GIT_MUTATING_CONFIG, HARDENED_GIT_READING_CONFIG } from 'extension-points';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { type SimpleGit, simpleGit } from 'simple-git';

import type { GitStrategy, WorkspaceGitState } from '../types';
import { GIT_STRATEGIES, describeGitFailure, describeNotUsableForManual } from './WorkspaceGitMessages';
import { type WorkspaceGitFailureCause, WorkspaceGitSetupError } from './WorkspaceTypes';

function generateBranchName(taskId: string, description?: string): string {
	const shortId = taskId.substring(0, 4);
	const slug = description
		? description
				.toLowerCase()
				.replace(/[^a-z0-9]+/g, '-')
				.replace(/^-+|-+$/g, '')
				.substring(0, 30)
		: 'task';
	return `fleet/task-${shortId}-${slug}`;
}

/** What a setup has done so far, to tell the user which git call failed and to undo what was left behind. */
interface SetupProgress {
	/** The git command being run (shown to the user). */
	command: string;
	/** A branch this setup created in the project repository (to delete again if the setup fails). */
	createdBranch?: string;
}

export class WorkspaceGitStrategy {
	/**
	 * @param gitBinary the git executable (test seam; `git` from the PATH by default)
	 */
	constructor(
		private readonly projectRoot: string,
		private readonly gitBinary: string = 'git'
	) {}

	/**
	 * Every git call goes through here: the folders may have been written by a previous run (a sandboxed run can edit
	 * `.git/config`). `reading` calls (status, log, rev-parse, listings) run with no fsmonitor command and no hooks;
	 * `mutating` calls (worktree add/remove, clone, checkout, branch) only without the fsmonitor command, so the hooks of
	 * the user's repository (git-lfs, husky) keep running (see hardenedGit).
	 * GIT_OPTIONAL_LOCKS is not set: simple-git replaces the whole environment when one is given and then rejects the
	 * ambient GIT_EDITOR / GIT_ASKPASS; these calls run at allocation time, not beside a running step.
	 */
	private getGit(mode: 'reading' | 'mutating', workingDir?: string): SimpleGit {
		const reading = mode === 'reading';
		// simple-git refuses any core.fsmonitor / core.hooksPath setting unless allowed; enable only what the mode sets.
		const options = {
			binary: this.gitBinary,
			config: [...(reading ? HARDENED_GIT_READING_CONFIG : HARDENED_GIT_MUTATING_CONFIG)],
			unsafe: reading
				? { allowUnsafeFsMonitor: true, allowUnsafeHooksPath: true }
				: { allowUnsafeFsMonitor: true },
		};
		return simpleGit(workingDir === undefined ? options : { ...options, baseDir: workingDir });
	}

	/** Tolerant: undefined when there is no usable state (manual mode warns). Use {@link readGitState} when it must exist. */
	async getGitState(workspacePath: string): Promise<WorkspaceGitState | undefined> {
		try {
			return await this.readGitState(workspacePath);
		} catch {
			return undefined;
		}
	}

	private async readGitState(workspacePath: string): Promise<WorkspaceGitState> {
		const git = this.getGit('reading', workspacePath);
		const status = await git.status();
		const branch = status.current || 'unknown';
		const isClean = status.isClean();
		const log = await git.log({ maxCount: 1 });
		const lastCommit = log.latest?.hash || 'unknown';
		return { branch, isClean, lastCommit };
	}

	/** Why a manual workspace has no git state, in words the user can act on (the manual mode only warns). */
	async explainManualWithoutGit(workspacePath: string): Promise<string> {
		const cause = (await this.probe(workspacePath)) ?? 'git-command-failed';
		return describeNotUsableForManual(workspacePath, cause);
	}

	async isWorktree(workspacePath: string): Promise<boolean> {
		try {
			const git = this.getGit('reading', this.projectRoot);
			const result = await git.raw(['worktree', 'list', '--porcelain']);
			return result.includes(workspacePath);
		} catch (error) {
			// Best effort: the cleanup then removes the directory only, so the worktree may stay registered in the repository.
			console.warn(
				`Could not tell whether ${workspacePath} is a git worktree (${String(error)}). If it is, run "git worktree prune" in ${this.projectRoot} once the directory is gone.`
			);
			return false;
		}
	}

	/**
	 * Prepares the git side of a workspace directory.
	 *
	 * @returns the git state, or undefined only for the `none` strategy
	 * @throws WorkspaceGitSetupError for every other failure; the caller removes the directory
	 */
	async setupGit(
		workspacePath: string,
		gitStrategy: string | undefined,
		gitBranch: string,
		taskMetadata: Record<string, unknown>,
		taskId: string
	): Promise<WorkspaceGitState | undefined> {
		if (!gitStrategy || gitStrategy === 'none') return undefined;
		const context = { strategy: gitStrategy, projectRoot: this.projectRoot, branch: gitBranch };
		if (!(GIT_STRATEGIES as readonly string[]).includes(gitStrategy)) {
			throw new WorkspaceGitSetupError(describeGitFailure(context, 'unknown-strategy'), 'unknown-strategy');
		}
		const strategy = gitStrategy as Exclude<GitStrategy, 'none'>;

		const probed = await this.probe(this.projectRoot, strategy === 'worktree' ? undefined : gitBranch);
		if (probed) {
			throw new WorkspaceGitSetupError(
				describeGitFailure(context, probed, { currentBranch: await this.currentBranch() }),
				probed
			);
		}

		const progress: SetupProgress = { command: 'git' };
		try {
			return strategy === 'worktree'
				? await this.setupWorktree(workspacePath, taskMetadata, taskId, progress)
				: await this.setupClone(workspacePath, strategy, gitBranch, taskMetadata, taskId, progress);
		} catch (error) {
			await this.undoPartialSetup(progress);
			throw new WorkspaceGitSetupError(
				describeGitFailure(context, 'git-command-failed', {
					command: progress.command,
					gitOutput: String(error),
				}),
				'git-command-failed'
			);
		}
	}

	async removeWorktree(workspacePath: string): Promise<void> {
		const git = this.getGit('mutating', this.projectRoot);
		await git.raw(['worktree', 'remove', workspacePath, '--force']);
	}

	/**
	 * Cheap probes, in order: is git runnable, is `dir` inside a repository, does HEAD exist and, when asked, does the
	 * local branch exist.
	 *
	 * @returns the cause of the first probe that fails, or undefined when all pass
	 */
	private async probe(dir: string, requiredBranch?: string): Promise<WorkspaceGitFailureCause | undefined> {
		try {
			// No baseDir: the version of git does not depend on a directory (which may not exist).
			await this.getGit('reading').raw(['--version']);
		} catch {
			return 'git-not-installed';
		}
		if (!fs.existsSync(dir)) return 'not-a-repository';
		const git = this.getGit('reading', dir);
		try {
			await git.raw(['rev-parse', '--git-dir']);
		} catch {
			return 'not-a-repository';
		}
		try {
			await git.raw(['rev-parse', '--verify', 'HEAD']);
		} catch {
			return 'no-commits';
		}
		if (requiredBranch !== undefined) {
			try {
				await git.raw(['rev-parse', '--verify', `refs/heads/${requiredBranch}`]);
			} catch {
				return 'branch-missing';
			}
		}
		return undefined;
	}

	private async currentBranch(): Promise<string | undefined> {
		try {
			const name = (
				await this.getGit('reading', this.projectRoot).raw(['rev-parse', '--abbrev-ref', 'HEAD'])
			).trim();
			return name || undefined;
		} catch {
			return undefined;
		}
	}

	/** Undoes what a failed worktree setup left in the project repository: the half-registered worktree and the branch it created. */
	private async undoPartialSetup(progress: SetupProgress): Promise<void> {
		if (progress.createdBranch === undefined) return;
		const git = this.getGit('mutating', this.projectRoot);
		try {
			await git.raw(['worktree', 'prune']);
			await git.raw(['branch', '-D', progress.createdBranch]);
		} catch (error) {
			console.warn(
				`Could not remove the branch "${progress.createdBranch}" created in ${this.projectRoot} for the failed workspace (${String(error)}). Delete it with: git -C "${this.projectRoot}" branch -D ${progress.createdBranch}`
			);
		}
	}

	private async setupWorktree(
		workspacePath: string,
		taskMetadata: Record<string, unknown>,
		taskId: string,
		progress: SetupProgress
	): Promise<WorkspaceGitState> {
		const git = this.getGit('mutating', this.projectRoot);
		const reader = this.getGit('reading', this.projectRoot);
		const branchName = generateBranchName(taskId, taskMetadata.description as string | undefined);
		const branches = await reader.branch();
		if (!branches.all.includes(branchName)) {
			progress.command = `git branch ${branchName} HEAD`;
			// Not a checkout: the branch must stay free for the worktree, and the project's own working tree must not move.
			await git.raw(['branch', branchName, 'HEAD']);
			progress.createdBranch = branchName;
		}
		progress.command = `git worktree add ${workspacePath} ${branchName}`;
		await git.raw(['worktree', 'add', workspacePath, branchName]);
		console.log(`Created worktree at ${workspacePath} for branch ${branchName}`);
		progress.command = 'git status / git log (reading the new worktree)';
		return this.readGitState(workspacePath);
	}

	private async setupClone(
		workspacePath: string,
		gitStrategy: Exclude<GitStrategy, 'none' | 'worktree'>,
		gitBranch: string,
		taskMetadata: Record<string, unknown>,
		taskId: string,
		progress: SetupProgress
	): Promise<WorkspaceGitState> {
		const cloneOptions: string[] = gitStrategy === 'main-only' ? ['--depth', '1'] : [];
		progress.command = `git clone ${cloneOptions.join(' ')} ${this.projectRoot} ${workspacePath}`.replace(
			/ {2,}/g,
			' '
		);
		await this.getGit('mutating').clone(this.projectRoot, workspacePath, cloneOptions);
		const workspaceGit = this.getGit('mutating', workspacePath);

		switch (gitStrategy) {
			case 'main-only':
			case 'any':
				progress.command = `git checkout ${gitBranch} (in ${path.basename(workspacePath)})`;
				await workspaceGit.checkout(gitBranch);
				console.log(`Checked out ${gitBranch} in ${workspacePath}`);
				break;
			case 'feature-branch': {
				const branchName = generateBranchName(taskId, taskMetadata.description as string | undefined);
				progress.command = `git checkout -b ${branchName} ${gitBranch} (in ${path.basename(workspacePath)})`;
				await workspaceGit.checkoutBranch(branchName, gitBranch);
				console.log(`Created feature branch ${branchName} in ${path.basename(workspacePath)}`);
				break;
			}
		}

		progress.command = 'git status / git log (reading the new clone)';
		return this.readGitState(workspacePath);
	}
}
