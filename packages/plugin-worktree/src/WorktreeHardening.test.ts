import { HARDENED_GIT_MUTATING_CONFIG, HARDENED_GIT_READING_CONFIG } from 'extension-points';
import type { WorkspaceRequest } from 'extension-points';
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createWorktreeProvider } from './WorktreeWorkspaceProvider.js';

const execa = vi.hoisted(() => vi.fn());
vi.mock('execa', () => ({ execa }));

const stamp = `${Date.now()}-hardening`;
const base = join(tmpdir(), `worktree-base-${stamp}`);
const projectDir = join(tmpdir(), `worktree-project-${stamp}`);
const mutatingFlags = HARDENED_GIT_MUTATING_CONFIG.flatMap(entry => ['-c', entry]);
const readingFlags = HARDENED_GIT_READING_CONFIG.flatMap(entry => ['-c', entry]);

function request(taskId: string): WorkspaceRequest {
	return { taskId, executionId: taskId, projectDir, flow: { id: 'f', version: '1.0.0' } };
}

describe('the default git calls of the worktree provider are hardened', () => {
	beforeEach(() => {
		mkdirSync(base, { recursive: true });
		execa.mockReset();
		execa.mockResolvedValue({ stdout: '' });
	});
	afterEach(() => {
		rmSync(base, { recursive: true, force: true });
	});

	it('the creation and the removal of the worktree disable only the fsmonitor command', async () => {
		const provider = createWorktreeProvider({ baseDir: base });
		const handle = await provider.allocate(request('task-1'));
		await provider.release(handle);

		expect(execa).toHaveBeenCalledTimes(2);
		const [file, addArgs, addOptions] = execa.mock.calls[0];
		expect(file).toBe('git');
		expect(addArgs.slice(0, mutatingFlags.length)).toEqual(mutatingFlags);
		expect(addArgs.slice(mutatingFlags.length, mutatingFlags.length + 2)).toEqual(['worktree', 'add']);
		expect(addOptions.cwd).toBe(projectDir);
		// The hooks of the user repository (git-lfs, husky post-checkout) keep running when the worktree is created.
		expect(addArgs.join(' ')).not.toContain('hooksPath');
		expect(execa.mock.calls[1][1].join(' ')).not.toContain('hooksPath');
		const [, removeArgs, removeOptions] = execa.mock.calls[1];
		expect(removeArgs.slice(0, mutatingFlags.length)).toEqual(mutatingFlags);
		expect(removeArgs.slice(mutatingFlags.length, mutatingFlags.length + 2)).toEqual(['worktree', 'remove']);
		expect(removeOptions.cwd).toBe(projectDir);
	});

	it('the diagnosis probes (version, rev-parse) carry the flags and take no optional lock', async () => {
		execa.mockRejectedValueOnce(new Error('boom'));
		const provider = createWorktreeProvider({ baseDir: base });
		await expect(provider.allocate(request('task-2'))).rejects.toThrow();

		const probes = execa.mock.calls.slice(1);
		expect(probes.length).toBeGreaterThanOrEqual(2);
		for (const [file, args, options] of probes) {
			expect(file).toBe('git');
			expect(args.slice(0, readingFlags.length)).toEqual(readingFlags);
			expect(options.env.GIT_OPTIONAL_LOCKS).toBe('0');
		}
	});
});
