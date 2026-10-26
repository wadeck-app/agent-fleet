import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { LogWriter } from '../storage/LogWriter';
import { PLUGIN_META_MARKER_FILE } from '../storage/PluginMetaOwnership';
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
		return new ExecutionWorkspaces({ writeExecution: vi.fn() } as unknown as LogWriter, provider);
	}

	const flow = { id: 'f', version: '1.0.0' } as never;

	it('reports pluginMetaDir and writes the marker when it created the .meta', async () => {
		const handlePath = path.join(root, 'task-1');

		const result = await workspacesFor(handlePath).allocate(root, flow, 'abcd1234');

		expect(result).toEqual({
			ok: true,
			workspaceDir: handlePath,
			workspaceMetaDir: handlePath + '.meta',
			pluginMetaDir: handlePath + '.meta',
		});
		expect(fs.readFileSync(path.join(handlePath + '.meta', PLUGIN_META_MARKER_FILE), 'utf8')).toBe('abcd1234');
	});

	it('reports no pluginMetaDir and writes no marker when the .meta already existed as a user directory', async () => {
		const handlePath = path.join(root, 'task-1');
		fs.mkdirSync(handlePath + '.meta');

		const result = await workspacesFor(handlePath).allocate(root, flow, 'abcd1234');

		expect(result).toEqual({ ok: true, workspaceDir: handlePath, workspaceMetaDir: handlePath + '.meta' });
		expect(fs.existsSync(path.join(handlePath + '.meta', PLUGIN_META_MARKER_FILE))).toBe(false);
	});

	it('lists the .meta of every active plugin execution, owned or not, until it is released', async () => {
		const handlePath = path.join(root, 'task-1');
		fs.mkdirSync(handlePath + '.meta');
		const workspaces = workspacesFor(handlePath);
		await workspaces.allocate(root, flow, 'abcd1234');

		expect(workspaces.activeMetaDirs()).toEqual([handlePath + '.meta']);

		workspaces.release('abcd1234');
		expect(workspaces.activeMetaDirs()).toEqual([]);
	});
});
