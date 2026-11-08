import { HARDENED_GIT_READING_CONFIG } from 'extension-points';
import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { type GitExecFile, GitFolderProbe } from './GitFolderProbe';
import { RUN_META_RELATIVE_DIR } from './RunMetaDir';

function git(cwd: string, ...args: string[]): void {
	execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, stdio: 'ignore' });
}

describe('GitFolderProbe', () => {
	let root: string;
	const probe = new GitFolderProbe();

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'git-probe-'));
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('reports a folder outside any repository', async () => {
		await expect(probe.inspect(root)).resolves.toEqual({ isRepository: false, dirty: false });
	});

	it('reports a clean repository', async () => {
		git(root, 'init', '-q');
		fs.writeFileSync(path.join(root, 'a.txt'), 'a');
		git(root, 'add', '.');
		git(root, 'commit', '-q', '-m', 'init');

		await expect(probe.inspect(root)).resolves.toEqual({ isRepository: true, dirty: false });
	});

	it('reports uncommitted changes', async () => {
		git(root, 'init', '-q');
		fs.writeFileSync(path.join(root, 'a.txt'), 'a');

		await expect(probe.inspect(root)).resolves.toEqual({ isRepository: true, dirty: true });
	});

	it('does not count the run metadata of the daemon as a change', async () => {
		git(root, 'init', '-q');
		fs.writeFileSync(path.join(root, 'a.txt'), 'a');
		git(root, 'add', '.');
		git(root, 'commit', '-q', '-m', 'init');
		const meta = path.join(root, RUN_META_RELATIVE_DIR, 'abcd1234.meta', 'outputs');
		fs.mkdirSync(meta, { recursive: true });
		fs.writeFileSync(path.join(meta, 'out.txt'), 'x');

		await expect(probe.inspect(root)).resolves.toEqual({ isRepository: true, dirty: false });
	});
});

describe('GitFolderProbe hardening', () => {
	it('runs every git call with the hardening flags and without optional locks', async () => {
		const calls: Array<{ args: string[]; env: NodeJS.ProcessEnv | undefined; cwd: string | undefined }> = [];
		const fakeExec: GitExecFile = (_file, args, options, callback) => {
			calls.push({ args, env: options.env, cwd: options.cwd });
			callback(null, 'true\n');
		};

		await new GitFolderProbe(fakeExec).inspect('/slot');

		expect(calls).toHaveLength(2);
		for (const call of calls) {
			expect(call.cwd).toBe('/slot');
			expect(call.args.slice(0, 4)).toEqual(['-c', 'core.fsmonitor=false', '-c', HARDENED_GIT_READING_CONFIG[1]]);
			expect(call.env?.GIT_OPTIONAL_LOCKS).toBe('0');
		}
		expect(calls[0].args).toContain('rev-parse');
		expect(calls[1].args).toContain('status');
	});
});

describe('GitFolderProbe against a repository written by a run', () => {
	let scratch: string;

	beforeEach(() => {
		scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'git-probe-fsmonitor-'));
	});
	afterEach(() => {
		fs.rmSync(scratch, { recursive: true, force: true });
	});

	/** A repository whose config names a core.fsmonitor command that leaves a canary file when git runs it. */
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

	it('control: a plain git status in that repository runs the planted command', () => {
		const { repo, canary } = plantFsmonitor();
		execFileSync('git', ['status', '--porcelain'], { cwd: repo, stdio: 'ignore' });

		expect(fs.existsSync(canary)).toBe(true);
	});

	it('does not run the planted core.fsmonitor command', async () => {
		const { repo, canary } = plantFsmonitor();

		await expect(new GitFolderProbe().inspect(repo)).resolves.toEqual({ isRepository: true, dirty: false });

		expect(fs.existsSync(canary)).toBe(false);
	});
});
