import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { LogWriter } from '../storage/LogWriter';
import { PLUGIN_META_MARKER_FILE } from '../storage/PluginMetaOwnership';
import { FixedWorkspaceProviders } from '../workspace/FixedWorkspaceProviders';
import { ExecutionWorkspaces } from './ExecutionWorkspaces';

describe('ExecutionWorkspaces plugin .meta ownership', () => {
	let root: string;

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-ws-meta-'));
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	function workspacesFor(handlePath: string): ExecutionWorkspaces {
		const provider = {
			allocate: vi.fn().mockResolvedValue({ path: handlePath, id: 'p:1' }),
			release: vi.fn().mockResolvedValue(undefined),
		};
		return new ExecutionWorkspaces(
			{ writeExecution: vi.fn() } as unknown as LogWriter,
			new FixedWorkspaceProviders(provider)
		);
	}

	const flow = { id: 'f', version: '1.0.0' } as never;

	it('reports pluginMetaDir and writes the marker when it created the .meta', async () => {
		const handlePath = path.join(root, 'task-1');

		const result = await workspacesFor(handlePath).allocate(flow, 'abcd1234', root);

		expect(result).toEqual({
			ok: true,
			workspaceDir: handlePath,
			workspaceMetaDir: handlePath + '.meta',
			readOnly: false,
			pluginMetaDir: handlePath + '.meta',
		});
		expect(fs.readFileSync(path.join(handlePath + '.meta', PLUGIN_META_MARKER_FILE), 'utf8')).toBe('abcd1234');
	});

	it('reports no pluginMetaDir and writes no marker when the .meta already existed as a user directory', async () => {
		const handlePath = path.join(root, 'task-1');
		fs.mkdirSync(handlePath + '.meta');

		const result = await workspacesFor(handlePath).allocate(flow, 'abcd1234', root);

		expect(result).toEqual({
			ok: true,
			workspaceDir: handlePath,
			workspaceMetaDir: handlePath + '.meta',
			readOnly: false,
		});
		expect(fs.existsSync(path.join(handlePath + '.meta', PLUGIN_META_MARKER_FILE))).toBe(false);
	});

	it('lists the .meta of every active plugin execution, owned or not, until it is released', async () => {
		const handlePath = path.join(root, 'task-1');
		fs.mkdirSync(handlePath + '.meta');
		const workspaces = workspacesFor(handlePath);
		await workspaces.allocate(flow, 'abcd1234', root);

		expect(workspaces.activeMetaDirs()).toEqual([handlePath + '.meta']);

		workspaces.release('abcd1234');
		expect(workspaces.activeMetaDirs()).toEqual([]);
	});

	describe('contract extension', () => {
		const writeExecution = vi.fn();
		function setup(handle: Record<string, unknown>) {
			const provider = {
				allocate: vi.fn().mockResolvedValue(handle),
				release: vi.fn().mockResolvedValue(undefined),
			};
			const workspaces = new ExecutionWorkspaces(
				{ writeExecution } as unknown as LogWriter,
				new FixedWorkspaceProviders(provider)
			);
			return { provider, workspaces };
		}

		beforeEach(() => {
			writeExecution.mockClear();
		});

		it('passes the execution id, the project folder and the flow to the provider', async () => {
			const { provider, workspaces } = setup({ path: path.join(root, 'ws'), id: 'p:1' });
			const projectDir = path.join(root, 'project');

			await workspaces.allocate({ id: 'my-flow', version: '2.0.0' } as never, 'abcd1234', projectDir);

			expect(provider.allocate).toHaveBeenCalledWith({
				taskId: 'abcd1234',
				executionId: 'abcd1234',
				projectDir,
				flow: { id: 'my-flow', version: '2.0.0' },
				signal: expect.any(AbortSignal),
				onWaiting: expect.any(Function),
			});
		});

		it('uses the metaDir of the handle instead of the sibling .meta, and owns it', async () => {
			const metaDir = path.join(root, 'runs', 'abcd1234.meta');
			const { workspaces } = setup({ path: path.join(root, 'shared'), id: 'p:1', metaDir });

			const result = await workspaces.allocate(flow, 'abcd1234', root);

			expect(result).toEqual({
				ok: true,
				workspaceDir: path.join(root, 'shared'),
				workspaceMetaDir: metaDir,
				readOnly: false,
				pluginMetaDir: metaDir,
			});
			expect(fs.readFileSync(path.join(metaDir, PLUGIN_META_MARKER_FILE), 'utf8')).toBe('abcd1234');
			expect(fs.existsSync(path.join(root, 'shared.meta'))).toBe(false);
		});

		it('keeps two executions on the same path apart through their own metaDir', async () => {
			const shared = path.join(root, 'shared');
			const first = setup({ path: shared, id: 'p:1', metaDir: path.join(root, 'runs', 'aaaa1111.meta') });
			const second = setup({ path: shared, id: 'p:2', metaDir: path.join(root, 'runs', 'bbbb2222.meta') });

			await first.workspaces.allocate(flow, 'aaaa1111', root);
			await second.workspaces.allocate(flow, 'bbbb2222', root);

			expect(first.workspaces.activeMetaDirs()).toEqual([path.join(root, 'runs', 'aaaa1111.meta')]);
			expect(second.workspaces.activeMetaDirs()).toEqual([path.join(root, 'runs', 'bbbb2222.meta')]);
		});

		it('reports readOnly and writes the notes of the handle to the log of the execution', async () => {
			const { workspaces } = setup({
				path: path.join(root, 'ws'),
				id: 'p:1',
				readOnly: true,
				notes: ['dirty slot'],
			});

			const result = await workspaces.allocate(flow, 'abcd1234', root);

			expect(result).toMatchObject({ ok: true, readOnly: true });
			expect(writeExecution).toHaveBeenCalledWith('abcd1234', 'dirty slot', 'warning');
		});

		it('reports readOnly false when the handle does not say', async () => {
			const { workspaces } = setup({ path: path.join(root, 'ws'), id: 'p:1' });

			const result = await workspaces.allocate(flow, 'abcd1234', root);

			expect(result).toMatchObject({ ok: true, readOnly: false });
		});
	});
});
