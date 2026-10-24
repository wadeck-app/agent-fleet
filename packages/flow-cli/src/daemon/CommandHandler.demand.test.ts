import * as fs from 'node:fs';
import * as path from 'node:path';

import type { CommandHandler } from './CommandHandler';
import { MAX_REDISPATCHES } from './CommandHandler';
import {
	TrackedCommandHandler,
	VALID_FLOW_YAML,
	createMockWorkerPool,
	daemonDir,
	mockExecStore,
	mockLogWriter,
	registerCommandHandlerHooks,
	tmpDir,
} from './CommandHandlerTestHarness';

const { mockAllocate, mockRelease, hoistedState } = vi.hoisted(() => ({
	mockAllocate: vi.fn().mockResolvedValue({ path: '/tmp/test-workspace', id: 'ws-test-id' }),
	mockRelease: vi.fn().mockResolvedValue(undefined),
	hoistedState: { actualHomedir: '' as string },
}));

vi.mock('node:os', async importOriginal => {
	const actual = (await importOriginal()) as typeof import('node:os');
	hoistedState.actualHomedir = actual.homedir();
	return {
		...actual,
		homedir: vi.fn().mockImplementation(() => actual.homedir()),
	};
});

vi.mock('flow-engine', async importOriginal => {
	const actual = (await importOriginal()) as Record<string, unknown>;
	return {
		...actual,
		WorkspaceManager: class MockWorkspaceManager {
			allocate = mockAllocate;
			release = mockRelease;
		},
	};
});

registerCommandHandlerHooks({ mockAllocate, mockRelease, hoistedState });

describe('CommandHandler — covering unmet demand (S8, D#25)', () => {
	async function runWithNoWorker(plan: { fork: number; warning?: string }) {
		const flowFile = path.join(tmpDir, 'demand.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		workerPool.listIdle.mockReturnValue([]);
		workerPool.planProvisioning.mockReturnValue(plan);

		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		return { handler, workerPool };
	}

	// D#66: the daemon calls each declared source's single S1 method and waits. Asking only at
	// startup would mean the S8 wait waits for something nobody was asked for, and remote
	// capacity could never be used for a run that began later.
	it('asks the declared sources when demand appears', async () => {
		const flowFile = path.join(tmpDir, 'demand-sources.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);
		const workerPool = createMockWorkerPool();
		workerPool.listIdle.mockReturnValue([]);
		workerPool.planProvisioning.mockReturnValue({ fork: 0 });
		const askedSources = vi.fn();

		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			false,
			20,
			50,
			undefined,
			undefined,
			undefined,
			askedSources
		);
		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		handler.stopBackgroundWork();

		expect(askedSources).toHaveBeenCalledTimes(1);
	});

	// Once per episode, not once per pass: the re-check runs several times a second, and asking
	// a remote machine that often would be a denial of service aimed at your own fleet.
	it('asks them once per episode of unmet demand, not once per attempt', async () => {
		const flowFile = path.join(tmpDir, 'demand-once.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);
		const workerPool = createMockWorkerPool();
		workerPool.listIdle.mockReturnValue([]);
		workerPool.planProvisioning.mockReturnValue({ fork: 0 });
		const askedSources = vi.fn();

		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			false,
			20,
			50,
			undefined,
			undefined,
			undefined,
			askedSources
		);
		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		handler.tryDispatch();
		handler.tryDispatch();
		handler.stopBackgroundWork();

		expect(askedSources).toHaveBeenCalledTimes(1);
	});

	it('asks S8 how much unmet demand there is, and how long it has gone unserved', async () => {
		const { workerPool } = await runWithNoWorker({ fork: 0 });

		expect(workerPool.planProvisioning).toHaveBeenCalled();
		const [unmetDemand, waitingMs] = workerPool.planProvisioning.mock.calls[0]! as [number, number];
		expect(unmetDemand).toBe(1);
		expect(waitingMs).toBe(0);
	});

	// The wait is only bounded because dispatch re-runs itself while nothing can be placed.
	// Without that timer there is no `ready` message coming and no other event to resume on,
	// so "wait" would mean "wait forever" -- this is the test that would catch it.
	it('re-runs dispatch while waiting, so the wait actually ends', async () => {
		vi.useFakeTimers();
		let handler: CommandHandler | undefined;
		try {
			const started = await runWithNoWorker({ fork: 0 });
			handler = started.handler;
			const { workerPool } = started;
			const callsBefore = workerPool.planProvisioning.mock.calls.length;

			await vi.advanceTimersByTimeAsync(1_000);

			expect(workerPool.planProvisioning.mock.calls.length).toBeGreaterThan(callsBefore);
			// Later calls report a growing wait, which is what lets a policy time out at all.
			const lastCall = workerPool.planProvisioning.mock.calls.at(-1)! as [number, number];
			expect(lastCall[1]).toBeGreaterThan(0);
		} finally {
			// Or the pending re-check outlives the test and runs against reset mocks.
			handler?.stopBackgroundWork();
			vi.useRealTimers();
		}
	});

	// The same guarantee the daemon needs on shutdown: nothing queued for later may run once
	// the listener is closed.
	it('stops re-running dispatch once background work is stopped', async () => {
		vi.useFakeTimers();
		try {
			const { handler, workerPool } = await runWithNoWorker({ fork: 0 });

			handler.stopBackgroundWork();
			const callsBefore = workerPool.planProvisioning.mock.calls.length;
			await vi.advanceTimersByTimeAsync(1_000);

			expect(workerPool.planProvisioning.mock.calls.length).toBe(callsBefore);
		} finally {
			vi.useRealTimers();
		}
	});

	// A broken plugin must not take the daemon with it: this path also runs from a timer,
	// where an exception has no caller to report it.
	it('reports a plugin that returns no usable decision instead of crashing', async () => {
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);
		try {
			const { workerPool } = await runWithNoWorker(undefined as never);

			expect(workerPool.provision).not.toHaveBeenCalled();
			const reported = write.mock.calls.map(call => String(call[0])).join(' ');
			expect(reported).toContain('provisioning plugin');
			expect(reported).toMatch(/fork/);
		} finally {
			write.mockRestore();
		}
	});

	it('stops re-running dispatch once it has obtained what S8 asked for', async () => {
		vi.useFakeTimers();
		try {
			const { workerPool } = await runWithNoWorker({ fork: 1 });
			const callsBefore = workerPool.planProvisioning.mock.calls.length;

			await vi.advanceTimersByTimeAsync(1_000);

			expect(workerPool.planProvisioning.mock.calls.length).toBe(callsBefore);
		} finally {
			vi.useRealTimers();
		}
	});

	// Waiting is expressed as forking nothing, so nothing may be created on that pass.
	it('creates no worker while S8 is still waiting', async () => {
		const { workerPool } = await runWithNoWorker({ fork: 0 });

		expect(workerPool.provision).not.toHaveBeenCalled();
	});

	it('obtains exactly as many workers as S8 asked for', async () => {
		const { workerPool } = await runWithNoWorker({ fork: 2 });

		expect(workerPool.provision).toHaveBeenCalledTimes(2);
	});

	// A violated preference must be visible, or the user never learns their declared
	// capacity went unused (D#25).
	it('reports the S8 warning', async () => {
		const write = vi.spyOn(process.stderr, 'write').mockReturnValue(true);

		await runWithNoWorker({ fork: 1, warning: 'source "laptop" produced nothing' });

		expect(write.mock.calls.map(call => String(call[0])).join(' ')).toContain('laptop');
		write.mockRestore();
	});

	it('does not consult S8 when every step was placed', async () => {
		const flowFile = path.join(tmpDir, 'placed.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		workerPool.getIdle.mockReturnValue({} as never);
		workerPool.send.mockReturnValue(true);

		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);

		expect(workerPool.planProvisioning).not.toHaveBeenCalled();
	});
});

describe('CommandHandler — mid-step disconnect (D#62, D#65)', () => {
	/** Runs the one-step flow to the point where s1 sits with the worker. */
	async function dispatchOneStep() {
		const flowFile = path.join(tmpDir, 'disconnect.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		const worker = {} as never;
		const sent: { stepId: string; assignmentId: string }[] = [];
		workerPool.getIdle.mockReturnValue(worker);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			const m = msg as { stepId: string; assignmentId: string };
			sent.push({ stepId: m.stepId, assignmentId: m.assignmentId });
			return true;
		});

		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		const { executionId } = result as { executionId: string };

		return { handler, workerPool, worker, sent, executionId };
	}

	// Closing a terminal before the step ran costs nothing, so it must not be charged to
	// the author's retry budget (D#43) -- the step goes back on the queue untouched.
	it('re-dispatches a step that never started, without failing it', async () => {
		const { handler, worker, sent } = await dispatchOneStep();
		expect(sent).toHaveLength(1);

		handler.handleWorkerDisconnect(worker);
		handler.tryDispatch();

		expect(sent.map(s => s.stepId)).toEqual(['s1', 's1']);
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});

	// A step that had begun may have changed something. Replaying it silently is worse
	// than failing it, so the author's declared retry/onFailure decides (D#65).
	it('fails a step that had begun executing instead of replaying it', async () => {
		const { handler, worker, sent, executionId } = await dispatchOneStep();
		handler.onStepStarted(worker, sent[0]!.assignmentId, executionId, 's1');

		handler.handleWorkerDisconnect(worker);
		handler.tryDispatch();

		expect(sent).toHaveLength(1);
		expect(mockExecStore.markStepFailed).toHaveBeenCalled();
	});

	it('ignores a step_started that names an assignment issued to another worker', async () => {
		const { handler, sent, executionId } = await dispatchOneStep();

		handler.onStepStarted({} as never, sent[0]!.assignmentId, executionId, 's1');
		// Still classified as not started, so it is re-dispatched rather than failed.
		handler.handleWorkerDisconnect({} as never);

		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});

	// Otherwise a step nobody ever starts is re-dispatched forever (D#62). Pinned to the
	// constant and to the exact boundary: asserting only "fewer than ten" would pass just as
	// happily if the bound were raised to nine.
	it('spends exactly the re-dispatch budget before giving up', async () => {
		const { handler, worker, sent } = await dispatchOneStep();

		for (let i = 0; i < MAX_REDISPATCHES; i++) {
			handler.handleWorkerDisconnect(worker);
			handler.tryDispatch();
		}

		// One original hand-off plus one per allowed re-dispatch, and still not failed.
		expect(sent).toHaveLength(MAX_REDISPATCHES + 1);
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});

	it('fails the step on the next disconnect, saying what to check', async () => {
		const { handler, worker, sent } = await dispatchOneStep();

		for (let i = 0; i <= MAX_REDISPATCHES; i++) {
			handler.handleWorkerDisconnect(worker);
			handler.tryDispatch();
		}

		expect(sent).toHaveLength(MAX_REDISPATCHES + 1);
		expect(mockExecStore.markStepFailed).toHaveBeenCalled();
		const reason = String(mockExecStore.markStepFailed.mock.calls.at(-1)?.[2] ?? '');
		expect(reason).toMatch(/disconnect/i);
		expect(reason).toContain('flow worker list');
	});

	// The budget counts hand-offs that never began. Once a step has run, its earlier aborted
	// hand-offs must not still be held against it -- a retry would start part-way through a
	// budget it never spent.
	it('forgets earlier aborted hand-offs once the step has actually started', async () => {
		const { handler, worker, sent, executionId } = await dispatchOneStep();

		for (let i = 0; i < MAX_REDISPATCHES; i++) {
			handler.handleWorkerDisconnect(worker);
			handler.tryDispatch();
		}
		handler.onStepStarted(worker, sent.at(-1)!.assignmentId, executionId, 's1');
		// Budget reset, so this disconnect is a failure of a started step rather than an
		// exhausted budget -- and a fresh not-started disconnect would be re-dispatched again.
		handler.handleWorkerDisconnect(worker);
		handler.tryDispatch();

		const reason = String(mockExecStore.markStepFailed.mock.calls.at(-1)?.[2] ?? '');
		expect(reason).toMatch(/while it was executing/i);
	});

	it('does nothing for a worker that held no assignment', async () => {
		const { handler } = await dispatchOneStep();

		expect(() => handler.handleWorkerDisconnect({} as never)).not.toThrow();
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});
});

describe('CommandHandler — a step whose worker went quiet', () => {
	/** Runs the one-step flow to the point where s1 is executing, with a short silence limit. */
	async function startOneStep(limitMs: number, started = true) {
		const flowFile = path.join(tmpDir, 'quiet.yml');
		fs.writeFileSync(flowFile, VALID_FLOW_YAML);

		const workerPool = createMockWorkerPool();
		const worker = {} as never;
		const sent: { stepId: string; assignmentId: string }[] = [];
		workerPool.getIdle.mockReturnValue(worker);
		workerPool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			const m = msg as { stepId: string; assignmentId: string };
			sent.push({ stepId: m.stepId, assignmentId: m.assignmentId });
			return true;
		});

		const handler = new TrackedCommandHandler(
			daemonDir,
			workerPool as never,
			workerPool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			undefined,
			limitMs
		);
		const result = await handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
		const { executionId } = result as { executionId: string };
		const assignmentId = sent[0]?.assignmentId;
		if (assignmentId === undefined) throw new Error('no step was dispatched, so nothing can stall');
		if (started) handler.onStepStarted(worker, assignmentId, executionId, 's1');

		return { handler, assignmentId, workerPool, worker };
	}

	// The gap this closes: a closing socket was the only thing the daemon reacted to, so a step that
	// simply never finished held its assignment forever and the flow waited with it. A `jest` run left
	// in a workspace still held one 32 hours later.
	it('fails an executing step that has reported nothing for the limit', async () => {
		vi.useFakeTimers();
		try {
			const { handler } = await startOneStep(60_000);

			// A slow step is not a stuck one.
			vi.advanceTimersByTime(59_000);
			handler.failStalledSteps();
			expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();

			vi.advanceTimersByTime(2_000);
			handler.failStalledSteps();

			const reason = String(mockExecStore.markStepFailed.mock.calls.at(-1)?.[2] ?? '');
			expect(reason).toMatch(/reported nothing/i);
			expect(reason).toMatch(/stuck/i);
			// The remedy has to name a key that exists: the first version said
			// queue.stepSilenceLimit, which is not the setting.
			expect(reason).toContain('queue.stepSilenceLimitSeconds');
			// Not retried: it was executing, so it may already have had an effect (D#65).
			expect(reason).toMatch(/not retried/i);
		} finally {
			vi.useRealTimers();
		}
	});

	// Settling the assignment alone left the worker marked busy for good: only the worker's own
	// `ready` frees it, and a worker that is wedged never sends one. That kept the daemon from
	// hibernating and held back every update, long after the step itself had been failed.
	it('drops the connection of the worker that stalled, so it does not stay busy forever', async () => {
		vi.useFakeTimers();
		try {
			const { handler, workerPool, worker } = await startOneStep(60_000);

			vi.advanceTimersByTime(61_000);
			handler.failStalledSteps();

			expect(workerPool.disconnect).toHaveBeenCalledWith(worker);
		} finally {
			vi.useRealTimers();
		}
	});

	// A worker sends step_started before anything else, so an assignment it never confirms was lost
	// in transit or the worker is wedged. Nothing ran, so the step is handed over again (via the
	// normal disconnect path) rather than failed.
	it('drops a worker that never confirmed starting its step, without failing the step', async () => {
		vi.useFakeTimers();
		try {
			const { handler, workerPool, worker } = await startOneStep(60_000, false);

			vi.advanceTimersByTime(59_000);
			handler.failStalledSteps();
			expect(workerPool.disconnect).not.toHaveBeenCalled();

			vi.advanceTimersByTime(2_000);
			handler.failStalledSteps();

			expect(workerPool.disconnect).toHaveBeenCalledWith(worker);
			expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it('treats output as progress, so a long but talkative step survives', async () => {
		vi.useFakeTimers();
		try {
			const { handler, assignmentId } = await startOneStep(60_000);

			for (let elapsed = 0; elapsed < 180_000; elapsed += 30_000) {
				vi.advanceTimersByTime(30_000);
				handler.noteAssignmentActivity(assignmentId);
				handler.failStalledSteps();
			}

			expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});

	it('says nothing about a step that settled normally', async () => {
		vi.useFakeTimers();
		try {
			const { handler, assignmentId } = await startOneStep(60_000);
			handler.settleAssignment(assignmentId);

			vi.advanceTimersByTime(120_000);
			handler.failStalledSteps();

			expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
		} finally {
			vi.useRealTimers();
		}
	});
});
