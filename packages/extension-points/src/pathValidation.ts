import { execSync } from 'node:child_process';
import { normalize, parse, resolve, sep } from 'node:path';

const UNIX_SYSTEM_DIRS = ['/etc', '/usr', '/bin', '/sbin', '/lib', '/lib64', '/boot', '/sys', '/proc', '/dev', '/var'];

const WINDOWS_SYSTEM_DIRS = ['windows', 'program files', 'program files (x86)', 'system32', 'winnt'];

const GIT_REF_ALLOWLIST = /^[a-zA-Z0-9._-]+$/;

function isDriveRoot(resolved: string): boolean {
	// Unix root: "/"
	if (resolved === '/') return true;
	// Windows root: "C:\" or "C:/"
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

function getActiveWorktreePaths(): string[] {
	try {
		const output = execSync('git worktree list --porcelain', {
			encoding: 'utf8',
			stdio: ['ignore', 'pipe', 'ignore'],
			windowsHide: true,
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

export function validateBaseDir(baseDir: string): void {
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

	const projectRoot = resolve(process.cwd());
	if (projectRoot.startsWith(resolved + sep) || projectRoot.startsWith(resolved + '/')) {
		throw new Error(`Invalid baseDir "${resolved}": must not be an ancestor of the project root "${projectRoot}"`);
	}

	// Reject if baseDir is nested inside an existing git worktree (would create nested worktrees)
	const worktreePaths = getActiveWorktreePaths();
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
