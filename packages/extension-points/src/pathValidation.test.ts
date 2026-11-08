import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { platform, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	resolveWorkspaceFolder,
	validateBaseDir,
	validateBranchNamePrefix,
	validateTaskIdForBranchName,
	validateWorkspacePath,
} from './pathValidation.js';

const isWindows = platform() === 'win32';

describe('validateWorkspacePath', () => {
	it('accepts a safe taskId under the base dir', () => {
		const baseDir = resolve(process.cwd(), 'test-workspaces');
		expect(() => validateWorkspacePath('task-123', baseDir)).not.toThrow();
	});

	it('rejects taskId containing forward slash', () => {
		expect(() => validateWorkspacePath('task/123', '/home/user/workspaces')).toThrow(
			/invalid.*taskId|path traversal/i
		);
	});

	it('rejects taskId containing backslash', () => {
		expect(() => validateWorkspacePath('task\\123', '/home/user/workspaces')).toThrow(
			/invalid.*taskId|path traversal/i
		);
	});

	it('rejects taskId containing .. segments', () => {
		expect(() => validateWorkspacePath('../../../etc', '/home/user/workspaces')).toThrow(
			/invalid.*taskId|path traversal/i
		);
	});

	it('rejects taskId that escapes baseDir after join', () => {
		expect(() => validateWorkspacePath('..', '/home/user/workspaces')).toThrow(/invalid.*taskId|path traversal/i);
	});
});

const PROJECT_DIR = resolve(process.cwd());

describe('validateBaseDir', () => {
	it('compares against the given project directory, not the working directory', () => {
		const project = resolve('/home/user/workspaces/project');
		const parent = resolve('/home/user/workspaces');
		expect(() => validateBaseDir(parent, project)).toThrow(/ancestor of the project root/i);
		expect(() => validateBaseDir(parent, PROJECT_DIR)).not.toThrow(/ancestor/i);
	});

	it('requires a project directory', () => {
		expect(() => validateBaseDir('/home/user/ws', '')).toThrow(/projectDir/i);
	});

	it('accepts a valid workspace dir within home', () => {
		// Use a path that is NOT an ancestor of cwd
		const safeDir = isWindows ? 'C:\\Users\\user\\workspaces' : '/home/user/workspaces';
		// Skip if this path happens to be an ancestor of cwd (unlikely but possible in CI)
		const projectRoot = resolve(process.cwd());
		if (!projectRoot.startsWith(resolve(safeDir))) {
			expect(() => validateBaseDir(safeDir, PROJECT_DIR)).not.toThrow();
		}
	});

	it('rejects filesystem root', () => {
		const rootPath = isWindows ? 'C:\\' : '/';
		expect(() => validateBaseDir(rootPath, PROJECT_DIR)).toThrow(/root|invalid.*baseDir/i);
	});

	it('rejects Unix system directories (non-Windows only)', () => {
		if (isWindows) return;
		expect(() => validateBaseDir('/etc', PROJECT_DIR)).toThrow(/system directory|invalid.*baseDir/i);
		expect(() => validateBaseDir('/usr', PROJECT_DIR)).toThrow(/system directory|invalid.*baseDir/i);
		expect(() => validateBaseDir('/bin', PROJECT_DIR)).toThrow(/system directory|invalid.*baseDir/i);
	});

	it('rejects Windows system directories (Windows only)', () => {
		if (!isWindows) return;
		expect(() => validateBaseDir('C:\\Windows', PROJECT_DIR)).toThrow(/system directory|invalid.*baseDir/i);
		expect(() => validateBaseDir('C:\\Windows\\System32', PROJECT_DIR)).toThrow(
			/system directory|invalid.*baseDir/i
		);
	});

	it('rejects baseDir that is ancestor of project root', () => {
		const projectRoot = resolve(process.cwd());
		const parts = projectRoot.split(isWindows ? '\\' : '/');
		if (parts.length > 2) {
			const parent = parts.slice(0, -1).join(isWindows ? '\\' : '/');
			if (parent && parent.length > (isWindows ? 3 : 1)) {
				expect(() => validateBaseDir(parent, PROJECT_DIR)).toThrow(/ancestor.*project root|invalid.*baseDir/i);
			}
		}
	});

	it('rejects empty string', () => {
		expect(() => validateBaseDir('', PROJECT_DIR)).toThrow(/invalid.*baseDir|empty/i);
	});
});

describe('validateTaskIdForBranchName', () => {
	it('accepts valid alphanumeric taskId', () => {
		expect(() => validateTaskIdForBranchName('task-123')).not.toThrow();
	});

	it('accepts taskId with dots and underscores', () => {
		expect(() => validateTaskIdForBranchName('feature.my_task')).not.toThrow();
	});

	it('rejects taskId with spaces', () => {
		expect(() => validateTaskIdForBranchName('task 123')).toThrow(/invalid.*branch|git ref/i);
	});

	it('rejects taskId with tilde', () => {
		expect(() => validateTaskIdForBranchName('task~123')).toThrow(/invalid.*branch|git ref/i);
	});

	it('rejects taskId with caret', () => {
		expect(() => validateTaskIdForBranchName('task^123')).toThrow(/invalid.*branch|git ref/i);
	});

	it('rejects taskId with colon', () => {
		expect(() => validateTaskIdForBranchName('task:123')).toThrow(/invalid.*branch|git ref/i);
	});

	it('rejects empty string', () => {
		expect(() => validateTaskIdForBranchName('')).toThrow(/invalid.*branch|empty/i);
	});
});

describe('validateBranchNamePrefix', () => {
	it('accepts valid prefix', () => {
		expect(() => validateBranchNamePrefix('feature-')).not.toThrow();
	});

	it('accepts empty prefix (no prefix)', () => {
		expect(() => validateBranchNamePrefix('')).not.toThrow();
	});

	it('accepts undefined prefix', () => {
		expect(() => validateBranchNamePrefix(undefined)).not.toThrow();
	});

	it('rejects prefix with space', () => {
		expect(() => validateBranchNamePrefix('feature ')).toThrow(/invalid.*prefix|git ref/i);
	});

	it('rejects prefix with colon', () => {
		expect(() => validateBranchNamePrefix('feat:')).toThrow(/invalid.*prefix|git ref/i);
	});
});

describe('resolveWorkspaceFolder', () => {
	let root: string;
	let project: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'resolve-folder-'));
		project = join(root, 'project');
		mkdirSync(project);
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	it('returns the project folder when no folder is named', () => {
		expect(resolveWorkspaceFolder(undefined, project, 'dir')).toBe(resolve(project));
	});

	it('resolves a relative folder against the project, not the working directory', () => {
		mkdirSync(join(root, 'sibling'));

		expect(resolveWorkspaceFolder('../sibling', project, 'dir')).toBe(join(root, 'sibling'));
	});

	it('accepts an absolute folder', () => {
		mkdirSync(join(root, 'abs'));

		expect(resolveWorkspaceFolder(join(root, 'abs'), project, 'dir')).toBe(join(root, 'abs'));
	});

	it('names the option and the folder when it does not exist', () => {
		expect(() => resolveWorkspaceFolder('missing', project, 'dir')).toThrow(/"dir".*missing.*does not exist/s);
	});

	it('refuses a file', () => {
		writeFileSync(join(root, 'file.txt'), 'x');

		expect(() => resolveWorkspaceFolder('../file.txt', project, 'dir')).toThrow(/not a directory/);
	});

	it('refuses the filesystem root', () => {
		expect(() => resolveWorkspaceFolder(isWindows ? 'C:\\' : '/', project, 'dir')).toThrow(/root/);
	});

	it('refuses a system directory', () => {
		const system = isWindows ? 'C:\\Windows' : '/etc';

		expect(() => resolveWorkspaceFolder(system, project, 'dir')).toThrow(/system directory/);
	});

	it('refuses a symbolic link or junction named as the folder', () => {
		mkdirSync(join(root, 'target'));
		try {
			symlinkSync(join(root, 'target'), join(root, 'link'), 'junction');
		} catch {
			return;
		}

		expect(() => resolveWorkspaceFolder('../link', project, 'dir')).toThrow(/symbolic link or junction/);
	});

	it('refuses a non-string value', () => {
		expect(() => resolveWorkspaceFolder(3, project, 'dir')).toThrow(/"dir" must be a non-empty string/);
	});

	it('requires the project folder', () => {
		expect(() => resolveWorkspaceFolder('x', '', 'dir')).toThrow(/projectDir/);
	});
});
