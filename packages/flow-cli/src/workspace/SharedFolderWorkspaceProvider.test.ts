import type { WorkspaceRequest } from 'extension-points';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { GitFolderProbe, GitFolderState } from './GitFolderProbe';
import { runMetaDirFor } from './RunMetaDir';
import { SharedFolderWorkspaceProvider } from './SharedFolderWorkspaceProvider';

describe('SharedFolderWorkspaceProvider', () => {
	let root: string;
	let project: string;
	let state: GitFolderState;
	const probe = { inspect: async () => state } as unknown as GitFolderProbe;

	function request(executionId: string, projectDir = project): WorkspaceRequest {
		return { taskId: executionId, executionId, projectDir, flow: { id: 'f', version: '1.0.0' } };
	}

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-folder-'));
		project = path.join(root, 'project');
		fs.mkdirSync(project);
		state = { isRepository: true, dirty: false };
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	describe('in-place', () => {
		const make = (options: Record<string, unknown> = {}) =>
			new SharedFolderWorkspaceProvider('in-place', options, probe);

		it('uses the project folder of the run, not the working directory', async () => {
			const handle = await make().allocate(request('abcd1234'));

			expect(handle.path).toBe(path.resolve(project));
			expect(handle.readOnly).toBe(false);
		});

		it('gives each execution its own metaDir under the project, so two runs never share outputs', async () => {
			const first = await make().allocate(request('aaaa1111'));
			const second = await make().allocate(request('bbbb2222'));

			expect(first.metaDir).toBe(runMetaDirFor(project, 'aaaa1111'));
			expect(second.metaDir).toBe(runMetaDirFor(project, 'bbbb2222'));
			expect(first.path).toBe(second.path);
			expect(first.id).not.toBe(second.id);
		});

		it('keeps the metaDir under the project even when dir names another folder', async () => {
			const other = path.join(root, 'other');
			fs.mkdirSync(other);

			const handle = await make({ dir: '../other' }).allocate(request('abcd1234'));

			expect(handle.path).toBe(other);
			expect(handle.metaDir).toBe(runMetaDirFor(project, 'abcd1234'));
		});

		it('adds no note for a clean repository', async () => {
			const handle = await make().allocate(request('abcd1234'));

			expect(handle.notes ?? []).toEqual([]);
		});

		it('notes a folder that is not a git repository', async () => {
			state = { isRepository: false, dirty: false };

			const handle = await make().allocate(request('abcd1234'));

			expect(handle.notes).toHaveLength(1);
			expect(handle.notes![0]).toContain('not a git repository');
		});

		it('notes uncommitted changes', async () => {
			state = { isRepository: true, dirty: true };

			const handle = await make().allocate(request('abcd1234'));

			expect(handle.notes).toHaveLength(1);
			expect(handle.notes![0]).toContain('uncommitted changes');
		});

		it('fails with the option name when the folder does not exist', async () => {
			await expect(make({ dir: 'nope' }).allocate(request('abcd1234'))).rejects.toThrow(/"dir".*does not exist/s);
		});

		it('rejects an unknown option when it is built, listing the accepted ones', () => {
			expect(() => make({ folder: 'x' })).toThrow(/unknown option "folder".*Accepted options: dir/s);
		});

		it('release does nothing and may be repeated', async () => {
			const provider = make();
			const handle = await provider.allocate(request('abcd1234'));

			await provider.release(handle);
			await expect(provider.release(handle)).resolves.toBeUndefined();
			expect(fs.existsSync(project)).toBe(true);
		});
	});

	describe('readonly', () => {
		const make = (options: Record<string, unknown> = {}) =>
			new SharedFolderWorkspaceProvider('readonly', options, probe);

		it('marks the handle read-only', async () => {
			const handle = await make().allocate(request('abcd1234'));

			expect(handle.readOnly).toBe(true);
			expect(handle.path).toBe(path.resolve(project));
		});

		it('does not warn about uncommitted changes (nobody writes here through this flow)', async () => {
			state = { isRepository: true, dirty: true };

			const handle = await make().allocate(request('abcd1234'));

			expect(handle.notes ?? []).toEqual([]);
		});
	});

	it('refuses a provider name other than in-place or readonly', () => {
		expect(() => new SharedFolderWorkspaceProvider('pool' as never, {}, probe)).toThrow(/in-place|readonly/);
	});
});
