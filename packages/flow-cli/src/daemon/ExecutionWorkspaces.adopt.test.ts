import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { LogWriter } from '../storage/LogWriter';
import { ExecutionWorkspaces } from './ExecutionWorkspaces';

describe('ExecutionWorkspaces after a daemon restart: restartInfo and adopt', () => {
	let root: string;
	const writeExecution = vi.fn();
	const flow = { id: 'f', version: '1.0.0' } as never;
	const saved = { path: '', id: 'p:1' };

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-ws-adopt-'));
		saved.path = path.join(root, 'ws');
		writeExecution.mockClear();
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	function workspacesWith(provider: object): ExecutionWorkspaces {
		return new ExecutionWorkspaces({ writeExecution } as unknown as LogWriter, {
			providerFor: vi.fn().mockResolvedValue({ provider, warnings: [] }),
		});
	}

	it('restartInfo gives the handle of an allocated run, adoptable when the provider has adopt()', async () => {
		const workspaces = workspacesWith({
			allocate: vi.fn().mockResolvedValue({ path: saved.path, id: 'p:1', readOnly: true, notes: ['n'] }),
			release: vi.fn(),
			adopt: vi.fn(),
		});
		await workspaces.allocate(flow, 'abcd1234', root);

		expect(workspaces.restartInfo('abcd1234')).toEqual({
			adoptable: true,
			handle: { path: saved.path, id: 'p:1', readOnly: true },
		});
		expect(workspaces.restartInfo('unknown1')).toBeUndefined();
	});

	it('restartInfo says why a provider without adopt() cannot keep a paused run', async () => {
		const workspaces = workspacesWith({
			allocate: vi.fn().mockResolvedValue({ path: saved.path, id: 'p:1' }),
			release: vi.fn(),
		});
		await workspaces.allocate(flow, 'abcd1234', root);

		const info = workspaces.restartInfo('abcd1234');

		expect(info).toMatchObject({ adoptable: false });
		expect((info as { blocker: string }).blocker).toContain('no adopt() method');
	});

	it('adopt registers the taken-back handle so the run releases it like an allocated one', async () => {
		const release = vi.fn().mockResolvedValue(undefined);
		const adopt = vi.fn().mockImplementation(async (request: { handle: object }) => request.handle);
		const workspaces = workspacesWith({ allocate: vi.fn(), release, adopt });

		const result = await workspaces.adopt(flow, 'abcd1234', root, saved);

		expect(result).toMatchObject({
			ok: true,
			workspaceDir: saved.path,
			workspaceMetaDir: saved.path + '.meta',
			readOnly: false,
		});
		expect(adopt).toHaveBeenCalledWith({
			executionId: 'abcd1234',
			projectDir: root,
			flow: { id: 'f', version: '1.0.0' },
			handle: saved,
		});
		expect(workspaces.activeMetaDirs()).toEqual([saved.path + '.meta']);
		await workspaces.releaseWithRetry('abcd1234');
		expect(release).toHaveBeenCalledTimes(1);
	});

	it('adopt reports the refusal of the provider with what happened, and registers nothing', async () => {
		const workspaces = workspacesWith({
			allocate: vi.fn(),
			release: vi.fn(),
			adopt: vi.fn().mockRejectedValue(new Error('slot held by another run')),
		});

		const result = await workspaces.adopt(flow, 'abcd1234', root, saved);

		expect(result).toMatchObject({ ok: false, response: { code: 'WORKSPACE_ADOPT_FAILED' } });
		expect((result as { response: { message: string } }).response.message).toContain('slot held by another run');
		expect(workspaces.activeMetaDirs()).toEqual([]);
	});

	it('adopt refuses a provider without adopt()', async () => {
		const result = await workspacesWith({ allocate: vi.fn(), release: vi.fn() }).adopt(
			flow,
			'abcd1234',
			root,
			saved
		);

		expect(result).toMatchObject({ ok: false, response: { code: 'WORKSPACE_ADOPT_FAILED' } });
	});

	it('adopt reports a provider that cannot be loaded', async () => {
		const workspaces = new ExecutionWorkspaces({ writeExecution } as unknown as LogWriter, {
			providerFor: vi.fn().mockRejectedValue(new Error('Unknown workspace provider "x"')),
		});

		const result = await workspaces.adopt(flow, 'abcd1234', root, saved);

		expect((result as { response: { message: string } }).response.message).toContain(
			'Unknown workspace provider "x"'
		);
	});
});
