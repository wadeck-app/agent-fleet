import * as fs from 'node:fs';
import * as path from 'node:path';

import { MAX_REDISPATCHES } from './CommandHandler';
import {
	TrackedCommandHandler,
	createMockWorkerPool,
	daemonDir,
	mockExecStore,
	mockLogWriter,
	registerCommandHandlerHooks,
	tmpDir,
} from './CommandHandlerTestHarness';
import type { WorkerSourceEntry } from './WorkerSourceRegistry';
import { WorkerTypeCatalog } from './WorkerTypeCatalog';

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

const BOUND_FLOW_YAML = `\
id: bound-flow
version: "1.0.0"
name: Bound Flow
description: bound to a worker type
workerType: sandbox
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: s1
    name: S1
    type: script
    script: echo hello
`;

const UNBOUND_FLOW_YAML = BOUND_FLOW_YAML.replace('workerType: sandbox\n', '');

const INTERVENTION_BOUND_FLOW_YAML = `\
id: bound-intervention
version: "1.0.0"
name: Bound Intervention
description: bound to a worker type
workerType: sandbox
workspace:
  mode: manual
  gitStrategy: any
  reusePolicy: if-available
inputs: {}
steps:
  - id: approve
    name: Approve
    type: user_intervention
    interventionType: approval
    approval:
      title: Approve
`;

function source(sourceId: string, plugin: string): WorkerSourceEntry {
	return {
		sourceId,
		provider: 'sandbox',
		labels: [],
		maxWorkers: 2,
		plugin,
		pluginsDir: '/plugins',
		tokenHash: 'h',
		sourceTokenHash: 'h',
		createdAt: '2026-01-01T00:00:00.000Z',
	} as WorkerSourceEntry;
}

const CATALOG = new WorkerTypeCatalog({
	list: () => [source('sbx-1', 'sandbox.docker'), source('gpu-1', 'gpu.farm')],
});

/** An idle worker: `sourceId` absent is a host worker (one that belongs to no declared source). */
function idleWorker(name: string, props: { sourceId?: string; hasUserInterface?: boolean } = {}) {
	return {
		ws: { name },
		worker: {
			state: 'idle',
			workerId: name,
			pid: 1,
			labels: [] as string[],
			attachedProjectIds: [] as string[],
			attachedProjects: [] as string[],
			hasUserInterface: props.hasUserInterface ?? false,
			ephemeral: true,
			shellCapabilities: [] as string[],
			features: [] as string[],
			...(props.sourceId === undefined ? {} : { sourceId: props.sourceId }),
		},
	};
}

type Idle = ReturnType<typeof idleWorker>;

/** A daemon whose registry says `idle` workers are idle and `connected` are connected (idle or busy). */
function daemonWith(idle: Idle[], options: { connected?: Idle[]; boundStepWaitMs?: number } = {}) {
	const pool = createMockWorkerPool();
	const sent: { to: string; stepId: string; assignmentId: string }[] = [];
	pool.listIdle.mockImplementation(() => idle);
	pool.summarize.mockImplementation(() => (options.connected ?? idle).map(candidate => candidate.worker));
	pool.send.mockImplementation((ws: unknown, msg: unknown) => {
		const m = msg as { stepId: string; assignmentId: string };
		sent.push({ to: (ws as { name: string }).name, stepId: m.stepId, assignmentId: m.assignmentId });
		return true;
	});
	const handler = new TrackedCommandHandler(
		daemonDir,
		pool as never,
		pool as never,
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
		undefined,
		undefined,
		undefined,
		undefined,
		undefined,
		{ workerTypes: CATALOG, boundStepWaitMs: options.boundStepWaitMs ?? 120_000 }
	);
	return { handler, pool, sent };
}

async function run(handler: TrackedCommandHandler, yamlText: string) {
	const flowFile = path.join(tmpDir, 'bound.yml');
	fs.writeFileSync(flowFile, yamlText);
	return handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
}

const child = (id: string) => ({ id, name: id, type: 'script', script: 'echo injected' }) as never;

const lastFailureReason = () => String(mockExecStore.markStepFailed.mock.calls.at(-1)?.[2] ?? '');

describe('CommandHandler -- a run bound to a worker type', () => {
	// A host worker is idle and listed first: only the binding keeps the step off it.
	it('sends a step only to a worker of the bound type, even when a host worker is idle', async () => {
		const { handler, sent } = daemonWith([idleWorker('host'), idleWorker('sandbox', { sourceId: 'sbx-1' })]);

		await run(handler, BOUND_FLOW_YAML);

		expect(sent.map(s => s.to)).toEqual(['sandbox']);
	});

	it('does not send a step to a worker of another type', async () => {
		const { handler, sent } = daemonWith([idleWorker('gpu', { sourceId: 'gpu-1' })]);

		await run(handler, BOUND_FLOW_YAML);

		expect(sent).toEqual([]);
	});

	// Flow labels are merged into steps only at run start, so labels cannot cover a step added later.
	it('sends a step injected into a bound run only to a worker of the bound type', async () => {
		const { handler, sent } = daemonWith([idleWorker('host'), idleWorker('sandbox', { sourceId: 'sbx-1' })]);
		const result = await run(handler, BOUND_FLOW_YAML);
		const { executionId } = result as { executionId: string };

		handler.injectSteps(executionId, [child('injected')]);
		handler.tryDispatch();

		expect(sent.map(s => `${s.stepId}->${s.to}`)).toEqual(['s1->sandbox', 'injected->sandbox']);
	});

	it('keeps an injected step queued when only host workers are idle', async () => {
		const sandbox = idleWorker('sandbox', { sourceId: 'sbx-1' });
		const { handler, sent, pool } = daemonWith([sandbox], { connected: [sandbox, idleWorker('host')] });
		const { executionId } = (await run(handler, BOUND_FLOW_YAML)) as { executionId: string };
		pool.listIdle.mockReturnValue([idleWorker('host')]);

		handler.injectSteps(executionId, [child('injected')]);
		handler.tryDispatch();

		expect(sent.map(s => s.stepId)).toEqual(['s1']);
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});

	it('is not affected by a flow that is not bound: a host worker takes its step as before', async () => {
		const { handler, sent } = daemonWith([idleWorker('host'), idleWorker('sandbox', { sourceId: 'sbx-1' })]);

		await run(handler, UNBOUND_FLOW_YAML);

		expect(sent.map(s => s.to)).toEqual(['host']);
	});

	it('is not affected by a flow that is not bound when no routing settings are given at all', async () => {
		const pool = createMockWorkerPool();
		const sent: string[] = [];
		pool.listIdle.mockReturnValue([idleWorker('host')]);
		pool.send.mockImplementation((_ws: unknown, msg: unknown) => {
			sent.push((msg as { stepId: string }).stepId);
			return true;
		});
		const handler = new TrackedCommandHandler(
			daemonDir,
			pool as never,
			pool as never,
			undefined,
			mockExecStore as never,
			mockLogWriter as never
		);

		await run(handler, UNBOUND_FLOW_YAML);

		expect(sent).toEqual(['s1']);
	});

	it('refuses to start a run bound to an unknown type, naming the known ones', async () => {
		const { handler, sent } = daemonWith([idleWorker('host')]);

		const result = await run(handler, BOUND_FLOW_YAML.replace('workerType: sandbox', 'workerType: sandbx'));

		expect(result).toMatchObject({ type: 'error', code: 'VALIDATION_FAILED' });
		expect(JSON.stringify(result)).toContain('Known worker types: gpu, sandbox');
		expect(sent).toEqual([]);
	});

	describe('when no worker of the type is connected', () => {
		beforeEach(() => {
			vi.useFakeTimers();
		});
		afterEach(() => {
			vi.useRealTimers();
		});

		it('keeps the step queued for the whole bound, never running it on the host worker', async () => {
			const { handler, sent } = daemonWith([idleWorker('host')], { boundStepWaitMs: 120_000 });
			await run(handler, BOUND_FLOW_YAML);

			vi.advanceTimersByTime(119_000);
			handler.tryDispatch();

			expect(sent).toEqual([]);
			expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
		});

		it('fails the step once the bound is spent, with a message saying what to do, and never runs it on the host', async () => {
			const { handler, sent } = daemonWith([idleWorker('host')], { boundStepWaitMs: 120_000 });
			await run(handler, BOUND_FLOW_YAML);

			vi.advanceTimersByTime(121_000);
			handler.tryDispatch();

			expect(sent).toEqual([]);
			expect(mockExecStore.markStepFailed).toHaveBeenCalledTimes(1);
			const reason = lastFailureReason();
			expect(reason).toContain('worker type "sandbox"');
			expect(reason).toContain('never runs on another worker');
			expect(reason).toContain('flow worker source list');
			expect(reason).toContain('worker.boundStepWaitSeconds');
		});

		// No manual dispatch pass: the daemon must notice the bound on its own. Forking is attempted and fails, which is
		// the case where the demand re-check is off and no worker ever sends `ready`.
		it('fails the step by itself when the bound passes, even though forking a worker failed', async () => {
			vi.spyOn(process.stderr, 'write').mockReturnValue(true);
			const { handler, pool, sent } = daemonWith([idleWorker('host')], { boundStepWaitMs: 120_000 });
			pool.planProvisioning.mockReturnValue({ fork: 1 });
			pool.provision.mockRejectedValue(new Error('docker is down'));
			await run(handler, BOUND_FLOW_YAML);

			await vi.advanceTimersByTimeAsync(119_000);
			expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
			await vi.advanceTimersByTimeAsync(2_000);

			expect(sent).toEqual([]);
			expect(mockExecStore.markStepFailed).toHaveBeenCalledTimes(1);
			expect(lastFailureReason()).toContain('worker type "sandbox"');
		});

		it('fails an injected step by itself when the bound passes', async () => {
			vi.spyOn(process.stderr, 'write').mockReturnValue(true);
			const host = idleWorker('host');
			const { handler, sent, pool } = daemonWith([host, idleWorker('sandbox', { sourceId: 'sbx-1' })], {
				boundStepWaitMs: 5_000,
			});
			pool.planProvisioning.mockReturnValue({ fork: 1 });
			const { executionId } = (await run(handler, BOUND_FLOW_YAML)) as { executionId: string };
			pool.listIdle.mockReturnValue([host]);
			pool.summarize.mockReturnValue([host.worker]);
			handler.injectSteps(executionId, [child('injected')]);
			handler.tryDispatch();

			await vi.advanceTimersByTimeAsync(6_000);

			expect(sent.map(s => s.stepId)).toEqual(['s1']);
			expect(mockExecStore.markStepFailed.mock.calls.map(call => call[1])).toEqual(['injected']);
		});

		it('stops watching the bound when the daemon stops', async () => {
			const { handler } = daemonWith([idleWorker('host')], { boundStepWaitMs: 5_000 });
			await run(handler, BOUND_FLOW_YAML);

			handler.stopBackgroundWork();
			await vi.advanceTimersByTimeAsync(60_000);

			expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
		});

		it('fails an injected step of a bound run the same way', async () => {
			const host = idleWorker('host');
			const { handler, sent, pool } = daemonWith([host, idleWorker('sandbox', { sourceId: 'sbx-1' })], {
				boundStepWaitMs: 1_000,
			});
			const { executionId } = (await run(handler, BOUND_FLOW_YAML)) as { executionId: string };
			// The sandbox worker is gone (the first step is with it); only the host worker is left.
			pool.listIdle.mockReturnValue([host]);
			pool.summarize.mockReturnValue([host.worker]);

			handler.injectSteps(executionId, [child('injected')]);
			handler.tryDispatch();
			vi.advanceTimersByTime(1_500);
			handler.tryDispatch();

			expect(sent.map(s => s.stepId)).toEqual(['s1']);
			expect(mockExecStore.markStepFailed.mock.calls.map(call => call[1])).toEqual(['injected']);
		});

		// A worker of the type that is busy frees up: that is a queue, not a missing worker.
		it('keeps waiting past the bound while a worker of the type is connected but busy', async () => {
			const busySandbox = idleWorker('sandbox', { sourceId: 'sbx-1' });
			const { handler, sent } = daemonWith([idleWorker('host')], {
				boundStepWaitMs: 120_000,
				connected: [idleWorker('host'), busySandbox],
			});
			await run(handler, BOUND_FLOW_YAML);

			vi.advanceTimersByTime(600_000);
			handler.tryDispatch();

			expect(sent).toEqual([]);
			expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
		});

		it('places the step as soon as a worker of the type is idle, whatever it waited before', async () => {
			const { handler, sent, pool } = daemonWith([idleWorker('host')], { boundStepWaitMs: 120_000 });
			await run(handler, BOUND_FLOW_YAML);
			vi.advanceTimersByTime(100_000);

			pool.listIdle.mockReturnValue([idleWorker('host'), idleWorker('sandbox', { sourceId: 'sbx-1' })]);
			handler.tryDispatch();

			expect(sent.map(s => s.to)).toEqual(['sandbox']);
			expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
		});
	});

	describe('when the worker is lost before the step starts', () => {
		it('hands the step over again only to workers of the type, then fails after the re-dispatch budget', async () => {
			const sandbox = idleWorker('sandbox', { sourceId: 'sbx-1' });
			const { handler, sent } = daemonWith([idleWorker('host'), sandbox]);
			await run(handler, BOUND_FLOW_YAML);

			for (let i = 0; i <= MAX_REDISPATCHES; i++) {
				handler.handleWorkerDisconnect(sandbox.ws as never);
				handler.tryDispatch();
			}

			expect(sent).toHaveLength(MAX_REDISPATCHES + 1);
			expect(new Set(sent.map(s => s.to))).toEqual(new Set(['sandbox']));
			expect(mockExecStore.markStepFailed).toHaveBeenCalledTimes(1);
			expect(lastFailureReason()).toMatch(/disconnect/i);
		});
	});

	describe('when the run is resumed', () => {
		// Resume re-dispatches into the same in-memory execution: the binding must still be there.
		it('keeps sending the resumed step only to a worker of the bound type', async () => {
			const host = idleWorker('host', { hasUserInterface: true });
			const sandbox = idleWorker('sandbox', { sourceId: 'sbx-1', hasUserInterface: true });
			const { handler, sent } = daemonWith([host, sandbox]);
			const { executionId } = (await run(handler, INTERVENTION_BOUND_FLOW_YAML)) as { executionId: string };
			handler.onStepFailed(executionId, 'approve', 'timed out: this step is unanswered, not denied');
			expect(handler.hasResumableInterventions()).toBe(true);

			handler.handleResume(executionId);

			expect(sent.map(s => `${s.stepId}->${s.to}`)).toEqual(['approve->sandbox', 'approve->sandbox']);
		});
	});
});
