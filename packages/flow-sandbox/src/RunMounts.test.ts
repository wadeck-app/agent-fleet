import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { RunMounts } from './RunMounts';
import { failure } from './testing/ExpectedFailures';
import { RecordingSandboxLog } from './testing/RecordingSandboxLog';

let root: string;
let workspace: string;
let meta: string;
let elsewhere: string;
let log: RecordingSandboxLog;

/** The path as the sandbox sees it: `/c/dir/file` on a Windows host, the same path elsewhere. */
function sandboxForm(hostPath: string): string {
	const normalized = hostPath.replace(/\\/g, '/');
	const drive = /^([A-Za-z]):(.*)$/.exec(normalized);
	return drive?.[1] === undefined ? normalized : `/${drive[1].toLowerCase()}${drive[2] ?? ''}`;
}

function mounts(extra: { projectDir?: string; workspaceDir?: string; readOnlyWorkspace?: boolean } = {}): RunMounts {
	return new RunMounts({
		...(extra.readOnlyWorkspace === undefined ? {} : { readOnlyWorkspace: extra.readOnlyWorkspace }),
		workspaceDir: extra.workspaceDir ?? workspace,
		workspaceMetaDir: meta,
		platform: process.platform,
		log,
		...(extra.projectDir === undefined ? {} : { projectDir: extra.projectDir }),
	});
}

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-mounts-')));
	workspace = path.join(root, 'ws');
	meta = path.join(root, 'ws.meta');
	elsewhere = path.join(root, 'elsewhere');
	for (const directory of [workspace, meta, elsewhere]) fs.mkdirSync(directory);
	fs.writeFileSync(path.join(elsewhere, 'secret.txt'), 'outside');
	log = new RecordingSandboxLog();
});

afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

describe('RunMounts whole-run read-only workspace (fs=readonly-enforced)', () => {
	// sbx needs the PRIMARY (first) mount read/write: with a read-only workspace the run's .meta is the primary and the workspace a :ro secondary.
	it('puts .meta first (read/write) and the workspace second (:ro) when the workspace is read-only', () => {
		const readOnly = mounts({ readOnlyWorkspace: true });

		expect(readOnly.readOnlyWorkspace).toBe(true);
		expect(readOnly.sandboxMounts()).toEqual([{ hostPath: meta }, { hostPath: workspace, readOnly: true }]);
		expect(readOnly.workspaceMount()).toEqual({ hostPath: workspace, readOnly: true });
		expect(readOnly.metaMount()).toEqual({ hostPath: meta });
	});

	it('keeps the read/write workspace first and no :ro flag by default and when asked explicitly', () => {
		for (const built of [mounts(), mounts({ readOnlyWorkspace: false })]) {
			expect(built.readOnlyWorkspace).toBe(false);
			expect(built.sandboxMounts()).toEqual([{ hostPath: workspace }, { hostPath: meta }]);
			expect(built.workspaceMount()).toEqual({ hostPath: workspace });
			expect(built.metaMount()).toEqual({ hostPath: meta });
		}
	});

	it('translates the same paths whatever the mode', () => {
		const readOnly = mounts({ readOnlyWorkspace: true });
		const readWrite = mounts();

		expect(readOnly.toSandboxPath(path.join(workspace, 'a.txt'), 'p')).toBe(
			readWrite.toSandboxPath(path.join(workspace, 'a.txt'), 'p')
		);
		expect(readOnly.toSandboxPath(path.join(meta, 'outputs'), 'p')).toBe(
			readWrite.toSandboxPath(path.join(meta, 'outputs'), 'p')
		);
	});
});

describe('RunMounts mounts and cwd', () => {
	it('mounts exactly the workspace (primary) and the .meta directory', () => {
		expect(mounts().sandboxMounts()).toEqual([{ hostPath: workspace }, { hostPath: meta }]);
	});

	it('translates a cwd inside the workspace, one inside .meta, and one that does not exist yet (it cannot be a link)', () => {
		fs.mkdirSync(path.join(workspace, 'src'));

		expect(mounts().toSandboxPath(path.join(workspace, 'src'), 'cwd')).toBe(
			sandboxForm(path.join(workspace, 'src'))
		);
		expect(mounts().toSandboxPath(path.join(meta, 'outputs'), 'cwd')).toBe(sandboxForm(path.join(meta, 'outputs')));
		expect(mounts().toSandboxPath(path.join(workspace, 'new', 'dir'), 'cwd')).toBe(
			sandboxForm(path.join(workspace, 'new', 'dir'))
		);
	});

	it('rejects a cwd outside the two mounts and names the mounts so the user knows what is reachable', () => {
		const cases: [string, string][] = [
			['a sibling directory', path.join(root, 'elsewhere')],
			['the parent of the workspace', root],
			['a sibling whose name starts like the workspace', `${workspace}-other`],
			['another run workspace', path.join(root, 'ws2')],
			['a parent segment', path.join(workspace, '..', 'elsewhere')],
		];
		for (const [label, cwd] of cases) {
			expect(failure(() => mounts().toSandboxPath(cwd, 'cwd'), label).kind, label).toBe('path-outside-mounts');
		}

		const error = failure(() => mounts().toSandboxPath(elsewhere, 'cwd'));
		expect(error.message).toContain('cwd');
		expect(error.message).toContain('only sees');
	});

	it('translates a sandbox path back to the host path inside the mounts only', () => {
		const inside = path.join(workspace, 'out.txt');

		expect(mounts().toHostPath(sandboxForm(inside), 'result')).toBe(inside);
		expect(failure(() => mounts().toHostPath(sandboxForm(path.join(elsewhere, 'secret.txt')), 'result')).kind).toBe(
			'path-outside-mounts'
		);
	});
});

describe('RunMounts links', () => {
	function link(target: string, at: string): void {
		// 'junction' needs no privilege on Windows and is ignored elsewhere (a plain symlink).
		fs.symlinkSync(target, at, 'junction');
	}

	it('rejects a path through a junction or symlink: below it, the link itself, deeper in the tree, inside .meta', () => {
		link(elsewhere, path.join(workspace, 'link'));
		fs.mkdirSync(path.join(workspace, 'a'));
		link(elsewhere, path.join(workspace, 'a', 'deep'));
		link(elsewhere, path.join(meta, 'sessions'));

		const throughLink = failure(() => mounts().toSandboxPath(path.join(workspace, 'link', 'sub'), 'cwd'));
		expect(throughLink.kind).toBe('path-outside-mounts');
		expect(throughLink.message).toContain('symbolic link or junction');
		expect(throughLink.message).toContain(path.join(workspace, 'link'));

		expect(failure(() => mounts().toSandboxPath(path.join(workspace, 'link'), 'cwd')).kind).toBe(
			'path-outside-mounts'
		);
		expect(failure(() => mounts().toSandboxPath(path.join(workspace, 'a', 'deep', 'x'), 'cwd')).message).toContain(
			path.join(workspace, 'a', 'deep')
		);
		expect(failure(() => mounts().toSandboxPath(path.join(meta, 'sessions', 'claude'), 'cwd')).kind).toBe(
			'path-outside-mounts'
		);
	});

	it('rejects a host path returned by the sandbox when it goes through a link', () => {
		link(elsewhere, path.join(workspace, 'link'));

		const error = failure(() =>
			mounts().toHostPath(sandboxForm(path.join(workspace, 'link', 'secret.txt')), 'result')
		);

		expect(error.message).toContain('symbolic link or junction');
	});

	it('refuses a mount root that is a link, a missing one (with the fix) and one that is a file', () => {
		const linkedWorkspace = path.join(root, 'linked-ws');
		link(elsewhere, linkedWorkspace);

		const linked = failure(() => mounts({ workspaceDir: linkedWorkspace }));
		expect(linked.kind).toBe('path-outside-mounts');
		expect(linked.message).toContain('workspaceDir');
		expect(linked.message).toContain('symbolic link or junction');

		const missing = failure(() => mounts({ workspaceDir: path.join(root, 'missing') }));
		expect(missing.message).toContain('does not exist');
		expect(missing.message).toContain('Create the directory');

		const file = path.join(root, 'file.txt');
		fs.writeFileSync(file, 'x');
		expect(failure(() => mounts({ workspaceDir: file })).message).toContain('is not a directory');
	});
});

describe('RunMounts warnings', () => {
	it('stays silent for a plain workspace, and when projectDir is a different directory', () => {
		const run = mounts();

		expect(run.warnings).toEqual([]);
		expect(log.lines).toEqual([]);
		expect(mounts({ projectDir: elsewhere }).warnings).toEqual([]);
	});

	it('warns when the workspace is the projectDir option (case-insensitive on Windows)', () => {
		const projectDir = process.platform === 'win32' ? workspace.toUpperCase() : workspace;

		const run = mounts({ projectDir });

		expect(run.warnings).toHaveLength(1);
		expect(run.warnings[0]).toContain('IS your project directory');
		expect(log.lines).toEqual([`warn: ${run.warnings[0]}`]);
	});

	// A pool slot is a clone: its .git directory is the normal case of a valid run, not a reason to warn on every run. What makes a
	// workspace the user's own project is projectDir (above); that a slot must be dedicated to sandboxed runs is documented (README).
	it('does not warn about a .git directory: a pool slot is a clone', () => {
		fs.mkdirSync(path.join(workspace, '.git'));

		const run = mounts();

		expect(run.warnings).toEqual([]);
		expect(log.lines).toEqual([]);
	});

	it('warns that git is unsupported (not "project directory") when .git is a worktree file, and gives both warnings when projectDir matches', () => {
		fs.writeFileSync(path.join(workspace, '.git'), 'gitdir: /somewhere/.git/worktrees/x\n');

		const run = mounts();

		expect(run.warnings).toHaveLength(1);
		expect(run.warnings[0]).toContain('git worktree or submodule');
		expect(run.warnings[0]).toContain('will not work inside the sandbox');
		expect(run.warnings[0]).not.toContain('project directory');

		const both = mounts({ projectDir: workspace });
		expect(both.warnings).toHaveLength(2);
		expect(both.warnings[0]).toContain('IS your project directory');
		expect(both.warnings[1]).toContain('git worktree or submodule');
	});
});
