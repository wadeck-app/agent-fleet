import { execFileSync } from 'node:child_process';
import { lstatSync, statSync } from 'node:fs';
import type { Stats } from 'node:fs';
import { normalize, parse, resolve, sep } from 'node:path';

import { hardenedGit } from './HardenedGit.js';

const UNIX_SYSTEM_DIRS = ['/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64', '/boot', '/sys', '/proc', '/dev', '/var'];

const WINDOWS_SYSTEM_DIRS = ['windows', 'program files', 'program files (x86)', 'system32', 'winnt'];

const GIT_REF_ALLOWLIST = /^[a-zA-Z0-9._-]+$/;

function isDriveRoot(resolved: string): boolean {
	// Unix root: "/"
	if (resolved === '/') return true;
	// Windows root: a drive letter followed by a separator, e.g. the root reported by path.parse()
	const parsed = parse(resolved);
	return parsed.root === resolved && parsed.dir === resolved;
}

function isSystemDir(resolved: string): boolean {
	const lower = resolved.toLowerCase().replace(/\\/g, '/');

	for (const sysDir of UNIX_SYSTEM_DIRS) {
		if (lower === sysDir || lower.startsWith(sysDir + '/')) {
			return true;
		}
	}

	// Windows: check if inside common system dirs (after drive root)
	const withoutDrive = lower.replace(/^[a-z]:[/\\]/, '/');
	for (const sysDir of WINDOWS_SYSTEM_DIRS) {
		if (withoutDrive === '/' + sysDir || withoutDrive.startsWith('/' + sysDir + '/')) {
			return true;
		}
	}

	return false;
}

export function validateWorkspacePath(taskId: string, baseDir: string): void {
	if (taskId.includes('/') || taskId.includes('\\') || taskId.includes('..')) {
		throw new Error(`Invalid taskId "${taskId}": path traversal characters are not allowed`);
	}

	const resolvedBase = resolve(baseDir);
	const resolvedPath = resolve(baseDir, taskId);

	if (!resolvedPath.startsWith(resolvedBase + sep) && resolvedPath !== resolvedBase) {
		throw new Error(`Invalid taskId "${taskId}": resolved path escapes baseDir "${resolvedBase}"`);
	}
}

function getActiveWorktreePaths(projectDir: string): string[] {
	try {
		const git = hardenedGit(['worktree', 'list', '--porcelain'], { reading: true });
		const output = execFileSync('git', git.args, {
			env: git.env,
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			windowsHide: true,
			cwd: projectDir,
		});
		const paths: string[] = [];
		for (const line of output.split('\n')) {
			if (line.startsWith('worktree ')) {
				paths.push(resolve(line.slice('worktree '.length).trim()));
			}
		}
		return paths;
	} catch {
		// Not a git repo or git not available - skip worktree check
		return [];
	}
}

/**
 * @param projectDir Absolute folder of the project the run belongs to. Never defaulted to the working directory: the
 * daemon serves many projects, so its own cwd says nothing about the run.
 */
export function validateBaseDir(baseDir: string, projectDir: string): void {
	if (!projectDir || projectDir.trim() === '') {
		throw new Error(
			'Invalid projectDir: must not be empty (the workspace request must carry the project folder of the run)'
		);
	}
	if (!baseDir || baseDir.trim() === '') {
		throw new Error('Invalid baseDir: must not be empty');
	}

	const resolved = resolve(normalize(baseDir));

	if (isDriveRoot(resolved)) {
		throw new Error('Invalid baseDir: must not be the filesystem root');
	}

	if (isSystemDir(resolved)) {
		throw new Error(`Invalid baseDir "${resolved}": must not be a system directory`);
	}

	const projectRoot = resolve(projectDir);
	if (projectRoot.startsWith(resolved + sep) || projectRoot.startsWith(resolved + '/')) {
		throw new Error(`Invalid baseDir "${resolved}": must not be an ancestor of the project root "${projectRoot}"`);
	}

	// Reject if baseDir is nested inside an existing git worktree (would create nested worktrees)
	const worktreePaths = getActiveWorktreePaths(projectRoot);
	for (const worktreePath of worktreePaths) {
		if (
			resolved === worktreePath ||
			resolved.startsWith(worktreePath + sep) ||
			resolved.startsWith(worktreePath + '/')
		) {
			throw new Error(
				`Invalid baseDir "${resolved}": must not be inside an existing git worktree at "${worktreePath}"`
			);
		}
	}
}

export function validateTaskIdForBranchName(taskId: string): void {
	if (!taskId || taskId.trim() === '') {
		throw new Error('Invalid taskId for branch name: must not be empty');
	}

	if (!GIT_REF_ALLOWLIST.test(taskId)) {
		throw new Error(`Invalid taskId "${taskId}" for git branch name: only [a-zA-Z0-9._-] characters are allowed`);
	}
}

export function validateBranchNamePrefix(prefix: string | undefined): void {
	if (prefix === undefined || prefix === '') {
		return;
	}

	if (!GIT_REF_ALLOWLIST.test(prefix)) {
		throw new Error(`Invalid branch name prefix "${prefix}": only [a-zA-Z0-9._-] characters are allowed`);
	}
}

/**
 * The folder a workspace option names (`dir`...), checked: a relative path is resolved against the project of the run (never
 * the working directory of the daemon), and it must be an existing directory that is not a drive root, not a system
 * directory and not a symbolic link or junction. Absent, the project folder itself.
 *
 * @param optionName How the flow author calls the option, for the messages (`dir`).
 */
export function resolveWorkspaceFolder(value: unknown, projectDir: string, optionName: string): string {
	if (!projectDir || projectDir.trim() === '') {
		throw new Error(
			'Invalid projectDir: must not be empty (the workspace request must carry the project folder of the run)'
		);
	}
	if (value === undefined) {
		return assertDirectory(resolve(projectDir), optionName, 'the project folder');
	}
	if (typeof value !== 'string' || value.trim() === '') {
		throw new Error(
			`Workspace option "${optionName}" must be a non-empty string (a folder path), got ${JSON.stringify(value)}.`
		);
	}
	const resolved = resolve(projectDir, normalize(value));
	if (isDriveRoot(resolved)) {
		throw new Error(`Workspace option "${optionName}" must not be the filesystem root ("${resolved}").`);
	}
	if (isSystemDir(resolved)) {
		throw new Error(`Workspace option "${optionName}" must not be a system directory ("${resolved}").`);
	}
	assertDirectory(resolved, optionName, `"${value}"`);
	if (lstatSync(resolved).isSymbolicLink()) {
		throw new Error(
			`Workspace option "${optionName}" ("${resolved}") is a symbolic link or junction, which is not accepted. Name the real folder instead.`
		);
	}
	return resolved;
}

function assertDirectory(folder: string, optionName: string, label: string): string {
	let stats: Stats;
	try {
		stats = statSync(folder);
	} catch {
		throw new Error(
			`Workspace option "${optionName}": ${label} does not exist ("${folder}"). Create the folder or fix the path (a relative path is relative to the project folder).`
		);
	}
	if (!stats.isDirectory()) {
		throw new Error(`Workspace option "${optionName}": "${folder}" is not a directory.`);
	}
	return folder;
}
