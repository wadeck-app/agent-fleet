import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	MAX_WIDGET_TITLE_LENGTH,
	formatRelativeTime,
	registerExecutionWidgetRoutes,
	widgetTitle,
} from './ExecutionWidgetRoutes.js';

const NOW = new Date('2026-10-19T12:00:00.000Z');

describe('formatRelativeTime', () => {
	it.each([
		['2026-10-19T11:59:45.000Z', 'now'],
		['2026-10-19T12:00:30.000Z', 'now'],
		['2026-10-19T11:55:00.000Z', '5m'],
		['2026-10-19T09:00:00.000Z', '3h'],
		['2026-10-17T12:00:00.000Z', '2d'],
	])('%s -> %s', (iso, expected) => {
		expect(formatRelativeTime(iso, NOW)).toBe(expected);
	});

	it('falls back to a short calendar date after 30 days', () => {
		expect(formatRelativeTime('2026-08-01T12:00:00.000Z', NOW)).toBe('2026-08-01');
	});

	it('fails loudly on an unparseable timestamp', () => {
		expect(() => formatRelativeTime('yesterday', NOW)).toThrow(/yesterday/);
	});
});

describe('GET /widgets/executions', () => {
	let fixture: FlowConfigFixture;
	let routes: ReturnType<typeof collectRoutes>['routes'];

	beforeEach(() => {
		fixture = new FlowConfigFixture();
		const collected = collectRoutes<ModuleContext>();
		routes = collected.routes;
		registerExecutionWidgetRoutes(collected.ctx, FlowQueryService.forConfigDir(fixture.configDir), () => NOW);
	});

	afterEach(() => fixture.dispose());

	it('answers zeros and no row when nothing ran yet', async () => {
		expect(await callRoute(routes, 'GET /widgets/executions', { query: {} })).toEqual({
			status: 200,
			body: { total: 0, running: 0, failed: 0, viewAllLabel: 'View all executions', items: [] },
		});
	});

	it('counts all, running and failed runs and lists the five newest with a status mark and a relative time', async () => {
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
			items: [
				{ executionId: 'run', flowId: 'deploy', status: 'running', title: 'running deploy 2m', when: '2m' },
				{
					executionId: 'bad',
					flowId: 'factory_retrospective',
					status: 'failed',
					title: 'FAILED factory... 5m',
					when: '5m',
				},
				{ executionId: 'ok3', flowId: 'deploy', status: 'completed', title: 'ok deploy 57m', when: '57m' },
				{ executionId: 'ok2', flowId: 'deploy', status: 'completed', title: 'ok deploy 58m', when: '58m' },
				{ executionId: 'ok1', flowId: 'deploy', status: 'completed', title: 'ok deploy 59m', when: '59m' },
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
	it('puts the tag, the flow name and the age in one string, whole when it fits', () => {
		expect(widgetTitle('completed', 'build_task', '1d')).toBe('ok build_task 1d');
	});

	it('cuts the flow name, never the age, so the whole title stays within the width of a narrow card', () => {
		const title = widgetTitle('failed', 'a_really_long_flow_name_that_will_not_fit', '12m');
		expect(title).toBe('FAILED a_real... 12m');
		expect(title.length).toBeLessThanOrEqual(MAX_WIDGET_TITLE_LENGTH);
		expect(widgetTitle('completed', 'x'.repeat(50), '2026-08-01')).toHaveLength(MAX_WIDGET_TITLE_LENGTH);
	});
});
