import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowConfigFixture } from '../testing/FlowConfigFixture.js';
import * as WorkerListModule from '../worker/WorkerList.js';
import { workerLogsDirOf } from '../worker/WorkerLogs.js';
import type { WorkerSummary } from '../worker/WorkerSummary.js';
import { FlowQueryService } from './FlowQueryService.js';

let fixture: FlowConfigFixture;

beforeEach(() => {
	fixture = new FlowConfigFixture();
});

afterEach(() => {
	vi.restoreAllMocks();
	fixture.dispose();
});

function writeLog(name: string, content: string): void {
	const dir = workerLogsDirOf(fixture.configDir);
	mkdirSync(dir, { recursive: true });
	writeFileSync(join(dir, name), content);
}

function worker(overrides: Partial<WorkerSummary>): WorkerSummary {
	return {
		workerId: 'w-live',
		pid: 4242,
		state: 'idle',
		labels: [],
		attachedProjects: [],
		hasUserInterface: false,
		ephemeral: false,
		...overrides,
	};
}

function liveWorkers(workers: WorkerSummary[]): void {
	vi.spyOn(WorkerListModule, 'readWorkerList').mockResolvedValue({
		workers,
		daemon: { running: true, pid: 1, port: 2, startedAt: 'x' },
	});
}

describe('FlowQueryService.readWorkerLogs', () => {
	it('reads the file of an exited worker by its key when no daemon runs', async () => {
		writeLog('worker-13088.log', 'one\ntwo\n');
		const service = FlowQueryService.forConfigDir(fixture.configDir);

		const target = await service.readWorkerLogs('13088', 10);

		expect(target.worker).toBeUndefined();
		expect(target).toMatchObject({ key: '13088', origin: 'started by the daemon' });
		expect(target.logs.lines).toEqual(['one', 'two']);
	});

	it('answers a live external worker from its worker id file', async () => {
		writeLog('worker-w-live.log', 'dmn connected\n');
		liveWorkers([worker({})]);
		const service = FlowQueryService.forConfigDir(fixture.configDir);

		const target = await service.readWorkerLogs('w-live', 10);

		expect(target.worker?.workerId).toBe('w-live');
		expect(target).toMatchObject({ key: 'w-live', origin: 'external' });
		expect(target.logs.lines).toEqual(['dmn connected']);
	});

	it('answers a live forked worker from its pid file', async () => {
		writeLog('worker-4242.log', 'out line\n');
		liveWorkers([worker({ ephemeral: true })]);
		const service = FlowQueryService.forConfigDir(fixture.configDir);

		const target = await service.readWorkerLogs('w-live', 10);

		expect(target).toMatchObject({ key: '4242', origin: 'started by the daemon' });
		expect(target.logs.lines).toEqual(['out line']);
	});

	it('throws UnknownWorkerError for an id that is neither live nor the key of a file, including a path-like one', async () => {
		const service = FlowQueryService.forConfigDir(fixture.configDir);
		await expect(service.readWorkerLogs('999', 10)).rejects.toMatchObject({ kind: 'unknown-worker' });
		await expect(service.readWorkerLogs('../../x', 10)).rejects.toMatchObject({ kind: 'unknown-worker' });
	});

	it('serves the file of an exited worker even when the daemon fails, and rethrows the daemon failure when no file answers', async () => {
		vi.spyOn(WorkerListModule, 'readWorkerList').mockRejectedValue(
			new WorkerListModule.WorkerListError('daemon is outdated', 'daemon-outdated')
		);
		writeLog('worker-77.log', 'kept\n');
		const service = FlowQueryService.forConfigDir(fixture.configDir);

		expect((await service.readWorkerLogs('77', 10)).logs.lines).toEqual(['kept']);
		await expect(service.readWorkerLogs('78', 10)).rejects.toThrow('daemon is outdated');
	});
});

describe('FlowQueryService.listRecentWorkers', () => {
	it('lists the files with no daemon running, and leaves out the live workers', async () => {
		writeLog('worker-1.log', 'a\n');
		writeLog('worker-w-live.log', 'b\n');
		writeLog('worker-w-gone.log', 'c\n');
		liveWorkers([worker({})]);
		const service = FlowQueryService.forConfigDir(fixture.configDir);

		const recent = await service.listRecentWorkers();

		expect(recent.map(entry => entry.key).sort()).toEqual(['1', 'w-gone']);
	});

	it('still lists the files when the daemon fails (live workers cannot be left out then)', async () => {
		vi.spyOn(WorkerListModule, 'readWorkerList').mockRejectedValue(
			new WorkerListModule.WorkerListError('boom', 'daemon-error')
		);
		writeLog('worker-1.log', 'a\n');
		const service = FlowQueryService.forConfigDir(fixture.configDir);

		expect((await service.listRecentWorkers()).map(entry => entry.key)).toEqual(['1']);
	});
});
