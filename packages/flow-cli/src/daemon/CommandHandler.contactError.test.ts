import * as fs from 'node:fs';
import * as path from 'node:path';

import { PluginLoader } from '../config/PluginLoader';
import {
	TrackedCommandHandler,
	createMockWorkerPool,
	daemonDir,
	mockExecStore,
	mockLogWriter,
	registerCommandHandlerHooks,
	tmpDir,
} from './CommandHandlerTestHarness';
import { DaemonSourceContact } from './DaemonSourceContact';
import { LaunchTokenIssuer } from './LaunchTokenIssuer';
import { SourceContactErrors } from './SourceContactErrors';
import type { WorkerSourceEntry } from './WorkerSourceRegistry';
import { WorkerTypeCatalog } from './WorkerTypeCatalog';
import { WorkerTypeInstances } from './WorkerTypeInstances';

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

const CATALOG = new WorkerTypeCatalog(
	{
		list: () => [source('sbx-1', 'sandbox.docker'), source('gpu-1', 'gpu.farm')],
	},
	{ isExclusive: () => false }
);

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

	it('names the failed contact with a source of that type, after the step started waiting, and where the error is', async () => {
		const errors = new SourceContactErrors('C:/logs');
		const handler = daemon(errors);
		await startRun(handler);
		vi.advanceTimersByTime(1_000);
		errors.failed('sbx-1');
		errors.failed('sbx-1');

		vi.advanceTimersByTime(121_000);
		handler.tryDispatch();

		expect(lastFailureReason()).toMatch(
			/ Last contact with source "sbx-1" failed at \d{4}-\d\d-\d\dT[\d:]+Z \(2 consecutive failures since [\d:]+Z\); the error is in the daemon log \(flow logs, or C:\/logs\)\.$/
		);
	});

	it('does not name a failure from before the step started waiting', async () => {
		const errors = new SourceContactErrors();
		errors.failed('sbx-1');
		vi.advanceTimersByTime(5_000);
		const handler = daemon(errors);
		await startRun(handler);

		vi.advanceTimersByTime(121_000);
		handler.tryDispatch();

		expect(lastFailureReason()).toContain('worker type "sandbox"');
		expect(lastFailureReason()).not.toContain('Last contact');
	});

	it('does not name the failure of a source of another type', async () => {
		const errors = new SourceContactErrors();
		const handler = daemon(errors);
		await startRun(handler);
		vi.advanceTimersByTime(1_000);
		errors.failed('gpu-1');

		vi.advanceTimersByTime(121_000);
		handler.tryDispatch();

		expect(lastFailureReason()).not.toContain('gpu-1');
	});

	it('does not name a failure that a later successful ask cleared', async () => {
		const errors = new SourceContactErrors();
		const handler = daemon(errors);
		await startRun(handler);
		vi.advanceTimersByTime(1_000);
		errors.failed('sbx-1');
		errors.succeeded('sbx-1');

		vi.advanceTimersByTime(121_000);
		handler.tryDispatch();

		expect(lastFailureReason()).not.toContain('Last contact');
	});

	// The wiring the daemon builds: DaemonSourceContact records the failure of the real ask, its store is the one the
	// routing hands to the dispatcher, and the log location comes from the logs directory it was given.
	it('names the failure DaemonSourceContact recorded for a real ask that failed', async () => {
		const sources = [
			{
				sourceId: 'sbx-1',
				provider: 'built-in:command',
				options: {},
				labels: [],
				maxWorkers: 1,
				tokenHash: 'h',
				createdAt: '2026-11-06T00:00:00.000Z',
			},
		];
		const sourceContact = new DaemonSourceContact(
			'C:/daemon-logs',
			{ list: () => sources, pruneDead: () => [] as string[] } as never,
			{ find: () => undefined } as never,
			new LaunchTokenIssuer(),
			new WorkerTypeInstances(new PluginLoader(), () => {})
		);
		const handler = daemon(sourceContact.contactErrors);
		await startRun(handler);

		sourceContact.contactSources(4101);
		await vi.advanceTimersByTimeAsync(1_000);
		await vi.advanceTimersByTimeAsync(121_000);
		handler.tryDispatch();

		expect(lastFailureReason()).toContain('the error is in the daemon log (flow logs, or C:/daemon-logs).');
		expect(lastFailureReason()).not.toContain('declares no command');
	});
});
