import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import { GitFolderProbe } from './GitFolderProbe';
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
