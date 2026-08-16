import { platform } from 'node:os';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
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

describe('validateBaseDir', () => {
	it('accepts a valid workspace dir within home', () => {
		// Use a path that is NOT an ancestor of cwd
		const safeDir = isWindows ? 'C:\\Users\\user\\workspaces' : '/home/user/workspaces';
		// Skip if this path happens to be an ancestor of cwd (unlikely but possible in CI)
		const projectRoot = resolve(process.cwd());
		if (!projectRoot.startsWith(resolve(safeDir))) {
			expect(() => validateBaseDir(safeDir)).not.toThrow();
		}
	});

	it('rejects filesystem root', () => {
		const rootPath = isWindows ? 'C:\\' : '/';
		expect(() => validateBaseDir(rootPath)).toThrow(/root|invalid.*baseDir/i);
	});

	it('rejects Unix system directories (non-Windows only)', () => {
		if (isWindows) return;
		expect(() => validateBaseDir('/etc')).toThrow(/system directory|invalid.*baseDir/i);
		expect(() => validateBaseDir('/usr')).toThrow(/system directory|invalid.*baseDir/i);
		expect(() => validateBaseDir('/bin')).toThrow(/system directory|invalid.*baseDir/i);
	});

	it('rejects Windows system directories (Windows only)', () => {
		if (!isWindows) return;
		expect(() => validateBaseDir('C:\\Windows')).toThrow(/system directory|invalid.*baseDir/i);
		expect(() => validateBaseDir('C:\\Windows\\System32')).toThrow(/system directory|invalid.*baseDir/i);
	});

	it('rejects baseDir that is ancestor of project root', () => {
		const projectRoot = resolve(process.cwd());
		const parts = projectRoot.split(isWindows ? '\\' : '/');
		if (parts.length > 2) {
			const parent = parts.slice(0, -1).join(isWindows ? '\\' : '/');
			if (parent && parent.length > (isWindows ? 3 : 1)) {
				expect(() => validateBaseDir(parent)).toThrow(/ancestor.*project root|invalid.*baseDir/i);
			}
		}
	});

	it('rejects empty string', () => {
		expect(() => validateBaseDir('')).toThrow(/invalid.*baseDir|empty/i);
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
