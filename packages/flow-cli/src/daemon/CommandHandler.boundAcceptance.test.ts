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
import { DeclaredGuarantees } from './DeclaredGuarantees';
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

registerCommandHandlerHooks({ mockAllocate, mockRelease, hoistedState });

/**
 * A step that requires a guarantee, and connected workers whose source provides it: which of them count for the wait.
 * The flow demands the label "gpu", so a worker without it refuses the step.
 */

const GPU_REQUIRING_FLOW = `\
id: gpu-requiring
version: "1.0.0"
name: Gpu Requiring
description: requires the sandbox guarantee, demands a label
requires: [sandbox]
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

const SOURCES = [source('sbx-1', 'sandbox.docker'), source('sbx-2', 'sandbox.docker')];

const CATALOG = new WorkerTypeCatalog(
	{ list: () => SOURCES },
	{ isRequirementOnly: () => false },
	{ guaranteesOf: () => ['sandbox'] }
);

const DECLARED = new DeclaredGuarantees(
	{ list: () => SOURCES },
	{ declaredGuarantees: async () => ['sandbox'] },
	() => {}
);

beforeAll(async () => {
	await DECLARED.refresh();
});

/** A connected worker of a source that guarantees "sandbox" (the source is declared), with the given labels. */
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
		{ ...emptyWorkerRouting(), workerTypes: CATALOG, boundStepWaitMs: 120_000, declaredGuarantees: DECLARED }
	);
	return { handler, sent };
}

async function startRun(handler: TrackedCommandHandler) {
	const flowFile = path.join(tmpDir, 'gpu.yml');
	fs.writeFileSync(flowFile, GPU_REQUIRING_FLOW);
	return handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
}

const lastFailureReason = () => String(mockExecStore.markStepFailed.mock.calls.at(-1)?.[2] ?? '');

describe('a step with requirements and the workers that meet them that are connected', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('hands the step to a connected worker that meets the requirements and has the label', async () => {
		const accepting = sandboxWorker('w-2', ['gpu']);
		const { handler, sent } = daemonWith([accepting], [accepting]);

		await startRun(handler);

		expect(sent).toEqual(['w-2']);
	});

	it('keeps waiting while a worker that meets the requirements and has the label is connected but busy', async () => {
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

describe('a step with requirements fails once the bound is spent when no connected worker can accept it', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('does not let a connected worker that refuses the step hold the bound open', async () => {
		const refusing = sandboxWorker('w-1', []);
		const { handler, sent } = daemonWith([refusing], [refusing]);
		await startRun(handler);

		vi.advanceTimersByTime(121_000);
		handler.tryDispatch();

		expect(sent).toEqual([]);
		expect(mockExecStore.markStepFailed).toHaveBeenCalledTimes(1);
		expect(lastFailureReason()).toContain('requires sandbox');
		expect(lastFailureReason()).toContain('accepts this step was available in the 120s it waited');
		expect(lastFailureReason()).not.toMatch(/workerType|worker type/);
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
		expect(lastFailureReason()).toContain('requires sandbox');
	});

	it('keeps waiting while any of several connected workers that meet the requirements and accept the step is busy', async () => {
		const busyAccepting = sandboxWorker('w-1', ['gpu']);
		const second = sandboxWorker('w-2', ['gpu'], 'sbx-2');
		const { handler } = daemonWith([], [busyAccepting, second]);
		await startRun(handler);

		vi.advanceTimersByTime(1_000);
		handler.tryDispatch();

		expect(mockExecStore.markStepFailed).not.toHaveBeenCalled();
	});
});
