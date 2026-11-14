import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import {
	FlowQueryService,
	UnknownWorkerError,
	WORKER_LOG_DEFAULT_LINES,
	WorkerListError,
	type WorkerListResult,
	type WorkerSummary,
	readWorkerLogs,
	workerLogFileName,
	workerLogsDirOf,
} from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerWorkerRoutes } from './WorkerRoutes.js';

let fixture: FlowConfigFixture;

beforeEach(() => {
	fixture = new FlowConfigFixture();
});

afterEach(() => fixture.dispose());

function routesFor(service: Partial<FlowQueryService>): ReturnType<typeof collectRoutes>['routes'] {
	const { routes, ctx } = collectRoutes<ModuleContext>();
	registerWorkerRoutes(ctx, service as FlowQueryService);
	return routes;
}

describe('GET /workers/count (the figure next to the Workers menu entry)', () => {
	it('answers 0 with no daemon running (a normal state, not an error)', async () => {
		const routes = routesFor(FlowQueryService.forConfigDir(fixture.configDir));
		expect(await callRoute(routes, 'GET /workers/count')).toEqual({ status: 200, body: { count: 0 } });
	});

	it('counts the connected workers and nothing else', async () => {
		const worker = (workerId: string) => ({
			workerId,
			pid: 42,
			state: 'idle' as const,
			labels: [],
			attachedProjects: [],
			hasUserInterface: false,
			ephemeral: true,
		});
		const routes = routesFor({
			listWorkers: vi.fn().mockResolvedValue({
				workers: [worker('w1'), worker('w2')],
				daemon: { running: true, pid: 1, port: 2, startedAt: 'x' },
				declaredSources: [],
			}),
		});
		expect(await callRoute(routes, 'GET /workers/count')).toEqual({ status: 200, body: { count: 2 } });
	});

	it('does not count declared sources: they are not connected workers', async () => {
		writeFileSync(
			join(fixture.configDir, 'worker-sources.json'),
			JSON.stringify({
				sources: [
					{
						sourceId: 'laptop',
						provider: 'built-in:relay',
						labels: [],
						maxWorkers: 2,
						tokenHash: 'h',
						sourceTokenHash: 'h',
						createdAt: '2026-01-01T00:00:00.000Z',
					},
				],
			})
		);
		const routes = routesFor(FlowQueryService.forConfigDir(fixture.configDir));
		expect((await callRoute(routes, 'GET /workers/count')).body).toEqual({ count: 0 });
	});

	it('answers 502 with the actionable message when the daemon answered but not with a worker list', async () => {
		const message = 'The running daemon predates this command: run flow stop && flow start.';
		const routes = routesFor({
			listWorkers: vi.fn().mockRejectedValue(new WorkerListError(message, 'daemon-outdated')),
		});
		expect(await callRoute(routes, 'GET /workers/count')).toEqual({ status: 502, body: { error: message } });
	});
});

describe('GET /workers', () => {
	it('with no daemon running answers 200 with the empty list and why it is empty (a normal state, not an error)', async () => {
		const routes = routesFor(FlowQueryService.forConfigDir(fixture.configDir));
		const { status, body } = await callRoute(routes, 'GET /workers');
		const result = body as WorkerListResult;
		expect(status).toBe(200);
		expect(result.workers).toEqual([]);
		expect(result.daemon.running).toBe(false);
		expect(result.emptyExplanation).toEqual(expect.any(String));
	});

	it('lists the declared sources without any credential hash', async () => {
		writeFileSync(
			join(fixture.configDir, 'worker-sources.json'),
			JSON.stringify({
				sources: [
					{
						sourceId: 'laptop',
						provider: 'built-in:relay',
						labels: ['gpu'],
						maxWorkers: 2,
						tokenHash: 'SECRET-TOKEN-HASH',
						sourceTokenHash: 'SECRET-SOURCE-HASH',
						createdAt: '2026-01-01T00:00:00.000Z',
					},
				],
			})
		);
		const routes = routesFor(FlowQueryService.forConfigDir(fixture.configDir));
		const { status, body } = await callRoute(routes, 'GET /workers');
		expect(status).toBe(200);
		expect((body as WorkerListResult).declaredSources).toEqual([
			{ sourceId: 'laptop', provider: 'built-in:relay', labels: ['gpu'], maxWorkers: 2 },
		]);
		expect(JSON.stringify(body)).not.toContain('SECRET');
	});

	it('reports a damaged source registry next to the (successful) listing instead of failing it', async () => {
		writeFileSync(join(fixture.configDir, 'worker-sources.json'), '{broken');
		const routes = routesFor(FlowQueryService.forConfigDir(fixture.configDir));
		const { status, body } = await callRoute(routes, 'GET /workers');
		expect(status).toBe(200);
		expect((body as WorkerListResult).declaredSourcesError).toEqual(expect.any(String));
	});

	it('passes live workers through', async () => {
		const result: WorkerListResult = {
			workers: [
				{
					workerId: 'w1',
					pid: 42,
					state: 'idle',
					labels: [],
					attachedProjects: [],
					hasUserInterface: false,
					ephemeral: true,
				},
			],
			daemon: { running: true, pid: 1, port: 2, startedAt: 'x' },
			declaredSources: [],
		};
		const routes = routesFor({ listWorkers: vi.fn().mockResolvedValue(result) });
		expect(await callRoute(routes, 'GET /workers')).toEqual({ status: 200, body: result });
	});

	it('answers 502 (upstream daemon failure) with the actionable message when the daemon answered but not with a worker list', async () => {
		const message = 'The running daemon predates this command: run flow stop && flow start.';
		const routes = routesFor({
			listWorkers: vi.fn().mockRejectedValue(new WorkerListError(message, 'daemon-outdated')),
		});
		expect(await callRoute(routes, 'GET /workers')).toEqual({ status: 502, body: { error: message } });
	});
});

describe('GET /workers/:workerId/logs', () => {
	const worker = (overrides: Partial<WorkerSummary> = {}): WorkerSummary => ({
		workerId: 'w1',
		pid: 4242,
		state: 'idle',
		labels: [],
		attachedProjects: [],
		hasUserInterface: false,
		ephemeral: true,
		...overrides,
	});

	function serviceFor(summary: WorkerSummary): FlowQueryService {
		const service = FlowQueryService.forConfigDir(fixture.configDir);
		// The daemon is not running in tests: the list of live workers is the one worker, the file is read for real.
		vi.spyOn(service, 'readWorkerLogs').mockImplementation((workerId, lines) =>
			workerId === summary.workerId
				? Promise.resolve({ worker: summary, logs: readWorkerLogs(fixture.configDir, summary, lines) })
				: Promise.reject(new UnknownWorkerError(workerId))
		);
		return service;
	}

	function writeWorkerLog(pid: number, content: string): void {
		mkdirSync(workerLogsDirOf(fixture.configDir), { recursive: true });
		writeFileSync(join(workerLogsDirOf(fixture.configDir), workerLogFileName(pid)), content);
	}

	type LogsBody = {
		found: boolean;
		available: boolean;
		reason?: string;
		lines: string[];
		text: string;
		hasLines: boolean;
		lacksLines: boolean;
		hasReason: boolean;
		truncated: boolean;
		summary: Record<string, unknown>[];
	};

	it('serves the worker and the tail of its captured output, ANSI stripped', async () => {
		writeWorkerLog(4242, 'one\n\u001b[31mtwo\u001b[0m\nthree\n');
		const routes = routesFor(serviceFor(worker({ version: '1.2.3', sourceId: 'fork' })));
		const { status, body } = await callRoute(routes, 'GET /workers/:workerId/logs', {
			params: { workerId: 'w1' },
			query: { lines: '2' },
		});
		const logs = body as LogsBody;
		expect(status).toBe(200);
		expect(logs).toMatchObject({
			found: true,
			available: true,
			lines: ['two', 'three'],
			text: 'two\nthree',
			hasLines: true,
			lacksLines: false,
			hasReason: false,
			truncated: true,
		});
		expect(logs.summary).toEqual([
			{
				workerId: 'w1',
				state: 'idle',
				pid: 4242,
				version: '1.2.3',
				sourceId: 'fork',
				origin: 'started by the daemon',
				hasUserInterface: false,
			},
		]);
	});

	it('sends every field the worker page reads (views.test.ts holds the list of what the page reads)', async () => {
		writeWorkerLog(4242, 'content');
		const routes = routesFor(serviceFor(worker()));
		const { body } = await callRoute(routes, 'GET /workers/:workerId/logs', { params: { workerId: 'w1' } });
		expect(Object.keys(body as object)).toEqual(
			expect.arrayContaining([
				'found',
				'workerId',
				'summary',
				'available',
				'hasReason',
				'hasLines',
				'lacksLines',
				'text',
			])
		);
		const { body: missing } = await callRoute(routes, 'GET /workers/:workerId/logs', {
			params: { workerId: 'no' },
		});
		expect(Object.keys(missing as object)).toEqual(
			expect.arrayContaining(['found', 'notFound', 'title', 'message', 'listLabel', 'listHref'])
		);
	});

	it('defaults to 200 lines', async () => {
		writeWorkerLog(4242, Array.from({ length: 250 }, (_, i) => `l${String(i)}\n`).join(''));
		const routes = routesFor(serviceFor(worker()));
		const { body } = await callRoute(routes, 'GET /workers/:workerId/logs', { params: { workerId: 'w1' } });
		expect((body as LogsBody).lines).toHaveLength(WORKER_LOG_DEFAULT_LINES);
		expect((body as LogsBody).lines.at(-1)).toBe('l249');
	});

	it('says available:false with a reason for an external worker', async () => {
		const routes = routesFor(serviceFor(worker({ ephemeral: false })));
		const { status, body } = await callRoute(routes, 'GET /workers/:workerId/logs', { params: { workerId: 'w1' } });
		expect(status).toBe(200);
		expect(body).toMatchObject({ found: true, available: false, hasReason: true, lines: [], lacksLines: true });
		expect((body as LogsBody).reason).toMatch(/not started by the daemon/);
		expect((body as LogsBody).summary[0]).toMatchObject({ origin: 'external' });
	});

	it('says available:false with a reason when the file of a forked worker is gone', async () => {
		const routes = routesFor(serviceFor(worker()));
		const { body } = await callRoute(routes, 'GET /workers/:workerId/logs', { params: { workerId: 'w1' } });
		expect(body).toMatchObject({ available: false, hasReason: true });
		expect((body as LogsBody).reason).toMatch(/No log file for this worker/);
	});

	it('answers the not-found notice (200) for a worker that is not connected', async () => {
		const routes = routesFor(serviceFor(worker()));
		const { status, body } = await callRoute(routes, 'GET /workers/:workerId/logs', {
			params: { workerId: 'gone' },
		});
		expect(status).toBe(200);
		expect(body).toMatchObject({
			found: false,
			notFound: true,
			title: 'Worker not found',
			listHref: '/modules/flow/workers',
		});
	});

	it.each(['0', '2001', 'abc', '1.5'])('refuses lines=%s with a 400 naming the limit', async lines => {
		const routes = routesFor(serviceFor(worker()));
		const { status, body } = await callRoute(routes, 'GET /workers/:workerId/logs', {
			params: { workerId: 'w1' },
			query: { lines },
		});
		expect(status).toBe(400);
		expect(JSON.stringify(body)).toMatch(/lines/);
	});

	it('answers 502 with the actionable message when the daemon answered but not with a worker list', async () => {
		const message = 'The running daemon predates this command: run flow stop && flow start.';
		const service = FlowQueryService.forConfigDir(fixture.configDir);
		vi.spyOn(service, 'readWorkerLogs').mockRejectedValue(new WorkerListError(message, 'daemon-outdated'));
		const routes = routesFor(service);
		expect(await callRoute(routes, 'GET /workers/:workerId/logs', { params: { workerId: 'w1' } })).toEqual({
			status: 502,
			body: { error: message },
		});
	});
});
