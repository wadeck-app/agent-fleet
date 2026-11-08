import type { WorkspaceHandle, WorkspaceRequest } from 'extension-points';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

import type { GitFolderProbe, GitFolderState } from './GitFolderProbe';
import { type PoolDependencies, PoolWorkspaceProvider } from './PoolWorkspaceProvider';
import { runMetaDirFor } from './RunMetaDir';
import { WorkspaceWaitCancelledError } from './WorkspaceWaitCancelledError';

describe('PoolWorkspaceProvider', () => {
	let root: string;
	let project: string;
	let pool: string;
	let probeState: (slot: string) => GitFolderState;
	let alive: Set<number>;
	let localExecutions: Set<string>;
	let waiting: { executionId: string; message: string }[];

	const probe = { inspect: async (slot: string) => probeState(slot) } as unknown as GitFolderProbe;

	function deps(overrides: Partial<PoolDependencies> = {}): Partial<PoolDependencies> {
		return {
			probe,
			daemonId: 'daemon-A',
			ownPid: 100,
			isProcessAlive: pid => alive.has(pid),
			isLocalExecution: id => localExecutions.has(id),
			onLocalExecutionStart: id => localExecutions.add(id),
			onLocalExecutionEnd: id => localExecutions.delete(id),
			...overrides,
		};
	}

	function make(slots = 2, options: Record<string, unknown> = {}, overrides: Partial<PoolDependencies> = {}) {
		for (let index = 1; index <= slots; index++) {
			fs.mkdirSync(path.join(pool, `ws-${String(index)}`), { recursive: true });
		}
		return new PoolWorkspaceProvider({ dir: pool, prefix: 'ws-', count: slots, ...options }, deps(overrides));
	}

	function request(executionId: string, extra: Partial<WorkspaceRequest> = {}): WorkspaceRequest {
		return {
			taskId: executionId,
			executionId,
			projectDir: project,
			flow: { id: 'flow-x', version: '1.0.0' },
			onWaiting: info => waiting.push({ executionId, message: info.message }),
			...extra,
		};
	}

	async function settled(promise: Promise<unknown>): Promise<'pending' | 'resolved' | 'rejected'> {
		return Promise.race([
			promise.then(
				() => 'resolved' as const,
				() => 'rejected' as const
			),
			new Promise<'pending'>(resolve => setImmediate(() => resolve('pending'))),
		]);
	}

	beforeEach(() => {
		root = fs.mkdtempSync(path.join(os.tmpdir(), 'pool-provider-'));
		project = path.join(root, 'project');
		pool = path.join(root, 'pool');
		fs.mkdirSync(project);
		fs.mkdirSync(pool);
		probeState = () => ({ isRepository: true, dirty: false });
		alive = new Set([100]);
		localExecutions = new Set();
		waiting = [];
	});
	afterEach(() => {
		vi.useRealTimers();
		fs.rmSync(root, { recursive: true, force: true });
	});

	it('hands out the first free slot, with a metaDir of its own under the project, and does not announce a wait', async () => {
		const provider = make();

		const handle = await provider.allocate(request('aaaa1111'));

		expect(handle.path).toBe(path.join(pool, 'ws-1'));
		expect(handle.id).toBe('pool:ws-1:aaaa1111');
		expect(handle.metaDir).toBe(runMetaDirFor(project, 'aaaa1111'));
		expect(handle.readOnly).toBeUndefined();
		expect(handle.notes ?? []).toEqual([]);
		expect(waiting).toEqual([]);
	});

	it('gives the next slot to the next run', async () => {
		const provider = make();

		await provider.allocate(request('aaaa1111'));
		const second = await provider.allocate(request('bbbb2222'));

		expect(second.path).toBe(path.join(pool, 'ws-2'));
	});

	it('makes a run wait when every slot is claimed, saying who holds them, and gives it the slot that is released', async () => {
		const provider = make();
		const first = await provider.allocate(request('aaaa1111'));
		await provider.allocate(request('bbbb2222'));

		const third = provider.allocate(request('cccc3333'));
		await vi.waitFor(() => expect(waiting).toHaveLength(1));

		expect(await settled(third)).toBe('pending');
		expect(waiting[0]!.executionId).toBe('cccc3333');
		expect(waiting[0]!.message).toContain('2/2');
		expect(waiting[0]!.message).toContain('aaaa1111');
		expect(waiting[0]!.message).toContain('bbbb2222');
		expect(waiting[0]!.message).toContain('flow-x');

		await provider.release(first);

		const handle = await third;
		expect(handle.path).toBe(path.join(pool, 'ws-1'));
	});

	it('serves several waiting runs first come, first served', async () => {
		const provider = make(1);
		const holder = await provider.allocate(request('aaaa1111'));
		const order: string[] = [];
		const queued = ['bbbb2222', 'cccc3333', 'dddd4444'].map(id =>
			provider.allocate(request(id)).then(handle => {
				order.push(id);
				return handle;
			})
		);
		await vi.waitFor(() => expect(waiting).toHaveLength(3));

		let current: WorkspaceHandle = holder;
		for (const promise of queued) {
			await provider.release(current);
			current = await promise;
		}

		expect(order).toEqual(['bbbb2222', 'cccc3333', 'dddd4444']);
	});

	it('does not let a newcomer overtake a run that already waits', async () => {
		const provider = make(1);
		const holder = await provider.allocate(request('aaaa1111'));
		const early = provider.allocate(request('bbbb2222'));
		await vi.waitFor(() => expect(waiting).toHaveLength(1));
		const late = provider.allocate(request('cccc3333'));
		await vi.waitFor(() => expect(waiting).toHaveLength(2));

		await provider.release(holder);

		const earlyHandle = await early;
		expect(earlyHandle.id).toBe('pool:ws-1:bbbb2222');
		expect(await settled(late)).toBe('pending');
	});

	it('waits without any timeout', async () => {
		vi.useFakeTimers();
		const provider = make(1);
		await provider.allocate(request('aaaa1111'));

		const controller = new AbortController();
		const waiter = provider.allocate(request('bbbb2222', { signal: controller.signal }));
		waiter.catch(() => undefined);
		// Two hours of rechecks (every 5 s): the wait has no limit of its own.
		await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
		vi.useRealTimers();

		expect(await settled(waiter)).toBe('pending');
		controller.abort();
	}, 60_000);

	it('repeats the reason every minute while it waits', async () => {
		vi.useFakeTimers();
		const provider = make(1);
		await provider.allocate(request('aaaa1111'));

		const controller = new AbortController();
		provider.allocate(request('bbbb2222', { signal: controller.signal })).catch(() => undefined);
		await vi.advanceTimersByTimeAsync(1_000);
		expect(waiting).toHaveLength(1);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(waiting).toHaveLength(2);
		await vi.advanceTimersByTimeAsync(60_000);
		expect(waiting).toHaveLength(3);
		controller.abort();
	});

	it('stops waiting when the run is cancelled, claims nothing, and does not hand the next slot to it', async () => {
		const provider = make(1);
		const holder = await provider.allocate(request('aaaa1111'));
		const controller = new AbortController();
		const cancelled = provider.allocate(request('bbbb2222', { signal: controller.signal }));
		const next = provider.allocate(request('cccc3333'));
		await vi.waitFor(() => expect(waiting).toHaveLength(2));

		controller.abort();

		await expect(cancelled).rejects.toBeInstanceOf(WorkspaceWaitCancelledError);
		await provider.release(holder);
		const handle = await next;
		expect(handle.id).toBe('pool:ws-1:cccc3333');
		expect(localExecutions.has('bbbb2222')).toBe(false);
	});

	it('rejects at once when the signal is already aborted', async () => {
		const provider = make();
		const controller = new AbortController();
		controller.abort();

		await expect(provider.allocate(request('aaaa1111', { signal: controller.signal }))).rejects.toBeInstanceOf(
			WorkspaceWaitCancelledError
		);
	});

	it('picks up a slot freed by somebody else (another process) at the next recheck', async () => {
		vi.useFakeTimers();
		const provider = make(1);
		alive.add(555);
		const claimDir = path.join(pool, '.flow-pool', 'ws-1.claim');
		fs.mkdirSync(claimDir, { recursive: true });
		fs.writeFileSync(
			path.join(claimDir, 'claim.json'),
			JSON.stringify({ executionId: 'foreign1', flowId: 'f', pid: 555, daemonId: 'daemon-B', claimedAt: 'x' })
		);

		const waiter = provider.allocate(request('aaaa1111'));
		await vi.advanceTimersByTimeAsync(1_000);
		expect(waiting).toHaveLength(1);
		expect(waiting[0]!.message).toContain('foreign1');

		fs.rmSync(claimDir, { recursive: true, force: true });
		await vi.advanceTimersByTimeAsync(5_000);

		const handle = await waiter;
		expect(handle.path).toBe(path.join(pool, 'ws-1'));
	});

	it('recovers a claim whose process died while the run waited, and says so in the notes', async () => {
		vi.useFakeTimers();
		const provider = make(1);
		alive.add(555);
		const claimDir = path.join(pool, '.flow-pool', 'ws-1.claim');
		fs.mkdirSync(claimDir, { recursive: true });
		fs.writeFileSync(
			path.join(claimDir, 'claim.json'),
			JSON.stringify({ executionId: 'foreign1', flowId: 'f', pid: 555, daemonId: 'daemon-B', claimedAt: 'x' })
		);
		const waiter = provider.allocate(request('aaaa1111'));
		await vi.advanceTimersByTimeAsync(1_000);

		alive.delete(555);
		await vi.advanceTimersByTimeAsync(5_000);

		const handle = await waiter;
		expect(handle.notes).toHaveLength(1);
		expect(handle.notes![0]).toContain('ws-1');
		expect(handle.notes![0]).toContain('foreign1');
	});

	it('recovers a claim of an execution of this daemon that is no longer running', async () => {
		const provider = make(1);
		const claimDir = path.join(pool, '.flow-pool', 'ws-1.claim');
		fs.mkdirSync(claimDir, { recursive: true });
		fs.writeFileSync(
			path.join(claimDir, 'claim.json'),
			JSON.stringify({ executionId: 'ghost001', flowId: 'f', pid: 100, daemonId: 'daemon-A', claimedAt: 'x' })
		);

		const handle = await provider.allocate(request('aaaa1111'));

		expect(handle.notes![0]).toContain('ghost001');
		expect(waiting).toEqual([]);
	});

	it('notes a dirty slot and uses it anyway by default (a first step can heal it)', async () => {
		probeState = () => ({ isRepository: true, dirty: true });
		const provider = make(1);

		const handle = await provider.allocate(request('aaaa1111'));

		expect(handle.notes).toHaveLength(1);
		expect(handle.notes![0]).toContain('uncommitted changes');
		expect(handle.notes![0]).toContain('ws-1');
	});

	it('notes a slot that is not a git repository', async () => {
		probeState = () => ({ isRepository: false, dirty: false });
		const provider = make(1);

		const handle = await provider.allocate(request('aaaa1111'));

		expect(handle.notes![0]).toContain('not a git repository');
	});

	it('with requireClean, skips a dirty slot and takes the next clean one, releasing the dirty one', async () => {
		probeState = slot => ({ isRepository: true, dirty: slot.endsWith('ws-1') });
		const provider = make(2, { requireClean: true });

		const handle = await provider.allocate(request('aaaa1111'));

		expect(handle.path).toBe(path.join(pool, 'ws-2'));
		expect(fs.existsSync(path.join(pool, '.flow-pool', 'ws-1.claim'))).toBe(false);
	});

	it('with requireClean, fails (instead of waiting) when every slot is free but dirty, naming them', async () => {
		probeState = () => ({ isRepository: true, dirty: true });
		const provider = make(2, { requireClean: true });

		await expect(provider.allocate(request('aaaa1111'))).rejects.toThrow(/uncommitted.*requireClean.*ws-1.*ws-2/s);
		expect(localExecutions.has('aaaa1111')).toBe(false);
	});

	it('release gives the slot back, is idempotent, and never removes a claim it does not own', async () => {
		const provider = make(1);
		const handle = await provider.allocate(request('aaaa1111'));

		await provider.release(handle);
		await provider.release(handle);
		expect(fs.existsSync(path.join(pool, '.flow-pool', 'ws-1.claim'))).toBe(false);

		const foreign: WorkspaceHandle = { path: path.join(pool, 'ws-1'), id: 'pool:ws-1:zzzz9999' };
		const again = await provider.allocate(request('bbbb2222'));
		await provider.release(foreign);
		expect(fs.existsSync(path.join(pool, '.flow-pool', 'ws-1.claim'))).toBe(true);
		await provider.release(again);
	});

	it('fails with the missing folders when the pool was not created', async () => {
		const provider = new PoolWorkspaceProvider({ dir: pool, prefix: 'nope-', count: 2 }, deps());

		await expect(provider.allocate(request('aaaa1111'))).rejects.toThrow(/nope-1.*nope-2.*do not exist/s);
	});

	it('refuses bad options when it is built', () => {
		expect(() => new PoolWorkspaceProvider({ dir: pool }, deps())).toThrow(/"prefix"/);
	});

	it('does not mistake the claims of another pool provider of the same process for stale ones', async () => {
		const first = make(2);
		const second = new PoolWorkspaceProvider({ dir: pool, prefix: 'ws-', count: 2 }, deps());

		await first.allocate(request('aaaa1111'));
		const handle = await second.allocate(request('bbbb2222'));

		expect(handle.path).toBe(path.join(pool, 'ws-2'));
	});
});
