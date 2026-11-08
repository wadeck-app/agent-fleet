import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { SandboxableWorkspace } from './SandboxableWorkspace';
import { eachRow } from './testing/EachRow';

let root: string;

beforeEach(() => {
	root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'flow-sandboxable-')));
});
afterEach(() => {
	fs.rmSync(root, { recursive: true, force: true });
});

function directory(...segments: string[]): string {
	const full = path.join(root, ...segments);
	fs.mkdirSync(full, { recursive: true });
	return full;
}

/** A directory link that needs no privilege: a junction on Windows, a symlink elsewhere. */
function link(target: string, name: string): string {
	const full = path.join(root, name);
	fs.symlinkSync(target, full, process.platform === 'win32' ? 'junction' : 'dir');
	return full;
}

const NEEDS_POOL =
	/needs workspace: pool, the in-place workspace exposes <project>\/\.flow and \.git\/hooks to the sandbox/;

describe('SandboxableWorkspace.metaDirectoryFor', () => {
	it('accepts a meta directory outside the workspace and returns it (pool, sibling meta), and refuses every layout that puts it inside (each case)', async () => {
		interface Row {
			label: string;
			// Builds the context from the directories created for the row.
			make: () => { workspaceDir: string; outputsDir: string; extra?: Record<string, unknown> };
			error?: RegExp;
		}
		const rows: Row[] = [
			{
				label: 'pool: the slot, with the meta in the project (outside the slot)',
				make: () => {
					directory('pool', 'slot-1');
					return {
						workspaceDir: path.join(root, 'pool', 'slot-1'),
						outputsDir: path.join(directory('project', '.flow', 'runs', 'r1.meta', 'outputs')),
					};
				},
			},
			{
				label: 'sibling meta next to the workspace (older convention)',
				make: () => {
					directory('ws');
					return { workspaceDir: path.join(root, 'ws'), outputsDir: directory('ws.meta', 'outputs') };
				},
			},
			{
				label: 'in-place: the meta is inside the project that is the workspace',
				make: () => ({
					workspaceDir: directory('project'),
					outputsDir: directory('project', '.flow', 'runs', 'r1.meta', 'outputs'),
				}),
				error: NEEDS_POOL,
			},
			{
				label: 'a meta directory that does not exist yet, below the workspace',
				make: () => ({
					workspaceDir: directory('project'),
					outputsDir: path.join(root, 'project', '.flow', 'runs', 'r2.meta', 'outputs'),
				}),
				error: NEEDS_POOL,
			},
			{
				label: 'a pool slot that contains the project (the meta of the project lands inside the slot)',
				make: () => ({
					workspaceDir: directory('slot'),
					outputsDir: directory('slot', 'project', '.flow', 'runs', 'r3.meta', 'outputs'),
				}),
				error: NEEDS_POOL,
			},
			{
				label: 'the meta directory is reached through a junction or symlink into the workspace',
				make: () => {
					const workspaceDir = directory('project');
					directory('project', 'inner', 'r4.meta', 'outputs');
					const entrance = link(path.join(workspaceDir, 'inner'), 'meta-entrance');
					return { workspaceDir, outputsDir: path.join(entrance, 'r4.meta', 'outputs') };
				},
				error: NEEDS_POOL,
			},
			{
				label: 'the workspace itself is a link to a directory that holds the meta',
				make: () => {
					const real = directory('real-project');
					directory('real-project', '.flow', 'runs', 'r5.meta', 'outputs');
					return {
						workspaceDir: link(real, 'ws-link'),
						outputsDir: path.join(real, '.flow', 'runs', 'r5.meta', 'outputs'),
					};
				},
				error: NEEDS_POOL,
			},
			{
				label: 'a read-only workspace (readonly provider)',
				make: () => {
					directory('ro');
					return {
						workspaceDir: path.join(root, 'ro'),
						outputsDir: directory('ro.meta', 'outputs'),
						extra: { workspaceReadOnly: true },
					};
				},
				error: /needs workspace: pool[\s\S]*readonly/,
			},
			{
				label: 'a git worktree or submodule (.git is a file)',
				make: () => {
					const workspaceDir = directory('tree');
					fs.writeFileSync(path.join(workspaceDir, '.git'), 'gitdir: /elsewhere\n');
					return { workspaceDir, outputsDir: directory('tree.meta', 'outputs') };
				},
				error: /worktree[\s\S]*not supported[\s\S]*workspace: pool/,
			},
		];
		await eachRow<[string, Row]>(
			rows.map(row => [row.label, row] as [string, Row]),
			(_label, row) => {
				const made = row.make();
				const context = { workspaceDir: made.workspaceDir, outputsDir: made.outputsDir, ...made.extra };
				if (row.error === undefined) {
					expect(SandboxableWorkspace.metaDirectoryFor(context)).toBe(path.dirname(made.outputsDir));
				} else {
					expect(() => SandboxableWorkspace.metaDirectoryFor(context)).toThrow(row.error);
				}
			}
		);
	});

	it('refuses an assignment without outputsDir and an outputsDir that is not <meta>/outputs', () => {
		directory('ws');
		directory('ws.meta');

		expect(() => SandboxableWorkspace.metaDirectoryFor({ workspaceDir: path.join(root, 'ws') })).toThrow(
			/no executionContext\.outputsDir/
		);
		expect(() =>
			SandboxableWorkspace.metaDirectoryFor({
				workspaceDir: path.join(root, 'ws'),
				outputsDir: path.join(root, 'ws.meta', 'out'),
			})
		).toThrow(/cannot be derived/);
	});
});
