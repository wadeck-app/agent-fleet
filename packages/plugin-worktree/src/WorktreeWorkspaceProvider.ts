import type { WorkspaceHandle, WorkspaceProvider, WorkspaceRequest } from 'extension-points';
import {
	hardenedGit,
	validateBaseDir,
	validateBranchNamePrefix,
	validateTaskIdForBranchName,
	validateWorkspacePath,
} from 'extension-points';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { WorktreeGitError } from './WorktreeGitError.js';

export interface WorktreeOptions {
	/** Folder that receives the worktrees. A relative path is resolved against the project of the run. */
	baseDir: string;
	prefix?: string;
	branchStrategy?: 'new-branch';
	_execGit?: (args: string[], cwd: string) => Promise<void>;
	/** Runs git and returns its output; used to find out why a command failed. */
	_gitOutput?: (args: string[], cwd: string) => Promise<string>;
}

// The repository may have been written by a previous run: no fsmonitor command, no hooks (see hardenedGit).
async function defaultExecGit(args: string[], cwd: string): Promise<void> {
	const { execa } = await import('execa');
	const git = hardenedGit(args);
	await execa('git', git.args, { cwd, env: git.env });
}

async function defaultGitOutput(args: string[], cwd: string): Promise<string> {
	const { execa } = await import('execa');
	const git = hardenedGit(args, { reading: true });
	return (await execa('git', git.args, { cwd, env: git.env })).stdout;
}

/** Credentials in a URL (`https://user:token@host`) must not reach a message. */
function redact(text: string): string {
	return text.replace(/([a-zA-Z][a-zA-Z0-9+.-]*:\/\/)[^\s/@]+@/g, '$1***@');
}

/**
 * Why the creation of the worktree failed, by probing git: not installed, not a repository, no commit, or something else
 * (then git's own words, capped). Never throws.
 */
async function diagnose(
	gitOutput: (args: string[], cwd: string) => Promise<string>,
	projectDir: string,
	worktreePath: string,
	gitSaid: string
): Promise<WorktreeGitError> {
	const where = `Worktree "${worktreePath}" from the project folder "${projectDir}"`;
	const refused = 'The run was not started: it would have had no copy of the project.';
	const ok = async (args: string[]): Promise<boolean> => {
		try {
			await gitOutput(args, projectDir);
			return true;
		} catch {
			return false;
		}
	};
	if (!(await ok(['--version']))) {
		return new WorktreeGitError(
			`${where} could not be created: git was not found (the "git --version" probe failed). ${refused} Fix: install git and put it on the PATH of the process that runs flow (restart the daemon after changing it), or use "workspace: in-place".`,
			'git-not-installed'
		);
	}
	let inside = false;
	try {
		inside = (await gitOutput(['rev-parse', '--is-inside-work-tree'], projectDir)).trim() === 'true';
	} catch {
		inside = false;
	}
	if (!inside) {
		return new WorktreeGitError(
			`${where} could not be created: "${projectDir}" is not a git repository. ${refused} Fix: run flow from inside the repository, or use "workspace: in-place" to work directly in the folder.`,
			'not-a-repository'
		);
	}
	if (!(await ok(['rev-parse', '--verify', 'HEAD']))) {
		return new WorktreeGitError(
			`${where} could not be created: the repository has no commit yet, so there is nothing to branch from. ${refused} Fix: make a first commit (git commit --allow-empty -m init), or use "workspace: in-place".`,
			'no-commits'
		);
	}
	const said = redact(gitSaid).slice(0, 1500);
	return new WorktreeGitError(
		`${where} could not be created. ${refused}\nGit said:\n${said}\nFix: run the same git command by hand in the project folder to see the full error and correct the repository, or use "workspace: in-place".`,
		'git-command-failed'
	);
}

export function createWorktreeProvider(options: WorktreeOptions): WorkspaceProvider {
	const execGit = options._execGit ?? defaultExecGit;
	const gitOutput = options._gitOutput ?? defaultGitOutput;
	// The project each worktree was created from: removing it has to run in the same repository.
	const projectByPath = new Map<string, string>();
	const released = new Set<string>();

	return {
		async allocate(request: WorkspaceRequest): Promise<WorkspaceHandle> {
			// A relative baseDir is relative to the project of the run, never to the working directory of the daemon.
			const resolvedBase = resolve(request.projectDir, options.baseDir);
			validateBaseDir(resolvedBase, request.projectDir);

			// Validate taskId for path construction
			validateWorkspacePath(request.taskId, resolvedBase);

			// Validate taskId for git branch name
			validateTaskIdForBranchName(request.taskId);

			// Validate branch prefix
			validateBranchNamePrefix(options.prefix);

			const name = `${options.prefix ?? ''}${request.taskId}`;
			const worktreePath = join(resolvedBase, name);

			if (existsSync(worktreePath)) {
				throw new Error(`Workspace already exists at "${worktreePath}"`);
			}

			const branchName = name;
			// Use array-argument API - no shell string interpolation
			try {
				await execGit(['worktree', 'add', '-b', branchName, worktreePath], request.projectDir);
			} catch (error) {
				throw await diagnose(
					gitOutput,
					request.projectDir,
					worktreePath,
					error instanceof Error ? error.message : String(error)
				);
			}
			projectByPath.set(worktreePath, request.projectDir);
			released.delete(worktreePath);

			return {
				path: worktreePath,
				id: `worktree:${worktreePath}`,
			};
		},

		async release(handle: WorkspaceHandle): Promise<void> {
			const worktreePath = handle.path;
			if (released.has(worktreePath)) {
				return;
			}
			const projectDir = projectByPath.get(worktreePath);
			if (projectDir === undefined) {
				throw new Error(
					`The worktree provider did not allocate "${worktreePath}", so it does not know which repository owns it. Remove it from the project repository with the git worktree remove command (--force).`
				);
			}
			// Use array-argument API - no shell string interpolation
			await execGit(['worktree', 'remove', worktreePath, '--force'], projectDir);
			projectByPath.delete(worktreePath);
			released.add(worktreePath);
		},
	};
}
