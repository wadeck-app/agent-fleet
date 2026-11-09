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

describe('SandboxableWorkspace.mountPathsFor (the directories that are checked are the ones that get mounted)', () => {
	const context = (): { workspaceDir: string; outputsDir: string } => {
		const workspaceDir = directory('slots', 'slot-1');
		directory('runs', 'r1.meta', 'outputs');
		return { workspaceDir, outputsDir: path.join(root, 'runs', 'r1.meta', 'outputs') };
	};

	it('returns the spelling of the engine and the resolved directories to mount', () => {
		const given = context();

		const paths = SandboxableWorkspace.mountPathsFor(given);

		expect(paths.workspaceDir).toBe(given.workspaceDir);
		expect(paths.workspaceMetaDir).toBe(path.join(root, 'runs', 'r1.meta'));
		expect(paths.resolved).toEqual({
			workspaceDir: given.workspaceDir,
			workspaceMetaDir: path.join(root, 'runs', 'r1.meta'),
		});
	});

	it('resolves a link (junction or symlink) in the workspace path to its target, which is what must be mounted', () => {
		const real = directory('real-slot');
		const linked = link(real, 'linked-slot');
		directory('runs', 'r1.meta', 'outputs');

		const paths = SandboxableWorkspace.mountPathsFor({
			workspaceDir: linked,
			outputsDir: path.join(root, 'runs', 'r1.meta', 'outputs'),
		});

		expect(paths.workspaceDir).toBe(linked);
		expect(paths.resolved.workspaceDir).toBe(real);
	});

	// A link swapped between the check and the mount: simulated by a resolver whose answers change over time.
	it('resolves each directory exactly once, so a swap after the check cannot change what is mounted', () => {
		const given = context();
		const swapped = directory('elsewhere');
		const answers = new Map<string, string[]>([
			[given.workspaceDir, [given.workspaceDir, swapped]],
			[path.join(root, 'runs', 'r1.meta'), [path.join(root, 'runs', 'r1.meta'), swapped]],
		]);
		const calls: string[] = [];
		const resolver = (directoryPath: string): string => {
			calls.push(directoryPath);
			const queue = answers.get(directoryPath);
			if (queue === undefined) return directoryPath;
			return queue.length > 1 ? (queue.shift() as string) : (queue[0] as string);
		};

		const paths = SandboxableWorkspace.mountPathsFor(given, resolver);

		expect(paths.resolved.workspaceDir).toBe(given.workspaceDir);
		expect(paths.resolved.workspaceMetaDir).toBe(path.join(root, 'runs', 'r1.meta'));
		expect(calls.filter(call => call === given.workspaceDir)).toHaveLength(1);
		expect(calls.filter(call => call === path.join(root, 'runs', 'r1.meta'))).toHaveLength(1);
	});

	it('runs the layout check on the resolved directories: a meta that resolves into the workspace is refused', () => {
		const given = context();
		const inside = directory('slots', 'slot-1', 'inner');
		const resolver = (directoryPath: string): string =>
			directoryPath === path.join(root, 'runs', 'r1.meta') ? inside : directoryPath;

		expect(() => SandboxableWorkspace.mountPathsFor(given, resolver)).toThrow(NEEDS_POOL);
	});

	it('keeps the same refusals as metaDirectoryFor (a missing outputsDir)', () => {
		expect(() => SandboxableWorkspace.mountPathsFor({ workspaceDir: directory('ws') })).toThrow(/outputsDir/);
	});
});

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
