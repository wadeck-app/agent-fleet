/**
 * WorkspaceGitStrategy -- git operations for workspace setup.
 * Handles clone, feature-branch, worktree, and state inspection.
 */
import * as path from 'path';
import { type SimpleGit, simpleGit } from 'simple-git';

import type { GitStrategy, WorkspaceGitState } from '../types';
import { WorkspaceAllocationError } from './WorkspaceTypes';

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

export class WorkspaceGitStrategy {
	constructor(private readonly projectRoot: string) {}

	private getGit(workingDir: string): SimpleGit {
		return simpleGit(workingDir);
	}

	async getGitState(workspacePath: string): Promise<WorkspaceGitState | undefined> {
		try {
			const git = this.getGit(workspacePath);
			const status = await git.status();
			const branch = status.current || 'unknown';
			const isClean = status.isClean();
			const log = await git.log({ maxCount: 1 });
			const lastCommit = log.latest?.hash || 'unknown';
			return { branch, isClean, lastCommit };
		} catch (error) {
			console.warn(`Failed to get git state for ${workspacePath}:`, error);
			return undefined;
		}
	}

	async isWorktree(workspacePath: string): Promise<boolean> {
		try {
			const git = this.getGit(this.projectRoot);
			const result = await git.raw(['worktree', 'list', '--porcelain']);
			return result.includes(workspacePath);
		} catch {
			return false;
		}
	}

	async setupGit(
		workspacePath: string,
		gitStrategy: string | undefined,
		gitBranch: string,
		taskMetadata: Record<string, unknown>,
		taskId: string
	): Promise<WorkspaceGitState | undefined> {
		if (!gitStrategy || gitStrategy === 'none') return undefined;
		try {
			if (gitStrategy === 'worktree') {
				return await this.setupWorktree(workspacePath, gitBranch, taskMetadata, taskId);
			}
			return await this.setupClone(workspacePath, gitStrategy as GitStrategy, gitBranch, taskMetadata, taskId);
		} catch (error) {
			console.warn(`Git setup failed, continuing without git:`, error);
			return undefined;
		}
	}

	async removeWorktree(workspacePath: string): Promise<void> {
		const git = this.getGit(this.projectRoot);
		await git.raw(['worktree', 'remove', workspacePath, '--force']);
	}

	private async setupWorktree(
		workspacePath: string,
		_gitBranch: string,
		taskMetadata: Record<string, unknown>,
		taskId: string
	): Promise<WorkspaceGitState> {
		try {
			const git = this.getGit(this.projectRoot);
			const branchName = generateBranchName(taskId, taskMetadata.description as string | undefined);
			const branches = await git.branch();
			const branchExists = branches.all.includes(branchName);
			if (!branchExists) {
				await git.checkoutBranch(branchName, 'HEAD');
			}
			await git.raw(['worktree', 'add', workspacePath, branchName]);
			console.log(`Created worktree at ${workspacePath} for branch ${branchName}`);
			return (await this.getGitState(workspacePath))!;
		} catch (error) {
			throw new WorkspaceAllocationError(`Failed to create git worktree: ${error}`);
		}
	}

	private async setupClone(
		workspacePath: string,
		gitStrategy: GitStrategy,
		gitBranch: string,
		taskMetadata: Record<string, unknown>,
		taskId: string
	): Promise<WorkspaceGitState> {
		try {
			const git = simpleGit();
			const cloneOptions: string[] = gitStrategy === 'main-only' ? ['--depth', '1'] : [];
			await git.clone(this.projectRoot, workspacePath, cloneOptions);
			const workspaceGit = this.getGit(workspacePath);

			switch (gitStrategy) {
				case 'main-only':
					await workspaceGit.checkout(gitBranch);
					console.log(`Checked out ${gitBranch} in ${workspacePath}`);
					break;
				case 'feature-branch': {
					const branchName = generateBranchName(taskId, taskMetadata.description as string | undefined);
					await workspaceGit.checkoutBranch(branchName, gitBranch);
					console.log(`Created feature branch ${branchName} in ${path.basename(workspacePath)}`);
					break;
				}
				case 'any':
					await workspaceGit.checkout(gitBranch);
					console.log(`Checked out ${gitBranch} in ${workspacePath}`);
					break;
			}

			return (await this.getGitState(workspacePath))!;
		} catch (error) {
			throw new WorkspaceAllocationError(`Failed to setup git: ${error}`);
		}
	}
}
