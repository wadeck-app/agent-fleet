import type { WorkspaceRequest } from 'extension-points';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorktreeProvider } from './WorktreeWorkspaceProvider.js';

const tmp = join(tmpdir(), `worktree-test-${Date.now()}`);
const projectDir = join(tmpdir(), `worktree-project-${Date.now()}`);

function request(taskId: string): WorkspaceRequest {
	return { taskId, executionId: taskId, projectDir, flow: { id: 'f', version: '1.0.0' } };
}

beforeEach(() => {
	mkdirSync(tmp, { recursive: true });
});

afterEach(() => {
	rmSync(tmp, { recursive: true, force: true });
	vi.restoreAllMocks();
});

describe('validateBaseDir via allocate', () => {
	it('rejects baseDir = filesystem root', async () => {
		const provider = createWorktreeProvider({ baseDir: '/' });
		await expect(provider.allocate(request('task-1'))).rejects.toThrow(/root|invalid.*baseDir/i);
	});
});

describe('validateWorkspacePath via allocate', () => {
	it('rejects taskId with path traversal', async () => {
		const provider = createWorktreeProvider({ baseDir: tmp });
		await expect(provider.allocate(request('../../etc'))).rejects.toThrow(/invalid.*taskId|path traversal/i);
	});

	it('rejects taskId with forward slash', async () => {
		const provider = createWorktreeProvider({ baseDir: tmp });
		await expect(provider.allocate(request('task/123'))).rejects.toThrow(/invalid.*taskId|path traversal/i);
	});
});

describe('validateTaskIdForBranchName via allocate', () => {
	it('rejects taskId with illegal git ref chars (tilde)', async () => {
		const provider = createWorktreeProvider({ baseDir: tmp });
		await expect(provider.allocate(request('task~1'))).rejects.toThrow(/invalid.*branch|git ref/i);
	});

	it('rejects taskId with caret', async () => {
		const provider = createWorktreeProvider({ baseDir: tmp });
		await expect(provider.allocate(request('task^1'))).rejects.toThrow(/invalid.*branch|git ref/i);
	});
});

describe('validateBranchNamePrefix via allocate', () => {
	it('rejects prefix with illegal chars (space)', async () => {
		const provider = createWorktreeProvider({ baseDir: tmp, prefix: 'my prefix-' });
		await expect(provider.allocate(request('task-1'))).rejects.toThrow(/invalid.*prefix|git ref/i);
	});
});

describe('WorktreeWorkspaceProvider - project directory', () => {
	it('runs git in the project of the run, not in the working directory of the daemon', async () => {
		const calls: { args: string[]; cwd: string }[] = [];
		const provider = createWorktreeProvider({
			baseDir: tmp,
			prefix: 'test-',
			_execGit: async (args: string[], cwd: string) => {
				calls.push({ args, cwd });
			},
		});

		const handle = await provider.allocate(request('my-task'));
		await provider.release(handle);

		expect(calls.map(call => call.cwd)).toEqual([projectDir, projectDir]);
	});

	it('refuses to release a handle it did not allocate, naming the path to remove by hand', async () => {
		const provider = createWorktreeProvider({ baseDir: tmp, _execGit: async () => {} });

		await expect(provider.release({ path: join(tmp, 'x'), id: 'worktree:x' })).rejects.toThrow(/did not allocate/);
	});
});

describe('WorktreeWorkspaceProvider - mocked git calls', () => {
	it('allocate() calls git worktree add with array args (no shell interpolation)', async () => {
		const gitCalls: string[][] = [];
		const provider = createWorktreeProvider({
			baseDir: tmp,
			prefix: 'test-',
			_execGit: async (args: string[]) => {
				gitCalls.push(args);
			},
		});

		const handle = await provider.allocate(request('my-task'));
		expect(handle.id).toBe(`worktree:${join(tmp, 'test-my-task')}`);
		expect(handle.path).toBe(join(tmp, 'test-my-task'));

		expect(gitCalls.length).toBeGreaterThan(0);
		const addCall = gitCalls.find(args => args.includes('add'));
		expect(addCall).toBeDefined();
		// Must use array args - no string interpolation
		expect(Array.isArray(addCall)).toBe(true);
	});

	it('allocate() errors if workspace already exists', async () => {
		mkdirSync(join(tmp, 'test-my-task'), { recursive: true });
		const provider = createWorktreeProvider({
			baseDir: tmp,
			prefix: 'test-',
			_execGit: async () => {},
		});

		await expect(provider.allocate(request('my-task'))).rejects.toThrow(/already exists|workspace.*exists/i);
	});

	it('release() calls git worktree remove with the handle path', async () => {
		const gitCalls: string[][] = [];
		const provider = createWorktreeProvider({
			baseDir: tmp,
			prefix: 'test-',
			_execGit: async (args: string[]) => {
				gitCalls.push(args);
			},
		});

		const handle = await provider.allocate(request('my-task'));
		gitCalls.length = 0; // clear allocate calls

		await provider.release(handle);

		const removeCall = gitCalls.find(args => args.includes('remove'));
		expect(removeCall).toBeDefined();
		// Must include the worktree path
		expect(removeCall?.some(arg => arg.includes('test-my-task'))).toBe(true);
	});

	it('release() propagates error when no prior flow error and git fails', async () => {
		const provider = createWorktreeProvider({
			baseDir: tmp,
			prefix: 'test-',
			_execGit: async (args: string[]) => {
				if (args.includes('remove')) {
					throw new Error('git remove failed');
				}
			},
		});

		const handle = await provider.allocate(request('my-task'));
		await expect(provider.release(handle)).rejects.toThrow(/git remove failed/);
	});
});
