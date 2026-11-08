/**
 * A failed git setup must refuse the allocation (never continue in an empty directory), with a message that names
 * what was attempted, what git said, and what to do, and must leave no directory behind.
 */
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import type { GitStrategy, WorkspaceConfig } from '../types';
import { WorkspaceManager } from './WorkspaceManager';
import { WorkspaceGitSetupError } from './WorkspaceTypes';

const CLONE_STRATEGIES: GitStrategy[] = ['main-only', 'any', 'feature-branch'];
const ALL_GIT_STRATEGIES: GitStrategy[] = [...CLONE_STRATEGIES, 'worktree'];

function git(cwd: string, ...args: string[]): string {
	return execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], {
		cwd,
		encoding: 'utf8',
		stdio: ['ignore', 'pipe', 'pipe'],
	}).trim();
}

function configFor(gitStrategy: GitStrategy): WorkspaceConfig {
	return { mode: 'isolated', gitStrategy, reusePolicy: 'never' };
}

describe('WorkspaceManager git setup failures', () => {
	let scratch: string;
	let projectRoot: string;

	// Real git is slow on Windows (antivirus, cold start) and slower under load: the repositories are built once per file
	// and each test gets a copy, so git runs three times here instead of once per test.
	let templates: string;
	const TEMPLATE_BUILD_TIMEOUT_MS = 60_000;

	beforeAll(() => {
		templates = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-git-templates-'));
		for (const branch of ['main', 'master']) {
			const dir = path.join(templates, branch);
			fs.mkdirSync(dir);
			git(dir, 'init', '-q', '-b', branch);
			fs.writeFileSync(path.join(dir, 'README.md'), 'hello');
			git(dir, 'add', '.');
			git(dir, 'commit', '-q', '-m', 'init');
		}
		const empty = path.join(templates, 'empty');
		fs.mkdirSync(empty);
		git(empty, 'init', '-q', '-b', 'main');
	}, TEMPLATE_BUILD_TIMEOUT_MS);

	afterAll(() => {
		fs.rmSync(templates, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
	});

	/** A fresh copy of a template repository at the project root: `main`, `master` (both with one commit) or `empty` (no commit). */
	function makeRepo(template: 'main' | 'master' | 'empty'): void {
		fs.cpSync(path.join(templates, template), projectRoot, { recursive: true });
	}

	function leftovers(): string[] {
		const base = path.join(projectRoot, '.flow', 'workspaces');
		return fs.existsSync(base) ? fs.readdirSync(base) : [];
	}

	async function rejection(manager: WorkspaceManager, strategy: GitStrategy, taskId = 'task-1'): Promise<Error> {
		try {
			await manager.allocate({ taskId, config: configFor(strategy) });
		} catch (error) {
			return error as Error;
		}
		throw new Error(`allocation with gitStrategy ${strategy} was accepted but git setup must have failed`);
	}

	beforeEach(() => {
		scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-git-failure-'));
		projectRoot = path.join(scratch, 'project');
	});

	afterEach(() => {
		fs.rmSync(scratch, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
	});

	describe.each(ALL_GIT_STRATEGIES)('gitStrategy %s outside a git repository', strategy => {
		it('refuses the allocation, explains the cause and leaves no directory', async () => {
			fs.mkdirSync(projectRoot, { recursive: true });
			const manager = new WorkspaceManager(projectRoot);

			const error = await rejection(manager, strategy);

			expect(error).toBeInstanceOf(WorkspaceGitSetupError);
			const failure = error as WorkspaceGitSetupError;
			expect(failure.code).toBe('WORKSPACE_GIT_FAILED');
			expect(failure.failureCause).toBe('not-a-repository');
			expect(failure.message).toContain(`gitStrategy "${strategy}"`);
			expect(failure.message).toContain(projectRoot);
			expect(failure.message).toContain('not a git repository');
			expect(failure.message).toContain('run flow from inside the repository');
			expect(failure.message).toContain('gitStrategy "none"');
			expect(leftovers()).toEqual([]);
			expect(manager.getAllWorkspaces()).toEqual([]);
		});
	});

	describe.each(ALL_GIT_STRATEGIES)('gitStrategy %s with git unavailable', strategy => {
		it('refuses the allocation and says to install git or use gitStrategy none', async () => {
			// No repository needed: the "git --version" probe fails before the project is touched.
			fs.mkdirSync(projectRoot, { recursive: true });
			const manager = new WorkspaceManager(projectRoot, { gitBinary: path.join(scratch, 'no-such-git') });

			const error = await rejection(manager, strategy);

			expect(error).toBeInstanceOf(WorkspaceGitSetupError);
			expect((error as WorkspaceGitSetupError).failureCause).toBe('git-not-installed');
			expect(error.message).toContain('git was not found');
			expect(error.message).toContain('PATH');
			expect(error.message).toContain('install git');
			expect(error.message).toContain('gitStrategy "none"');
			expect(leftovers()).toEqual([]);
		});
	});

	describe.each(CLONE_STRATEGIES)('gitStrategy %s when branch "main" does not exist', strategy => {
		it('names the current branch and what to do instead', async () => {
			makeRepo('master');
			const manager = new WorkspaceManager(projectRoot);

			const error = await rejection(manager, strategy);

			expect(error).toBeInstanceOf(WorkspaceGitSetupError);
			expect((error as WorkspaceGitSetupError).failureCause).toBe('branch-missing');
			expect(error.message).toContain('branch "main" does not exist');
			expect(error.message).toContain('current branch is "master"');
			expect(error.message).toContain('git branch main master');
			expect(error.message).toContain('no field');
			expect(leftovers()).toEqual([]);
		});
	});

	describe.each(ALL_GIT_STRATEGIES)('gitStrategy %s in a repository without any commit', strategy => {
		it('refuses the allocation and says to make a first commit', async () => {
			makeRepo('empty');
			const manager = new WorkspaceManager(projectRoot);

			const error = await rejection(manager, strategy);

			expect((error as WorkspaceGitSetupError).failureCause).toBe('no-commits');
			expect(error.message).toContain('no commit');
			expect(error.message).toContain('git commit');
			expect(leftovers()).toEqual([]);
		});
	});

	it('refuses a git strategy it does not know instead of cloning without a checkout', async () => {
		makeRepo('main');
		const manager = new WorkspaceManager(projectRoot);

		const error = await rejection(manager, 'bogus' as GitStrategy);

		expect(error).toBeInstanceOf(WorkspaceGitSetupError);
		expect(error.message).toContain('"bogus"');
		expect(error.message).toContain('main-only, feature-branch, any, worktree, none');
		expect(leftovers()).toEqual([]);
	});

	describe('worktree', () => {
		it('creates the worktree without switching the branch of the project', async () => {
			makeRepo('main');
			const manager = new WorkspaceManager(projectRoot);

			const workspace = await manager.allocate({ taskId: 'abcd-task', config: configFor('worktree') });

			expect(fs.existsSync(path.join(workspace.path, 'README.md'))).toBe(true);
			expect(workspace.git?.branch).toMatch(/^fleet\/task-abcd-/);
			expect(git(projectRoot, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe('main');
			await manager.release(workspace.id, 'abcd-task');
			expect(fs.existsSync(workspace.path)).toBe(false);
		});

		it('works on a repository whose branch is not main, since it starts from HEAD', async () => {
			makeRepo('master');
			const manager = new WorkspaceManager(projectRoot);

			const workspace = await manager.allocate({ taskId: 'abcd-task', config: configFor('worktree') });

			expect(fs.existsSync(path.join(workspace.path, 'README.md'))).toBe(true);
			await manager.release(workspace.id, 'abcd-task');
		});

		it('refuses when git cannot add the worktree, quotes git, keeps the existing branch and leaves no directory', async () => {
			makeRepo('main');
			const branch = 'fleet/task-abcd-task';
			git(projectRoot, 'branch', branch);
			const elsewhere = path.join(scratch, 'elsewhere');
			git(projectRoot, 'worktree', 'add', elsewhere, branch);
			const manager = new WorkspaceManager(projectRoot);

			const error = await rejection(manager, 'worktree', 'abcd-1');

			expect(error).toBeInstanceOf(WorkspaceGitSetupError);
			expect((error as WorkspaceGitSetupError).failureCause).toBe('git-command-failed');
			expect(error.message).toContain('git worktree add');
			expect(error.message).toContain('already');
			expect(error.message).toContain(branch);
			expect(git(projectRoot, 'branch', '--list', branch)).toContain(branch);
			expect(leftovers()).toEqual([]);
			expect(manager.getAllWorkspaces()).toEqual([]);
		});
	});

	describe('success paths are unchanged', () => {
		it.each(['main-only', 'any'] as const)('%s checks main out in a clone', async strategy => {
			makeRepo('main');
			const manager = new WorkspaceManager(projectRoot);

			const workspace = await manager.allocate({ taskId: 'task-1', config: configFor(strategy) });

			expect(workspace.git?.branch).toBe('main');
			expect(fs.existsSync(path.join(workspace.path, 'README.md'))).toBe(true);
			await manager.release(workspace.id, 'task-1');
		});

		it('feature-branch creates a fleet branch from main', async () => {
			makeRepo('main');
			const manager = new WorkspaceManager(projectRoot);

			const workspace = await manager.allocate({ taskId: 'abcd-task', config: configFor('feature-branch') });

			expect(workspace.git?.branch).toMatch(/^fleet\/task-abcd-/);
			await manager.release(workspace.id, 'abcd-task');
		});

		it('none needs no git at all', async () => {
			fs.mkdirSync(projectRoot, { recursive: true });
			const manager = new WorkspaceManager(projectRoot, { gitBinary: path.join(scratch, 'no-such-git') });

			const workspace = await manager.allocate({ taskId: 'task-1', config: configFor('none') });

			expect(workspace.git).toBeUndefined();
			expect(fs.existsSync(workspace.path)).toBe(true);
		});
	});

	describe('a workspace directory that cannot be removed after the failure', () => {
		it('is named in the error with the instruction to remove it by hand', async () => {
			fs.mkdirSync(projectRoot, { recursive: true });
			// Not a git repository (setup fails), and the cleanup is made to fail through the injected remover
			const manager = new WorkspaceManager(projectRoot, {
				removeDirectory: () => {
					throw new Error('EBUSY: resource busy');
				},
			});

			const error = await rejection(manager, 'main-only');

			expect(error.message).toContain('could not be removed');
			expect(error.message).toContain('EBUSY');
			expect(error.message).toContain(path.join(projectRoot, '.flow', 'workspaces'));
			expect(error.message).toContain('delete');
		});
	});

	describe('manual mode', () => {
		it('warns, with the cause and what to do, when the directory is not a git repository', async () => {
			const manual = path.join(scratch, 'manual');
			fs.mkdirSync(manual, { recursive: true });
			const warnings: string[] = [];
			const manager = new WorkspaceManager(projectRoot, { onWarning: message => warnings.push(message) });

			const workspace = await manager.allocate({
				taskId: 'task-1',
				config: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'never' },
				existingPath: manual,
			});

			expect(workspace.path).toBe(manual);
			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain(manual);
			expect(warnings[0]).toContain('not a git repository');
			expect(warnings[0]).toContain('git init');
		});

		it('warns, with what to do, when the directory has uncommitted changes', async () => {
			makeRepo('main');
			fs.writeFileSync(path.join(projectRoot, 'dirty.txt'), 'x');
			const warnings: string[] = [];
			const manager = new WorkspaceManager(projectRoot, { onWarning: message => warnings.push(message) });

			await manager.allocate({
				taskId: 'task-1',
				config: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'never' },
				existingPath: projectRoot,
			});

			expect(warnings).toHaveLength(1);
			expect(warnings[0]).toContain('uncommitted changes');
			expect(warnings[0]).toContain('git stash');
		});

		it('says git is not installed rather than "not a git repository" when git is missing', async () => {
			const manual = path.join(scratch, 'manual');
			fs.mkdirSync(manual, { recursive: true });
			const warnings: string[] = [];
			const manager = new WorkspaceManager(projectRoot, {
				gitBinary: path.join(scratch, 'no-such-git'),
				onWarning: message => warnings.push(message),
			});

			await manager.allocate({
				taskId: 'task-1',
				config: { mode: 'manual', gitStrategy: 'any', reusePolicy: 'never' },
				existingPath: manual,
			});

			expect(warnings[0]).toContain('git was not found');
		});
	});
});
