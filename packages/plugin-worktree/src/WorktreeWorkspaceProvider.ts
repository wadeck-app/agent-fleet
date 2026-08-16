import type { WorkspaceHandle, WorkspaceProvider, WorkspaceRequest } from 'extension-points';
import {
	validateBaseDir,
	validateBranchNamePrefix,
	validateTaskIdForBranchName,
	validateWorkspacePath,
} from 'extension-points';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface WorktreeOptions {
	baseDir: string;
	prefix?: string;
	branchStrategy?: 'new-branch';
	_execGit?: (args: string[]) => Promise<void>;
}

async function defaultExecGit(args: string[]): Promise<void> {
	const { execa } = await import('execa');
	await execa('git', args);
}

export function createWorktreeProvider(options: WorktreeOptions): WorkspaceProvider {
	const execGit = options._execGit ?? defaultExecGit;

	return {
		async allocate(request: WorkspaceRequest): Promise<WorkspaceHandle> {
			// Validate baseDir
			validateBaseDir(options.baseDir);

			// Validate taskId for path construction
			validateWorkspacePath(request.taskId, options.baseDir);

			// Validate taskId for git branch name
			validateTaskIdForBranchName(request.taskId);

			// Validate branch prefix
			validateBranchNamePrefix(options.prefix);

			const resolvedBase = resolve(options.baseDir);
			const name = `${options.prefix ?? ''}${request.taskId}`;
			const worktreePath = join(resolvedBase, name);

			if (existsSync(worktreePath)) {
				throw new Error(`Workspace already exists at "${worktreePath}"`);
			}

			const branchName = name;
			// Use array-argument API - no shell string interpolation
			await execGit(['worktree', 'add', '-b', branchName, worktreePath]);

			return {
				path: worktreePath,
				id: `worktree:${worktreePath}`,
			};
		},

		async release(handle: WorkspaceHandle): Promise<void> {
			const worktreePath = handle.path;
			// Use array-argument API - no shell string interpolation
			await execGit(['worktree', 'remove', worktreePath, '--force']);
		},
	};
}
