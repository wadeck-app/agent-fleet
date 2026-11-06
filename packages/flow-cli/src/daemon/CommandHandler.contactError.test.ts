import * as fs from 'node:fs';
import * as path from 'node:path';

import {
	TrackedCommandHandler,
	createMockWorkerPool,
	daemonDir,
	mockExecStore,
	mockLogWriter,
	registerCommandHandlerHooks,
	tmpDir,
} from './CommandHandlerTestHarness';
import { SourceContactErrors } from './SourceContactErrors';
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

/** A daemon with only a host worker connected: nothing of the bound type ever shows up. */
function daemon(contactErrors: SourceContactErrors) {
	const pool = createMockWorkerPool();
	const hostWorker = {
		ws: { name: 'host' },
		worker: {
			state: 'idle',
			workerId: 'host',
			pid: 1,
			labels: [] as string[],
			attachedProjectIds: [] as string[],
			attachedProjects: [] as string[],
			hasUserInterface: false,
			ephemeral: true,
			shellCapabilities: [] as string[],
			features: [] as string[],
		},
	};
	pool.listIdle.mockImplementation(() => [hostWorker]);
	pool.summarize.mockImplementation(() => [hostWorker.worker]);
	return new TrackedCommandHandler(
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
		{ workerTypes: CATALOG, boundStepWaitMs: 120_000, contactErrors }
	);
}

async function startRun(handler: TrackedCommandHandler) {
	const flowFile = path.join(tmpDir, 'bound.yml');
	fs.writeFileSync(flowFile, BOUND_FLOW_YAML);
	return handler.handleRun({ type: 'run', flowFile, cwd: tmpDir } as never);
}

const lastFailureReason = () => String(mockExecStore.markStepFailed.mock.calls.at(-1)?.[2] ?? '');

describe('CommandHandler - a bound step that no worker of its type served', () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it('names the last contact error of a source of that type, reported after the step started waiting', async () => {
		const errors = new SourceContactErrors();
		const handler = daemon(errors);
		await startRun(handler);
		vi.advanceTimersByTime(1_000);
		errors.failed('sbx-1', 'wrapper failed to start');

		vi.advanceTimersByTime(121_000);
		handler.tryDispatch();

		expect(lastFailureReason()).toContain(
			'Last contact error: reported by source "sbx-1": wrapper failed to start.'
		);
	});

	it('does not name an error from before the step started waiting', async () => {
		const errors = new SourceContactErrors();
		errors.failed('sbx-1', 'stale failure from an earlier run');
		vi.advanceTimersByTime(5_000);
		const handler = daemon(errors);
		await startRun(handler);

		vi.advanceTimersByTime(121_000);
		handler.tryDispatch();

		expect(lastFailureReason()).toContain('worker type "sandbox"');
		expect(lastFailureReason()).not.toContain('Last contact error');
	});

	it('does not name the error of a source of another type', async () => {
		const errors = new SourceContactErrors();
		const handler = daemon(errors);
		await startRun(handler);
		vi.advanceTimersByTime(1_000);
		errors.failed('gpu-1', 'gpu farm is down');

		vi.advanceTimersByTime(121_000);
		handler.tryDispatch();

		expect(lastFailureReason()).not.toContain('gpu farm');
	});

	it('does not name an error that a later successful ask cleared', async () => {
		const errors = new SourceContactErrors();
		const handler = daemon(errors);
		await startRun(handler);
		vi.advanceTimersByTime(1_000);
		errors.failed('sbx-1', 'wrapper failed to start');
		errors.succeeded('sbx-1');

		vi.advanceTimersByTime(121_000);
		handler.tryDispatch();

		expect(lastFailureReason()).not.toContain('Last contact error');
	});

	it('prints the error on one line, without user info or query values, and capped', async () => {
		const errors = new SourceContactErrors();
		const handler = daemon(errors);
		await startRun(handler);
		vi.advanceTimersByTime(1_000);
		errors.failed('sbx-1', `GET https://u:pw@creds.example.com/v1?token=abc\nline two ${'x'.repeat(500)}`);

		vi.advanceTimersByTime(121_000);
		handler.tryDispatch();

		const reason = lastFailureReason();
		expect(reason).toContain('GET https://creds.example.com/v1?… line two xxx');
		expect(reason).not.toMatch(/pw|abc|\n/);
		expect(reason.length).toBeLessThan(1_300);
	});
});
