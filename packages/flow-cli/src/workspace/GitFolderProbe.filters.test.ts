import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { type GitExecFile, GitFolderProbe } from './GitFolderProbe';

function git(cwd: string, ...args: string[]): void {
	execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], { cwd, stdio: 'ignore' });
}

describe('GitFolderProbe against a filter driver planted by a run', () => {
	let scratch: string;

	beforeEach(() => {
		scratch = fs.mkdtempSync(path.join(os.tmpdir(), 'git-probe-filter-'));
	});
	afterEach(() => {
		fs.rmSync(scratch, { recursive: true, force: true });
	});

	/**
	 * A committed repository, then a `filter.<name>.clean` command (plus `* filter=<name>`) that leaves a canary file and
	 * passes the content through, and a stale index (same content, older mtime): git status re-hashes the file through the filter.
	 */
	function plantFilter(filterName = 'canary'): { repo: string; canary: string } {
		const repo = path.join(scratch, 'slot');
		fs.mkdirSync(repo);
		git(repo, 'init', '-q');
		fs.writeFileSync(path.join(repo, 'a.txt'), 'a');
		git(repo, 'add', '.');
		git(repo, 'commit', '-q', '-m', 'init');
		const canary = path.join(scratch, 'canary.out');
		const script = path.join(scratch, 'canary.js');
		fs.writeFileSync(
			script,
			'require("fs").writeFileSync(process.argv[2], "ran");\nprocess.stdin.pipe(process.stdout);\n'
		);
		const posix = (file: string): string => file.replaceAll('\\', '/');
		const command = `"${posix(process.execPath)}" "${posix(script)}" "${posix(canary)}"`;
		git(repo, 'config', `filter.${filterName}.clean`, command);
		git(repo, 'config', `filter.${filterName}.required`, 'true');
		fs.writeFileSync(path.join(repo, '.gitattributes'), `* filter=${filterName}\n`);
		const old = new Date('2020-01-01T00:00:00Z');
		fs.utimesSync(path.join(repo, 'a.txt'), old, old);
		return { repo, canary };
	}

	it('control: a plain git status with a stale index runs the planted filter', () => {
		const { repo, canary } = plantFilter();
		execFileSync('git', ['status', '--porcelain'], { cwd: repo, stdio: 'ignore' });

		expect(fs.existsSync(canary)).toBe(true);
	});

	it('does not run the planted filter', async () => {
		const { repo, canary } = plantFilter();

		const state = await new GitFolderProbe().inspect(repo);

		expect(fs.existsSync(canary)).toBe(false);
		expect(state.isRepository).toBe(true);
	});

	it('does not run a filter whose name contains dots', async () => {
		const { repo, canary } = plantFilter('my.dotted.canary');

		await new GitFolderProbe().inspect(repo);

		expect(fs.existsSync(canary)).toBe(false);
	});

	it('fails with an actionable message when the filter configuration cannot be read', async () => {
		const failing: GitExecFile = (_file, args, _options, callback) => {
			if (args.includes('config')) {
				callback(Object.assign(new Error('bad config'), { code: 128 }), '');
			} else {
				callback(null, 'true\n');
			}
		};

		await expect(new GitFolderProbe(failing).inspect('/slot')).rejects.toThrow(/filter drivers.*\/slot/s);
	});
});
