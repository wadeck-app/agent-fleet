import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService, todayLogDate } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerLogRoutes } from './LogRoutes.js';

let fixture: FlowConfigFixture;
let routes: ReturnType<typeof collectRoutes>['routes'];

const entry = (message: string): string =>
	JSON.stringify({ ts: '2026-08-16T12:34:56.789Z', level: 'info', msg: message });

beforeEach(() => {
	fixture = new FlowConfigFixture();
	const collected = collectRoutes<ModuleContext>();
	routes = collected.routes;
	registerLogRoutes(collected.ctx, FlowQueryService.forConfigDir(fixture.configDir));
});

afterEach(() => fixture.dispose());

describe('GET /logs', () => {
	it('registers one route', () => {
		expect([...routes.keys()]).toEqual(['GET /logs']);
	});

	it('answers 200 with exists:false for a day without log, naming the date', async () => {
		const { status, body } = await callRoute(routes, 'GET /logs', { query: { date: '2026-01-01' } });
		expect(status).toBe(200);
		expect(body).toMatchObject({ date: '2026-01-01', exists: false, text: '' });
	});

	it('defaults to today', async () => {
		const { body } = await callRoute(routes, 'GET /logs', { query: {} });
		expect((body as { date: string }).date).toBe(todayLogDate());
	});

	it('returns the last `lines` entries, formatted for humans by default', async () => {
		fixture.addLog('2026-08-16', [entry('one'), entry('two'), entry('three')]);
		const { body } = await callRoute(routes, 'GET /logs', { query: { date: '2026-08-16', lines: '2' } });
		const log = body as { text: string; exists: boolean };
		expect(log.exists).toBe(true);
		expect(log.text).not.toContain('one');
		expect(log.text).toContain('two');
		expect(log.text).toContain('three');
		expect(log.text).not.toContain('{');
	});

	it('returns raw NDJSON with human=false', async () => {
		fixture.addLog('2026-08-16', [entry('one')]);
		const { body } = await callRoute(routes, 'GET /logs', { query: { date: '2026-08-16', human: 'false' } });
		expect((body as { text: string }).text).toContain('"msg":"one"');
	});

	it.each([
		[{ date: '16/08/2026' }, "Invalid log date '16/08/2026': expected YYYY-MM-DD."],
		[{ date: '../../etc/passwd' }, "Invalid log date '../../etc/passwd': expected YYYY-MM-DD."],
		[{ lines: '0' }, "'lines' must be an integer between 1 and 5000, got '0'."],
		[{ lines: 'all' }, "'lines' must be an integer between 1 and 5000, got 'all'."],
		[{ human: 'yes' }, "'human' must be 'true' or 'false', got 'yes'."],
	])('rejects %j with 400', async (query, message) => {
		expect(await callRoute(routes, 'GET /logs', { query })).toEqual({ status: 400, body: { error: message } });
	});
});
