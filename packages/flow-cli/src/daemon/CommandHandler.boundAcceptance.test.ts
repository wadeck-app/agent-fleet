import * as fs from 'node:fs';
import * as path from 'node:path';

import {
	TrackedCommandHandler,
	createMockWorkerPool,
	daemonDir,
	emptyWorkerRouting,
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
	return { ...actual, homedir: vi.fn().mockImplementation(() => actual.homedir()) };
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

/**
 * A step of a run bound to a worker type, and workers of that type that are connected: which of them count for the wait.
 * The flow demands the label "gpu", so a worker without it refuses the step.
 */

const GPU_BOUND_FLOW = `\
id: gpu-bound
version: "1.0.0"
name: Gpu Bound
description: bound to a worker type, demands a label
workerType: sandbox
labels: [gpu]
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
	list: () => [source('sbx-1', 'sandbox.docker'), source('sbx-2', 'sandbox.docker')],
});

/** A connected worker of type "sandbox" (its source is declared), with the given labels. */
function sandboxWorker(name: string, labels: string[], sourceId = 'sbx-1') {
	return {
		ws: { name },
		worker: {
			state: 'idle',
			workerId: name,
			pid: 1,
			labels,
			attachedProjectIds: [] as string[],
			attachedProjects: [] as string[],
			hasUserInterface: false,
			ephemeral: true,
			shellCapabilities: [] as string[],
			features: [] as string[],
			sourceId,
		},
	};
}

type Worker = ReturnType<typeof sandboxWorker>;

/** `idle` workers can be handed a step; `connected` are all workers (idle or busy). */
function daemonWith(idle: Worker[], connected: Worker[]) {
	const pool = createMockWorkerPool();
	const sent: string[] = [];
	pool.listIdle.mockImplementation(() => idle);
	pool.summarize.mockImplementation(() => connected.map(candidate => candidate.worker));
	pool.send.mockImplementation((ws: unknown) => {
		sent.push((ws as { name: string }).name);
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
		{ ...emptyWorkerRouting(), workerTypes: CATALOG, boundStepWaitMs: 120_000 }
	);
	return { handler, sent };
}

async function startRun(handler: TrackedCommandHandler) {
	const flowFile = path.join(tmpDir, 'gpu.yml');
	fs.writeFileSync(flowFile, GPU_BOUND_FLOW);
	return handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
}

const lastFailureReason = () => String(mockExecStore.markStepFailed.mock.calls.at(-1)?.[2] ?? '');

describe('a bound step and the workers of its type that are connected', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('hands the step to a connected worker of the type that has the label', async () => {
		const accepting = sandboxWorker('w-2', ['gpu']);
		const { handler, sent } = daemonWith([accepting], [accepting]);

		await startRun(handler);

		expect(sent).toEqual(['w-2']);
	});

	it('keeps waiting while a worker of the type that has the label is connected but busy', async () => {
		const busy = sandboxWorker('w-3', ['gpu']);
		const { handler, sent } = daemonWith([], [busy]);
		await startRun(handler);

		vi.advanceTimersByTime(600_000);
		handler.tryDispatch();

		expect(sent).toEqual([]);
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
		expect(lastFailureReason()).toBe('');
	});
});

describe('a bound step fails fast when no connected worker of its type can accept it', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('no longer lets a connected worker that refuses the step hold the bound open, and names it and why', async () => {
		const refusing = sandboxWorker('w-1', []);
		const { handler, sent } = daemonWith([refusing], [refusing]);
		await startRun(handler);

		vi.advanceTimersByTime(121_000);
		handler.tryDispatch();

		expect(sent).toEqual([]);
		expect(mockExecStore.markStepFailed).toHaveBeenCalledTimes(1);
		expect(lastFailureReason()).toContain('worker type "sandbox"');
		expect(lastFailureReason()).toContain(
			'no worker of that type that accepts this step was available in the 120s it waited'
		);
		expect(lastFailureReason()).not.toContain('was connected in the');
		expect(lastFailureReason()).toContain(
			'Workers of that type are connected but refuse this step: w-1 (it lacks the label "gpu").'
		);
	});

	it('does not fail before the bound: a refusing worker may be replaced by one that accepts', async () => {
		const refusing = sandboxWorker('w-1', []);
		const { handler } = daemonWith([refusing], [refusing]);
		await startRun(handler);

		vi.advanceTimersByTime(119_000);
		handler.tryDispatch();

		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});

	it('still keeps waiting while a busy worker that would accept the step is connected, even next to a refusing one', async () => {
		const refusing = sandboxWorker('w-1', []);
		const busyAccepting = sandboxWorker('w-3', ['gpu'], 'sbx-2');
		const { handler, sent } = daemonWith([refusing], [refusing, busyAccepting]);
		await startRun(handler);

		vi.advanceTimersByTime(600_000);
		handler.tryDispatch();

		expect(sent).toEqual([]);
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});

	it('lists every refusing worker of the type, and none of another type', async () => {
		const first = sandboxWorker('w-1', []);
		const second = sandboxWorker('w-2', ['arm'], 'sbx-2');
		const host = {
			...sandboxWorker('host-1', []),
			worker: { ...sandboxWorker('host-1', []).worker, sourceId: undefined },
		};
		const { handler } = daemonWith([first, second], [first, second, host as never]);
		await startRun(handler);

		vi.advanceTimersByTime(121_000);
		handler.tryDispatch();

		expect(lastFailureReason()).toContain(
			'refuse this step: w-1 (it lacks the label "gpu"); w-2 (it lacks the label "gpu").'
		);
		expect(lastFailureReason()).not.toContain('host-1');
	});

	it('hands the step to the worker that accepts it as soon as it is idle, whatever the others do', async () => {
		const refusing = sandboxWorker('w-1', []);
		const accepting = sandboxWorker('w-2', ['gpu'], 'sbx-2');
		const { handler, sent } = daemonWith([refusing, accepting], [refusing, accepting]);

		await startRun(handler);

		expect(sent).toEqual(['w-2']);
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});
});

describe('a worker that flips between accepting and refusing', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('starts the clock at the first pass after it flips to refusing, and a worker accepting again resets it', async () => {
		const flipper = sandboxWorker('w-1', ['gpu']);
		const { handler, sent } = daemonWith([], [flipper]);
		await startRun(handler);

		// Accepting but busy: the step waits, however long.
		vi.advanceTimersByTime(100_000);
		handler.tryDispatch();
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();

		// It now refuses (the clock starts at this pass) and does not fail before the bound.
		flipper.worker.labels = [];
		handler.tryDispatch();
		vi.advanceTimersByTime(119_000);
		handler.tryDispatch();
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();

		// Accepting again: the clock is forgotten.
		flipper.worker.labels = ['gpu'];
		handler.tryDispatch();
		flipper.worker.labels = [];
		handler.tryDispatch();
		vi.advanceTimersByTime(119_000);
		handler.tryDispatch();
		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();

		// Refusing for a full bound after the last flip: now it fails.
		vi.advanceTimersByTime(2_000);
		handler.tryDispatch();
		expect(sent).toEqual([]);
		expect(mockExecStore.markStepFailed).toHaveBeenCalledTimes(1);
		expect(lastFailureReason()).toContain('w-1 (it lacks the label "gpu")');
	});

	it('asks the acceptance of each worker of the type only until one accepts', async () => {
		const busyAccepting = sandboxWorker('w-1', ['gpu']);
		const second = sandboxWorker('w-2', ['gpu'], 'sbx-2');
		const { handler } = daemonWith([], [busyAccepting, second]);
		await startRun(handler);

		vi.advanceTimersByTime(1_000);
		handler.tryDispatch();

		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});
});
