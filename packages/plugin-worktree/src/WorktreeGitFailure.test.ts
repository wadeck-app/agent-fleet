import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { WorktreeGitError } from './WorktreeGitError.js';
import { createWorktreeProvider } from './WorktreeWorkspaceProvider.js';

describe('worktree: a failed git setup is diagnosed, not reported as an exit code', () => {
	const base = join(tmpdir(), `worktree-fail-${Date.now()}`);
	const projectDir = join(tmpdir(), `worktree-fail-project-${Date.now()}`);
	const request = {
		taskId: 'abcd1234',
		executionId: 'abcd1234',
		projectDir,
		flow: { id: 'f', version: '1.0.0' },
	};

	beforeEach(() => {
		mkdirSync(base, { recursive: true });
	});
	afterEach(() => {
		rmSync(base, { recursive: true, force: true });
	});

	function providerWhere(probes: Record<string, string | Error>) {
		return createWorktreeProvider({
			baseDir: base,
			_execGit: async () => {
				throw new Error('Command failed with exit code 128: git add\nfatal: not a git repository');
			},
			_gitOutput: async (args: string[]) => {
				const answer = probes[args.join(' ')];
				if (answer instanceof Error) {
					throw answer;
				}
				return answer ?? '';
			},
		});
	}

	async function failure(probes: Record<string, string | Error>): Promise<WorktreeGitError> {
		try {
			await providerWhere(probes).allocate(request);
		} catch (error) {
			if (error instanceof WorktreeGitError) {
				return error;
			}
			throw error;
		}
		throw new Error('expected the allocation to fail');
	}

	it('names git missing from the PATH', async () => {
		const error = await failure({ '--version': new Error('spawn git ENOENT') });

		expect(error.code).toBe('WORKSPACE_GIT_FAILED');
		expect(error.failureCause).toBe('git-not-installed');
		expect(error.message).toContain('git was not found');
	});

	it('names a project folder that is not a git repository, with the folder and the fix', async () => {
		const error = await failure({
			'--version': 'git version 2',
			'rev-parse --is-inside-work-tree': new Error('fatal'),
		});

		expect(error.failureCause).toBe('not-a-repository');
		expect(error.message).toContain(projectDir);
		expect(error.message).toContain('not a git repository');
		expect(error.message).toContain('in-place');
	});

	it('names a repository without any commit', async () => {
		const error = await failure({
			'--version': 'git version 2',
			'rev-parse --is-inside-work-tree': 'true',
			'rev-parse --verify HEAD': new Error('fatal: Needed a single revision'),
		});

		expect(error.failureCause).toBe('no-commits');
		expect(error.message).toContain('no commit');
	});

	it('otherwise reports what git said, with the credentials removed', async () => {
		const provider = createWorktreeProvider({
			baseDir: base,
			_execGit: async () => {
				throw new Error('fatal: unable to access https://user:secret-token@example.com/repo.git');
			},
			_gitOutput: async () => 'true',
		});

		const error = (await provider.allocate(request).catch((caught: unknown) => caught)) as WorktreeGitError;

		expect(error).toBeInstanceOf(WorktreeGitError);
		expect(error.failureCause).toBe('git-command-failed');
		expect(error.message).toContain('unable to access');
		expect(error.message).not.toContain('secret-token');
	});

	it('records nothing when the setup fails: a release is refused as unknown', async () => {
		const provider = providerWhere({ '--version': new Error('x') });
		await provider.allocate(request).catch(() => undefined);

		await expect(provider.release({ path: join(base, 'abcd1234'), id: 'x' })).rejects.toThrow(/did not allocate/);
	});
});
