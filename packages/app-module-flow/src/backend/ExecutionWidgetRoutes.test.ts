import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	MAX_WIDGET_TITLE_LENGTH,
	WIDGET_COMPACT_ROW_COUNT,
	WIDGET_ROW_COUNT,
	registerExecutionWidgetRoutes,
	widgetTitle,
} from './ExecutionWidgetRoutes.js';

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

	it('answers zeros and no row when nothing ran yet', async () => {
		expect(await callRoute(routes, 'GET /widgets/executions', { query: {} })).toEqual({
			status: 200,
			body: {
				total: 0,
				running: 0,
				failed: 0,
				lastRun: [],
				viewAllLabel: 'View all executions',
				items: [],
				compact: [],
			},
		});
	});

	it('lists the eight newest runs for the dense variant, as status word, flow name and ISO start time', async () => {
		for (let i = 0; i < 10; i++) {
			fixture.addExecution({
				executionId: `r${i}`,
				status: i === 9 ? 'failed' : 'completed',
				startedAt: `2026-10-19T11:${String(10 + i)}:00.000Z`,
			});
		}
		const { body } = await callRoute(routes, 'GET /widgets/executions', { query: {} });
		const { compact, items, lastRun } = body as {
			compact: Record<string, unknown>[];
			items: unknown[];
			lastRun: unknown[];
		};
		expect(compact).toHaveLength(WIDGET_COMPACT_ROW_COUNT);
		expect(items).toHaveLength(WIDGET_ROW_COUNT);
		expect(compact[0]).toEqual({
			executionId: 'r9',
			flowId: 'deploy',
			statusLabel: 'FAILED',
			startedAt: '2026-10-19T11:19:00.000Z',
		});
		expect(lastRun).toEqual([{ startedAt: '2026-10-19T11:19:00.000Z' }]);
	});

	it('counts all, running and failed runs and lists the five newest with a status mark and an ISO start time', async () => {
		for (let i = 0; i < 4; i++) {
			fixture.addExecution({ executionId: `ok${i}`, startedAt: `2026-10-19T11:0${i}:00.000Z` });
		}
		fixture.addExecution({
			executionId: 'bad',
			flowId: 'factory_retrospective',
			status: 'failed',
			startedAt: '2026-10-19T11:55:00.000Z',
		});
		fixture.addExecution({
			executionId: 'run',
			status: 'running',
			completedAt: null,
			startedAt: '2026-10-19T11:58:00.000Z',
		});
		fixture.addExecution({ executionId: 'oldest', startedAt: '2026-10-01T11:00:00.000Z' });

		const { status, body } = await callRoute(routes, 'GET /widgets/executions', { query: {} });
		expect(status).toBe(200);
		expect(body).toEqual({
			total: 7,
			viewAllLabel: 'View all 7 executions',
			running: 1,
			failed: 1,
			lastRun: [{ startedAt: '2026-10-19T11:58:00.000Z' }],
			items: [
				{
					executionId: 'run',
					flowId: 'deploy',
					status: 'running',
					title: 'running deploy',
					startedAt: '2026-10-19T11:58:00.000Z',
				},
				{
					executionId: 'bad',
					flowId: 'factory_retrospective',
					status: 'failed',
					title: 'FAILED factor...',
					startedAt: '2026-10-19T11:55:00.000Z',
				},
				{
					executionId: 'ok3',
					flowId: 'deploy',
					status: 'completed',
					title: 'ok deploy',
					startedAt: '2026-10-19T11:03:00.000Z',
				},
				{
					executionId: 'ok2',
					flowId: 'deploy',
					status: 'completed',
					title: 'ok deploy',
					startedAt: '2026-10-19T11:02:00.000Z',
				},
				{
					executionId: 'ok1',
					flowId: 'deploy',
					status: 'completed',
					title: 'ok deploy',
					startedAt: '2026-10-19T11:01:00.000Z',
				},
			],
			compact: [
				{ executionId: 'run', flowId: 'deploy', statusLabel: 'running', startedAt: '2026-10-19T11:58:00.000Z' },
				{
					executionId: 'bad',
					flowId: 'factory_retrospective',
					statusLabel: 'FAILED',
					startedAt: '2026-10-19T11:55:00.000Z',
				},
				{ executionId: 'ok3', flowId: 'deploy', statusLabel: 'ok', startedAt: '2026-10-19T11:03:00.000Z' },
				{ executionId: 'ok2', flowId: 'deploy', statusLabel: 'ok', startedAt: '2026-10-19T11:02:00.000Z' },
				{ executionId: 'ok1', flowId: 'deploy', statusLabel: 'ok', startedAt: '2026-10-19T11:01:00.000Z' },
				{ executionId: 'ok0', flowId: 'deploy', statusLabel: 'ok', startedAt: '2026-10-19T11:00:00.000Z' },
				{ executionId: 'oldest', flowId: 'deploy', statusLabel: 'ok', startedAt: '2026-10-01T11:00:00.000Z' },
			],
		});
	});

	it('reports a corrupt timestamp as an error reply, not a 200 with a hole', async () => {
		fixture.addExecution({ executionId: 'weird', startedAt: 'not-a-date' });
		const { status } = await callRoute(routes, 'GET /widgets/executions', { query: {} });
		expect(status).toBeGreaterThanOrEqual(500);
	});
});

describe('widgetTitle', () => {
	it('puts the tag and the flow name in one string, whole when it fits', () => {
		expect(widgetTitle('completed', 'build_task')).toBe('ok build_task');
	});

	it('cuts the flow name so the title leaves room for the date column of a narrow card', () => {
		const title = widgetTitle('failed', 'a_really_long_flow_name_that_will_not_fit');
		expect(title).toBe('FAILED a_real...');
		expect(title.length).toBeLessThanOrEqual(MAX_WIDGET_TITLE_LENGTH);
		expect(widgetTitle('completed', 'x'.repeat(50))).toHaveLength(MAX_WIDGET_TITLE_LENGTH);
	});
});
