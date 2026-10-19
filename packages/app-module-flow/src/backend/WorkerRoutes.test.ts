import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService, WorkerListError, type WorkerListResult } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerWorkerRoutes } from './WorkerRoutes.js';

let fixture: FlowConfigFixture;

beforeEach(() => {
	fixture = new FlowConfigFixture();
});

afterEach(() => fixture.dispose());

function routesFor(service: Pick<FlowQueryService, 'listWorkers'>): ReturnType<typeof collectRoutes>['routes'] {
	const { routes, ctx } = collectRoutes<ModuleContext>();
	registerWorkerRoutes(ctx, service as FlowQueryService);
	return routes;
}

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
