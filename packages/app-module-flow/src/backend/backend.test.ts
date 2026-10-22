import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService, WorkerListError } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import backend from './index.js';

const configDirectory = vi.hoisted(() => ({ get: vi.fn<(appName: string) => string>() }));
vi.mock('@wadeck-app/shared-cli/ConfigDir', () => ({ ConfigDir: configDirectory }));

type QueryMethod =
	| 'listExecutions'
	| 'getExecution'
	| 'readExecutionLogs'
	| 'readLogs'
	| 'listWorkers'
	| 'listPlugins'
	| 'describePlugin';

let fixture: FlowConfigFixture;

beforeEach(() => {
	fixture = new FlowConfigFixture();
	configDirectory.get.mockReset();
	configDirectory.get.mockReturnValue(fixture.configDir);
});

afterEach(() => fixture.dispose());

describe('backend entry', () => {
	it('registers one route per flow-core query, all read-only', () => {
		const { routes, ctx } = collectRoutes<ModuleContext>();
		backend(ctx);
		expect([...routes.keys()].sort()).toEqual([
			'GET /executions',
			'GET /executions/:id',
			'GET /executions/:id/logs',
			'GET /flows',
			'GET /logs',
			'GET /plugins',
			'GET /plugins/:id',
			'GET /widgets/daemon',
			'GET /widgets/executions',
			'GET /workers',
		]);
	});

	it('resolves the flow config directory once, at load, not per request', async () => {
		const { routes, ctx } = collectRoutes<ModuleContext>();
		backend(ctx);
		await callRoute(routes, 'GET /executions', { query: {} });
		await callRoute(routes, 'GET /logs', { query: {} });
		await callRoute(routes, 'GET /workers');
		expect(configDirectory.get).toHaveBeenCalledTimes(1);
		expect(configDirectory.get).toHaveBeenCalledWith('flow');
	});

	it('serves the executions found in that directory', async () => {
		fixture.addExecution({ executionId: 'abc123' });
		const { routes, ctx } = collectRoutes<ModuleContext>();
		backend(ctx);
		const { status, body } = await callRoute(routes, 'GET /executions', { query: {} });
		expect(status).toBe(200);
		expect((body as { total: number }).total).toBe(1);
	});

	it('serves the plugin catalog of the built-in plugins', async () => {
		const { routes, ctx } = collectRoutes<ModuleContext>();
		backend(ctx);
		const { status, body } = await callRoute(routes, 'GET /plugins');
		expect(status).toBe(200);
		expect((body as { plugins: unknown[] }).plugins.length).toBeGreaterThanOrEqual(4);
	});

	// One unexpected failure per query the routes delegate to: none may leak a stack trace, hang, or answer 200.
	it.each<[string, QueryMethod, string, Record<string, unknown>]>([
		['GET /executions', 'listExecutions', 'disk on fire', {}],
		['GET /executions/:id', 'getExecution', 'disk on fire', { params: { id: 'abc' } }],
		['GET /executions/:id/logs', 'readExecutionLogs', 'disk on fire', { params: { id: 'abc' } }],
		['GET /logs', 'readLogs', 'disk on fire', {}],
		['GET /workers', 'listWorkers', 'disk on fire', {}],
		['GET /plugins', 'listPlugins', 'disk on fire', {}],
		['GET /plugins/:id', 'describePlugin', 'disk on fire', { params: { id: 'none' } }],
	])('%s answers 500 and labels the failure unexpected when %s throws', async (route, method, message, request) => {
		const { routes, ctx } = collectRoutes<ModuleContext>();
		backend(ctx);
		vi.spyOn(FlowQueryService.prototype, method).mockImplementation(() => {
			throw new Error(message);
		});
		const { status, body } = await callRoute(routes, route, request);
		expect(status).toBe(500);
		expect(body).toEqual({ error: `Unexpected error while serving the request: ${message}` });
	});

	it('GET /workers answers 502 when the daemon answers with something that is not a worker list', async () => {
		const { routes, ctx } = collectRoutes<ModuleContext>();
		backend(ctx);
		vi.spyOn(FlowQueryService.prototype, 'listWorkers').mockRejectedValue(
			new WorkerListError('The running daemon predates this command.', 'daemon-outdated')
		);
		expect((await callRoute(routes, 'GET /workers')).status).toBe(502);
	});

	it('answers a request that carries no query object at all (the routes treat it as no filter)', async () => {
		const { routes, ctx } = collectRoutes<ModuleContext>();
		backend(ctx);
		expect((await callRoute(routes, 'GET /executions')).status).toBe(200);
		expect((await callRoute(routes, 'GET /logs')).status).toBe(200);
	});
});
