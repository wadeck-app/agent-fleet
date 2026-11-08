/**
 * The folders this strategy reads may have been written by a previous run (a sandboxed run can edit `.git/config`).
 * Reading calls carry fsmonitor and hooks off; mutating calls (worktree add/remove, clone, checkout) only fsmonitor off,
 * so the hooks of the user's own repository (git-lfs, husky) keep running.
 */
import { HARDENED_GIT_MUTATING_CONFIG, HARDENED_GIT_READING_CONFIG } from 'extension-points';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { WorkspaceGitStrategy } from './WorkspaceGitStrategy';

const simpleGitFactory = vi.hoisted(() => vi.fn());
vi.mock('simple-git', async importOriginal => {
	const original = await importOriginal<typeof import('simple-git')>();
	return { ...original, simpleGit: simpleGitFactory };
});

// The unmocked library, to run real git in the integration cases.
const { simpleGit: realSimpleGit } = await vi.importActual<typeof import('simple-git')>('simple-git');

interface RecordedCall {
	method: string;
	args: unknown[];
	config: string[];
	unsafe: Record<string, boolean>;
}

/** Every method of every simple-git instance created, with the options of that instance. */
const recorded: RecordedCall[] = [];

/** A simple-git stand-in: every method resolves with a harmless value and is recorded. */
function fakeGit(options: { config: string[]; unsafe: Record<string, boolean> }): unknown {
	const answers: Record<string, unknown> = {
		status: { current: 'main', isClean: () => true },
		log: { latest: { hash: 'abc' } },
		branch: { all: [] },
	};
	return new Proxy(
		{},
		{
			get: (_target, name: string) => {
				if (name === 'then') return undefined;
				return async (...args: unknown[]) => {
					recorded.push({ method: name, args, config: options.config, unsafe: options.unsafe });
					return answers[name] ?? '';
				};
			},
		}
	);
}

const READING_RAW = new Set(['--version', 'rev-parse']);
const READING_METHODS = new Set(['status', 'log', 'branch']);

/** Reads are `status`, `log`, `branch()` listing, `--version`, `rev-parse` and `worktree list`; the rest changes the repository. */
function isReading(call: RecordedCall): boolean {
	if (call.method === 'raw') {
		const [first, second] = call.args[0] as string[];
		return READING_RAW.has(first) || (first === 'worktree' && second === 'list');
	}
	return READING_METHODS.has(call.method);
}

function rawSubcommand(call: RecordedCall, name: string): boolean {
	return call.method === 'raw' && (call.args[0] as string[])[1] === name;
}

describe('WorkspaceGitStrategy passes the hardening flags to every git call', () => {
	let scratch: string;

	beforeEach(() => {
		scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-strategy-flags-'));
		simpleGitFactory.mockReset();
		recorded.length = 0;
		simpleGitFactory.mockImplementation(options => fakeGit(options));
	});
	afterEach(() => {
		fs.rmSync(scratch, { recursive: true, force: true });
	});

	function expectModePerCall(): void {
		expect(recorded.length).toBeGreaterThan(0);
		for (const call of recorded) {
			const label = `${call.method} ${JSON.stringify(call.args)}`;
			if (isReading(call)) {
				expect(call.config, label).toEqual([...HARDENED_GIT_READING_CONFIG]);
				expect(call.unsafe, label).toEqual({ allowUnsafeFsMonitor: true, allowUnsafeHooksPath: true });
			} else {
				expect(call.config, label).toEqual([...HARDENED_GIT_MUTATING_CONFIG]);
				expect(call.unsafe, label).toEqual({ allowUnsafeFsMonitor: true });
			}
		}
	}

	it('state reading, worktree listing and removal', async () => {
		const strategy = new WorkspaceGitStrategy(scratch);
		await strategy.getGitState(scratch);
		await strategy.isWorktree(path.join(scratch, 'w'));
		await strategy.removeWorktree(path.join(scratch, 'w'));
		await strategy.explainManualWithoutGit(scratch);

		expectModePerCall();
		expect(recorded.find(call => rawSubcommand(call, 'remove'))?.config).toEqual(['core.fsmonitor=false']);
		expect(recorded.find(call => call.method === 'status')?.config).toHaveLength(2);
	});

	it('the worktree setup reads with hooks off and creates the branch and the worktree with hooks on', async () => {
		await new WorkspaceGitStrategy(scratch).setupGit(path.join(scratch, 'w'), 'worktree', 'main', {}, 'task-1234');

		expectModePerCall();
		const creation = recorded.find(call => rawSubcommand(call, 'add'));
		expect(creation?.config).toEqual(['core.fsmonitor=false']);
		expect(creation?.config.join()).not.toContain('hooksPath');
	});

	it('the clone setup clones and checks out with hooks on, and reads the state with hooks off', async () => {
		await new WorkspaceGitStrategy(scratch).setupGit(path.join(scratch, 'c'), 'main-only', 'main', {}, 'task-1234');

		expectModePerCall();
		for (const method of ['clone', 'checkout']) {
			const call = recorded.find(candidate => candidate.method === method);
			expect(call?.config, method).toEqual(['core.fsmonitor=false']);
		}
	});
});

describe('WorkspaceGitStrategy against a repository written by a run', () => {
	let scratch: string;

	beforeEach(() => {
		scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'ws-strategy-fsmonitor-'));
	});
	afterEach(() => {
		fs.rmSync(scratch, { recursive: true, force: true });
	});

	function git(cwd: string, ...args: string[]): void {
		execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, stdio: 'ignore' });
	}

	function plantFsmonitor(): { repo: string; canary: string } {
		const repo = path.join(scratch, 'slot');
		fs.mkdirSync(repo);
		git(repo, 'init', '-q');
		fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
		git(repo, 'add', '.');
		git(repo, 'commit', '-q', '-m', 'init');
		const canary = path.join(scratch, 'canary.out');
		const script = path.join(scratch, 'canary.js');
		fs.writeFileSync(script, 'require("fs").writeFileSync(process.argv[2], "ran");\nconsole.log("");\n');
		const posix = (file: string): string => file.replaceAll('\\', '/');
		git(repo, 'config', 'core.fsmonitor', `"${posix(process.execPath)}" "${posix(script)}" "${posix(canary)}"`);
		return { repo, canary };
	}

	it('control: an unhardened status through simple-git runs the planted command', async () => {
		const { repo, canary } = plantFsmonitor();
		await realSimpleGit({ baseDir: repo }).status();

		expect(fs.existsSync(canary)).toBe(true);
	});

	it('does not run the planted core.fsmonitor command when reading the state', async () => {
		const { repo, canary } = plantFsmonitor();
		simpleGitFactory.mockImplementation((...args: Parameters<typeof realSimpleGit>) => realSimpleGit(...args));

		const state = await new WorkspaceGitStrategy(repo).getGitState(repo);

		expect(state?.isClean).toBe(true);
		expect(fs.existsSync(canary)).toBe(false);
	});
});
