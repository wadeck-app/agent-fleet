import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import type { FlowQueryService, WorkerListResult } from 'flow-core';
import { callRoute, collectRoutes } from 'flow-core/testing';
import { describe, expect, it } from 'vitest';

import { registerDaemonWidgetRoutes } from './DaemonWidgetRoutes.js';

function serviceAnswering(listing: () => Promise<WorkerListResult>): FlowQueryService {
	return { listWorkers: listing } as unknown as FlowQueryService;
}

function routesFor(service: FlowQueryService) {
	const { routes, ctx } = collectRoutes<ModuleContext>();
	registerDaemonWidgetRoutes(ctx, service);
	return routes;
}

describe('GET /widgets/daemon', () => {
	it('summarizes a stopped daemon, which is a normal answer and not an error', async () => {
		const routes = routesFor(
			serviceAnswering(async () => ({
				workers: [],
				daemon: { running: false, reason: 'Daemon is not running (no port file)' },
				declaredSources: [],
			}))
		);
		const { status, body } = await callRoute(routes, 'GET /widgets/daemon');
		expect(status).toBe(200);
		expect(body).toMatchObject({
			daemonLabel: 'Daemon stopped',
			daemonVariant: 'danger',
			workersLabel: 'No worker',
			hint: 'Daemon is not running: run "flow start" or a flow.',
		});
	});

	it('counts the connected workers', async () => {
		const routes = routesFor(
			serviceAnswering(async () => ({
				workers: [
					{
						workerId: 'w1',
						pid: 1,
						state: 'busy',
						labels: [],
						attachedProjects: [],
						hasUserInterface: false,
						ephemeral: false,
					},
				],
				daemon: { running: true, pid: 1, port: 2, startedAt: '2026-10-22T10:00:00.000Z' },
				declaredSources: [],
			}))
		);
		const { body } = await callRoute(routes, 'GET /widgets/daemon');
		expect(body).toMatchObject({ daemonLabel: 'Daemon running', workersLabel: '1 worker', hint: '1 busy, 0 idle' });
	});

	it('answers an error reply, with the cause, when the daemon cannot be asked', async () => {
		const routes = routesFor(
			serviceAnswering(async () => {
				throw new Error('daemon answered garbage');
			})
		);
		const { status, body } = await callRoute(routes, 'GET /widgets/daemon');
		expect(status).toBeGreaterThanOrEqual(500);
		expect(JSON.stringify(body)).toContain('daemon answered garbage');
	});
});
