import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerExecutionWidgetRoutes } from './ExecutionWidgetRoutes.js';

describe('GET /widgets/executions', () => {
	let fixture: FlowConfigFixture;
	let routes: ReturnType<typeof collectRoutes>['routes'];

	beforeEach(() => {
		fixture = new FlowConfigFixture();
		const collected = collectRoutes<ModuleContext>();
		routes = collected.routes;
		registerExecutionWidgetRoutes(collected.ctx, FlowQueryService.forConfigDir(fixture.configDir));
	});

	afterEach(() => fixture.dispose());

	it('answers zeros and empty lists when nothing ran yet', async () => {
		const { status, body } = await callRoute(routes, 'GET /widgets/executions', { query: {} });
		expect(status).toBe(200);
		expect(body).toMatchObject({
			total: 0,
			running: 0,
			failed: 0,
			latest: [],
			recentRuns: [],
			recentRunsTruncated: false,
		});
	});

	it('serves exactly the fields the widget view reads', async () => {
		const { body } = await callRoute(routes, 'GET /widgets/executions', { query: {} });
		expect(Object.keys(body as object).sort()).toEqual([
			'failed',
			'latest',
			'recentRuns',
			'recentRunsTruncated',
			'running',
			'total',
		]);
	});

	it('serves the runs of the config directory: counters and the latest runs with the full flow name', async () => {
		fixture.addExecution({ executionId: 'ok1', startedAt: '2026-10-19T11:01:00.000Z' });
		fixture.addExecution({
			executionId: 'bad',
			flowId: 'factory_retrospective_long_running_pipeline',
			status: 'failed',
			lastError: 'exit 2\nstack',
			startedAt: '2026-10-19T11:55:00.000Z',
		});
		fixture.addExecution({
			executionId: 'run',
			status: 'running',
			completedAt: null,
			startedAt: '2026-10-19T11:58:00.000Z',
		});

		const { status, body } = await callRoute(routes, 'GET /widgets/executions', { query: {} });
		expect(status).toBe(200);
		expect(body).toMatchObject({
			total: 3,
			running: 1,
			failed: 1,
			latest: [
				{ executionId: 'run', statusLabel: 'running' },
				{ executionId: 'bad', statusLabel: 'FAILED', flowId: 'factory_retrospective_long_running_pipeline' },
				{ executionId: 'ok1', statusLabel: 'ok' },
			],
		});
	});

	it('reports a corrupt timestamp as an error reply, not a 200 with a hole', async () => {
		fixture.addExecution({ executionId: 'weird', startedAt: 'not-a-date' });
		const { status } = await callRoute(routes, 'GET /widgets/executions', { query: {} });
		expect(status).toBeGreaterThanOrEqual(500);
	});
});
