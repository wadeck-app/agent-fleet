import type { ExecutionState } from '../ipc/Protocol';
import type { AllocatedWorkspace, WorkspaceWaiting } from './ExecutionWorkspaces';
import { WaitingRuns } from './WaitingRuns';
import { WorkspaceWaitSupervisor } from './WorkspaceWaitSupervisor';

type Ready = Extract<AllocatedWorkspace, { ok: true }>;

describe('WorkspaceWaitSupervisor', () => {
	let waitingRuns: WaitingRuns;
	let records: Map<string, ExecutionState>;
	let writeExecution: ReturnType<typeof vi.fn>;
	let release: ReturnType<typeof vi.fn>;
	let supervisor: WorkspaceWaitSupervisor;

	const ready: Ready = { ok: true, workspaceDir: '/ws', workspaceMetaDir: '/ws.meta', readOnly: false };

	function record(executionId: string, waiting = true): ExecutionState {
		return {
			executionId,
			flowFile: 'f.yml',
			flowId: 'f',
			status: 'queued',
			currentSteps: [],
			startedAt: 'x',
			completedAt: null,
			steps: {},
			...(waiting ? { workspaceWait: { since: 'then', message: 'first reason', run: { type: 'run' } } } : {}),
		};
	}

	function control() {
		let settle!: (allocated: AllocatedWorkspace) => void;
		const listeners: ((message: string) => void)[] = [];
		const cancel = vi.fn();
		const waiting: WorkspaceWaiting = {
			message: 'first reason',
			settled: new Promise<AllocatedWorkspace>(resolve => {
				settle = resolve;
			}),
			cancel,
			onUpdate: listener => listeners.push(listener),
		};
		return { waiting, settle: (allocated: AllocatedWorkspace) => settle(allocated), listeners, cancel };
	}

	beforeEach(() => {
		waitingRuns = new WaitingRuns();
		records = new Map([['aaaa1111', record('aaaa1111')]]);
		writeExecution = vi.fn();
		release = vi.fn();
		supervisor = new WorkspaceWaitSupervisor(
			waitingRuns,
			{
				read: id => records.get(id)!,
				update: (id, patch) => {
					const next = { ...records.get(id)!, ...patch };
					records.set(id, next);
					return next;
				},
				markExecutionFailed: id => {
					const next = { ...records.get(id)!, status: 'failed' as const };
					records.set(id, next);
					return next;
				},
			},
			{ writeExecution } as never,
			release as never
		);
	});

	it('holds the run as waiting (counted, cancellable) until its workspace comes', () => {
		const { waiting, cancel } = control();

		supervisor.watch('aaaa1111', waiting, vi.fn());

		expect(waitingRuns.count()).toBe(1);
		waitingRuns.cancel('aaaa1111');
		expect(cancel).toHaveBeenCalledTimes(1);
	});

	it('starts the run when the workspace is granted, and stops counting it as waiting', async () => {
		const { waiting, settle } = control();
		const launch = vi.fn();
		supervisor.watch('aaaa1111', waiting, launch);

		settle(ready);
		await vi.waitFor(() => expect(launch).toHaveBeenCalledWith(ready));

		expect(waitingRuns.count()).toBe(0);
	});

	it('writes each new reason to the log of the run and to its record', () => {
		const { waiting, listeners } = control();
		supervisor.watch('aaaa1111', waiting, vi.fn());

		listeners[0]!('2/2 slots claimed by: bbbb2222');

		expect(writeExecution).toHaveBeenCalledWith('aaaa1111', '2/2 slots claimed by: bbbb2222', 'warning');
		expect(records.get('aaaa1111')!.workspaceWait!.message).toBe('2/2 slots claimed by: bbbb2222');
		expect(records.get('aaaa1111')!.workspaceWait!.since).toBe('then');
	});

	it('fails the run loudly, with the provider message, when the wait ends in a refusal', async () => {
		const { waiting, settle } = control();
		const launch = vi.fn();
		supervisor.watch('aaaa1111', waiting, launch);

		settle({
			ok: false,
			response: { type: 'error', code: 'WORKSPACE_ERROR', message: 'the pool folder vanished' },
		});
		await vi.waitFor(() => expect(records.get('aaaa1111')!.status).toBe('failed'));

		expect(launch).not.toHaveBeenCalled();
		expect(records.get('aaaa1111')!.lastError).toContain('the pool folder vanished');
		expect(records.get('aaaa1111')!.workspaceWait).toBeUndefined();
		expect(writeExecution).toHaveBeenCalledWith(
			'aaaa1111',
			expect.stringContaining('the pool folder vanished'),
			'error'
		);
		expect(waitingRuns.count()).toBe(0);
	});

	it('leaves a cancelled run alone: the canceller already recorded it', async () => {
		const { waiting, settle } = control();
		const launch = vi.fn();
		supervisor.watch('aaaa1111', waiting, launch);
		records.set('aaaa1111', { ...record('aaaa1111', false), status: 'failed', endReason: 'cancelled' });

		settle({
			ok: false,
			response: { type: 'error', code: 'WORKSPACE_WAIT_CANCELLED', message: 'cancelled' },
		});
		await vi.waitFor(() => expect(waitingRuns.count()).toBe(0));

		expect(launch).not.toHaveBeenCalled();
		expect(records.get('aaaa1111')!.lastError).toBeUndefined();
	});

	it('gives the workspace back when it was granted after the run was cancelled', async () => {
		const { waiting, settle } = control();
		const launch = vi.fn();
		supervisor.watch('aaaa1111', waiting, launch);
		records.set('aaaa1111', { ...record('aaaa1111', false), status: 'failed', endReason: 'cancelled' });

		settle(ready);
		await vi.waitFor(() => expect(release).toHaveBeenCalled());

		expect(launch).not.toHaveBeenCalled();
		expect(release.mock.calls[0]![0]).toBe('aaaa1111');
	});

	it('fails the run, naming the cause, when starting it throws after the workspace was granted', async () => {
		const { waiting, settle } = control();
		supervisor.watch('aaaa1111', waiting, () => {
			throw new Error('scheduler exploded');
		});
		const stderr = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		settle(ready);
		await vi.waitFor(() => expect(records.get('aaaa1111')!.status).toBe('failed'));
		stderr.mockRestore();

		expect(records.get('aaaa1111')!.lastError).toContain('scheduler exploded');
		expect(release).toHaveBeenCalled();
	});
});
