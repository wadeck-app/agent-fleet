import type { WorkspaceHandle, WorkspaceProvider, WorkspaceRequest } from 'extension-points';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { LogWriter } from '../storage/LogWriter';
import { FixedWorkspaceProviders } from '../workspace/FixedWorkspaceProviders';
import { WorkspaceWaitCancelledError } from '../workspace/WorkspaceWaitCancelledError';
import { ExecutionWorkspaces } from './ExecutionWorkspaces';

describe('ExecutionWorkspaces.begin -- a run that has to wait for a workspace', () => {
	let root: string;
	const flow = { id: 'f', version: '1.0.0' } as never;
	const writeExecution = vi.fn();

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'exec-ws-wait-'));
		writeExecution.mockClear();
	});
	afterEach(() => {
		fs.rmSync(root, { recursive: true, force: true });
	});

	/** A provider whose allocation the test settles by hand; it announces its wait first when asked to. */
	function controllableProvider(announce: boolean) {
		let request!: WorkspaceRequest;
		let grant!: (handle: WorkspaceHandle) => void;
		let fail!: (error: Error) => void;
		const provider: WorkspaceProvider = {
			allocate: vi.fn((req: WorkspaceRequest) => {
				request = req;
				return new Promise<WorkspaceHandle>((resolve, reject) => {
					grant = resolve;
					fail = reject;
					req.signal?.addEventListener('abort', () =>
						reject(new WorkspaceWaitCancelledError(req.executionId))
					);
					if (announce) {
						req.onWaiting?.({ message: 'all slots are claimed' });
					}
				});
			}),
			release: vi.fn().mockResolvedValue(undefined),
		};
		return {
			provider,
			request: () => request,
			grant: (handle: WorkspaceHandle) => grant(handle),
			fail: (error: Error) => fail(error),
		};
	}

	function workspacesWith(provider: WorkspaceProvider): ExecutionWorkspaces {
		return new ExecutionWorkspaces(
			{ writeExecution } as unknown as LogWriter,
			new FixedWorkspaceProviders(provider)
		);
	}

	it('is ready at once when the provider gives a folder without announcing a wait', async () => {
		const provider: WorkspaceProvider = {
			allocate: vi.fn().mockResolvedValue({ path: path.join(root, 'ws'), id: 'p:1' }),
			release: vi.fn(),
		};

		const begun = await workspacesWith(provider).begin(flow, 'abcd1234', root);

		expect(begun.state).toBe('ready');
		expect(begun).toMatchObject({ allocated: { ok: true, workspaceDir: path.join(root, 'ws') } });
	});

	it('is ready (refused) at once when the provider fails before announcing a wait', async () => {
		const provider: WorkspaceProvider = {
			allocate: vi.fn().mockRejectedValue(new Error('pool folders do not exist')),
			release: vi.fn(),
		};

		const begun = await workspacesWith(provider).begin(flow, 'abcd1234', root);

		expect(begun).toMatchObject({
			state: 'ready',
			allocated: { ok: false, response: { code: 'WORKSPACE_ERROR' } },
		});
	});

	it('reports a wait as soon as the provider announces it, without waiting for the allocation to end', async () => {
		const control = controllableProvider(true);

		const begun = await workspacesWith(control.provider).begin(flow, 'abcd1234', root);

		expect(begun.state).toBe('waiting');
		if (begun.state !== 'waiting') {
			return;
		}
		expect(begun.waiting.message).toBe('all slots are claimed');
	});

	it('finishes the allocation when the slot comes: handle registered, notes logged, meta folder made', async () => {
		const control = controllableProvider(true);
		const workspaces = workspacesWith(control.provider);
		const begun = await workspaces.begin(flow, 'abcd1234', root);
		if (begun.state !== 'waiting') {
			throw new Error('expected a wait');
		}

		control.grant({
			path: path.join(root, 'slot'),
			id: 'p:1',
			metaDir: path.join(root, 'meta'),
			notes: ['dirty slot'],
		});
		const allocated = await begun.waiting.settled;

		expect(allocated).toMatchObject({
			ok: true,
			workspaceDir: path.join(root, 'slot'),
			pluginMetaDir: path.join(root, 'meta'),
		});
		expect(fs.existsSync(path.join(root, 'meta', 'outputs'))).toBe(true);
		expect(writeExecution).toHaveBeenCalledWith('abcd1234', 'dirty slot', 'warning');
		expect(workspaces.activeMetaDirs()).toEqual([path.join(root, 'meta')]);
	});

	it('hands each later reason of the provider to the listeners', async () => {
		const control = controllableProvider(true);
		const begun = await workspacesWith(control.provider).begin(flow, 'abcd1234', root);
		if (begun.state !== 'waiting') {
			throw new Error('expected a wait');
		}
		const reasons: string[] = [];
		begun.waiting.onUpdate(message => reasons.push(message));

		control.request().onWaiting?.({ message: 'still waiting' });

		expect(reasons).toEqual(['still waiting']);
	});

	it('refuses with the provider message when the wait ends in a failure', async () => {
		const control = controllableProvider(true);
		const begun = await workspacesWith(control.provider).begin(flow, 'abcd1234', root);
		if (begun.state !== 'waiting') {
			throw new Error('expected a wait');
		}

		control.fail(new Error('the pool folder vanished'));
		const allocated = await begun.waiting.settled;

		expect(allocated).toMatchObject({ ok: false, response: { code: 'WORKSPACE_ERROR' } });
		expect((allocated as { response: { message: string } }).response.message).toContain('the pool folder vanished');
	});

	it('cancel() aborts the provider wait and settles with the cancellation code', async () => {
		const control = controllableProvider(true);
		const begun = await workspacesWith(control.provider).begin(flow, 'abcd1234', root);
		if (begun.state !== 'waiting') {
			throw new Error('expected a wait');
		}

		begun.waiting.cancel();
		const allocated = await begun.waiting.settled;

		expect(control.request().signal?.aborted).toBe(true);
		expect(allocated).toMatchObject({ ok: false, response: { code: 'WORKSPACE_WAIT_CANCELLED' } });
	});

	it('allocate() still returns the workspace after a wait, for callers that do not care', async () => {
		const control = controllableProvider(true);
		const pending = workspacesWith(control.provider).allocate(flow, 'abcd1234', root);

		await vi.waitFor(() => expect(control.provider.allocate).toHaveBeenCalled());
		control.grant({ path: path.join(root, 'slot'), id: 'p:1' });

		await expect(pending).resolves.toMatchObject({ ok: true });
	});

	it('refuses the run, with the folder and the fix, when the metadata folder of a waited-for slot cannot be prepared', async () => {
		const control = controllableProvider(true);
		const begun = await workspacesWith(control.provider).begin(flow, 'abcd1234', root);
		if (begun.state !== 'waiting') {
			throw new Error('expected a wait');
		}
		const blocker = path.join(root, 'blocker');
		fs.writeFileSync(blocker, 'a file where a folder is needed');

		control.grant({ path: path.join(root, 'slot'), id: 'p:1', metaDir: path.join(blocker, 'meta') });
		const allocated = await begun.waiting.settled;

		expect(allocated).toMatchObject({ ok: false, response: { code: 'WORKSPACE_ERROR' } });
		expect((allocated as { response: { message: string } }).response.message).toContain('metadata folder');
		expect(control.provider.release).toHaveBeenCalled();
	});
});
