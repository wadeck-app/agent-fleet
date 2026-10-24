import Fastify, { type FastifyInstance } from 'fastify';
import { BUILTIN_PLUGIN_CATALOG, FlowQueryService } from 'flow-core';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import errorHandlerHook from '../fastify/hooks/errorHandler.hook';
import { registerControllerWithCheck } from '../utils/lazy-controller-plugin';

let service: FlowQueryService;
vi.mock('../utils/factory-instance', () => ({
	getFactory: () => ({ getFlowQueryService: () => service }),
}));

/**
 * Whole HTTP path through the real lazy-controller plugin: routing (including `/executions` vs
 * `/executions/:id`), Zod query/param validation, response parsing and the error hook.
 */
describe('/api/flow-daemon over HTTP', () => {
	let configDir: string;
	let app: FastifyInstance;

	beforeEach(async () => {
		configDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flow-daemon-http-'));
		fs.mkdirSync(path.join(configDir, 'executions'));
		fs.writeFileSync(
			path.join(configDir, 'executions', 'abc123.json'),
			JSON.stringify({
				executionId: 'abc123',
				flowId: 'deploy',
				flowFile: '/flows/deploy.yml',
				status: 'failed',
				currentSteps: [],
				startedAt: '2026-08-16T12:00:00.000Z',
				completedAt: '2026-08-16T12:00:05.000Z',
				steps: { build: { status: 'failed', error: 'exit 1' } },
			})
		);
		service = FlowQueryService.forConfigDir(configDir, BUILTIN_PLUGIN_CATALOG);

		app = Fastify();
		await app.register(errorHandlerHook);
		await app.register(registerControllerWithCheck('/api/flow-daemon', () => import('./FlowDaemonController')));
		await app.ready();
	});

	afterEach(async () => {
		await app.close();
		fs.rmSync(configDir, { recursive: true, force: true });
	});

	it('serves the history list and the detail of the same run on distinct routes', async () => {
		const list = await app.inject({ method: 'GET', url: '/api/flow-daemon/executions?status=failed&flow=' });
		expect(list.statusCode).toBe(200);
		expect(list.json().items[0]).toMatchObject({ executionId: 'abc123', failedStepCount: 1 });

		const detail = await app.inject({ method: 'GET', url: '/api/flow-daemon/executions/abc' });
		expect(detail.statusCode).toBe(200);
		expect(detail.json().steps[0]).toMatchObject({ stepId: 'build', error: 'exit 1' });
	});

	it('serves the logs of one execution on its own route and validates its filters', async () => {
		const logs = await app.inject({ method: 'GET', url: '/api/flow-daemon/executions/abc/logs?step=&limit=10' });
		expect(logs.statusCode).toBe(200);
		expect(logs.json()).toMatchObject({ executionId: 'abc123', total: 0, limit: 10, offset: 0 });

		const invalid = await app.inject({ method: 'GET', url: '/api/flow-daemon/executions/abc/logs?limit=0' });
		expect(invalid.statusCode).toBe(400);
	});

	it('answers an unknown execution with a 404 carrying the actionable message', async () => {
		const response = await app.inject({ method: 'GET', url: '/api/flow-daemon/executions/zzz999' });
		expect(response.statusCode).toBe(404);
		expect(response.json().error).toContain('zzz999');
	});

	it('answers an invalid query with a 400 naming the field', async () => {
		const response = await app.inject({ method: 'GET', url: '/api/flow-daemon/executions?limit=9999' });
		expect(response.statusCode).toBe(400);
		expect(JSON.stringify(response.json())).toContain('limit');
	});

	it('serves workers, logs and plugins', async () => {
		for (const url of ['workers', 'logs?date=2026-01-01', 'plugins', 'flows']) {
			const response = await app.inject({ method: 'GET', url: `/api/flow-daemon/${url}` });
			expect(response.statusCode, url).toBe(200);
		}
	});
});
