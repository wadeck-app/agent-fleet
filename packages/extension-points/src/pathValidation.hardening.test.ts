import { beforeEach, describe, expect, it, vi } from 'vitest';

import { HARDENED_GIT_READING_CONFIG } from './HardenedGit.js';
import { validateBaseDir } from './pathValidation.js';

const execFileSync = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFileSync }));

describe('validateBaseDir: the worktree listing runs hardened git', () => {
	beforeEach(() => {
		execFileSync.mockReset();
		execFileSync.mockReturnValue('');
	});

	it('lists the worktrees of the project with the hardening flags and without optional locks', () => {
		validateBaseDir(process.platform === 'win32' ? 'C:\\worktrees\\base' : '/worktrees/base', process.cwd());

		expect(execFileSync).toHaveBeenCalledTimes(1);
		const [file, args, options] = execFileSync.mock.calls[0];
		expect(file).toBe('git');
		expect(args).toEqual([
			...HARDENED_GIT_READING_CONFIG.flatMap(entry => ['-c', entry]),
			'worktree',
			'list',
			'--porcelain',
		]);
		expect(options.cwd).toBe(process.cwd());
		expect(options.env.GIT_OPTIONAL_LOCKS).toBe('0');
	});
});
