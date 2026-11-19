import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerHealthRoutes } from './HealthRoutes.js';

let fixture: FlowConfigFixture;

beforeEach(() => {
	fixture = new FlowConfigFixture();
});

afterEach(() => {
	vi.useRealTimers();
	fixture.dispose();
});

function routesFor(service: FlowQueryService, timeoutMs?: number): ReturnType<typeof collectRoutes>['routes'] {
	const { routes, ctx } = collectRoutes<ModuleContext>();
	registerHealthRoutes(ctx, service, timeoutMs);
	return routes;
}

function checkOf(body: unknown, name: string): { name: string; ok: boolean; detail?: string } {
	const found = (body as { checks: { name: string; ok: boolean; detail?: string }[] }).checks.find(
		c => c.name === name
	);
	if (found === undefined) {
		throw new Error(`no check named ${name}`);
	}
	return found;
}

describe('GET /health', () => {
	it('registers only the health route', () => {
		expect([...routesFor(FlowQueryService.forConfigDir(fixture.configDir)).keys()]).toEqual(['GET /health']);
	});

	it('is ok on a fresh config dir: no log yet and no daemon running are normal', async () => {
		const routes = routesFor(FlowQueryService.forConfigDir(fixture.configDir));
		const { status, body } = await callRoute(routes, 'GET /health');
		expect(status).toBe(200);
		expect((body as { ok: boolean }).ok).toBe(true);
		expect(checkOf(body, 'config-dir')).toEqual({ name: 'config-dir', ok: true });
		expect(checkOf(body, 'executions-store')).toEqual({ name: 'executions-store', ok: true });
		expect(checkOf(body, 'logs-dir')).toEqual({ name: 'logs-dir', ok: true, detail: 'no log yet' });
		expect(checkOf(body, 'daemon')).toEqual({
			name: 'daemon',
			ok: true,
			detail: 'daemon not running (it stops itself when idle)',
		});
	});

	it('is ok with an existing logs directory, without detail', async () => {
		mkdirSync(join(fixture.configDir, 'logs'), { recursive: true });
		const { body } = await callRoute(routesFor(FlowQueryService.forConfigDir(fixture.configDir)), 'GET /health');
		expect(checkOf(body, 'logs-dir')).toEqual({ name: 'logs-dir', ok: true });
	});

	it('fails the logs check, and only it, when the logs path is a file, naming the path and the error', async () => {
		writeFileSync(join(fixture.configDir, 'logs'), 'SECRET-CONTENT');
		const { status, body } = await callRoute(
			routesFor(FlowQueryService.forConfigDir(fixture.configDir)),
			'GET /health'
		);
		expect(status).toBe(200);
		expect((body as { ok: boolean }).ok).toBe(false);
		const logs = checkOf(body, 'logs-dir');
		expect(logs.ok).toBe(false);
		expect(logs.detail).toContain(join(fixture.configDir, 'logs'));
		expect(logs.detail).not.toContain('SECRET-CONTENT');
		expect(checkOf(body, 'config-dir').ok).toBe(true);
		expect(checkOf(body, 'daemon').ok).toBe(true);
	});

	it('fails the config dir check when the directory disappeared after startup', async () => {
		const service = FlowQueryService.forConfigDir(fixture.configDir);
		rmSync(fixture.configDir, { recursive: true, force: true });
		const { body } = await callRoute(routesFor(service), 'GET /health');
		const check = checkOf(body, 'config-dir');
		expect(check.ok).toBe(false);
		expect(check.detail).toContain(fixture.configDir);
		expect((body as { ok: boolean }).ok).toBe(false);
	});

	it('fails the executions check with the error text when the store cannot be read', async () => {
		const service = {
			directories: { configDir: fixture.configDir, executionsDir: '/x/executions' },
		} as FlowQueryService;
		Object.assign(service, {
			listExecutions: vi.fn(() => {
				throw new Error('EACCES: permission denied');
			}),
			listWorkers: vi.fn().mockResolvedValue({ daemon: { running: false } }),
		});
		const { body } = await callRoute(routesFor(service), 'GET /health');
		const check = checkOf(body, 'executions-store');
		expect(check.ok).toBe(false);
		expect(check.detail).toContain('/x/executions');
		expect(check.detail).toContain('EACCES: permission denied');
		expect((body as { ok: boolean }).ok).toBe(false);
	});

	it('is ok with a running daemon that answers', async () => {
		const service = FlowQueryService.forConfigDir(fixture.configDir);
		vi.spyOn(service, 'listWorkers').mockResolvedValue({
			workers: [],
			daemon: { running: true, pid: 1, port: 2, startedAt: 'x' },
			declaredSources: [],
		});
		const { body } = await callRoute(routesFor(service), 'GET /health');
		expect(checkOf(body, 'daemon')).toEqual({ name: 'daemon', ok: true });
	});

	it('fails the daemon check when a running daemon answers with an error', async () => {
		const service = FlowQueryService.forConfigDir(fixture.configDir);
		vi.spyOn(service, 'listWorkers').mockRejectedValue(new Error('daemon predates the workers command'));
		const { body } = await callRoute(routesFor(service), 'GET /health');
		const check = checkOf(body, 'daemon');
		expect(check.ok).toBe(false);
		expect(check.detail).toContain('daemon predates the workers command');
		expect((body as { ok: boolean }).ok).toBe(false);
	});

	it('fails the daemon check, and still answers, when the daemon does not answer within the timeout', async () => {
		vi.useFakeTimers();
		const service = FlowQueryService.forConfigDir(fixture.configDir);
		vi.spyOn(service, 'listWorkers').mockReturnValue(new Promise(() => undefined));
		const pending = callRoute(routesFor(service, 2000), 'GET /health');
		await vi.advanceTimersByTimeAsync(2000);
		const { status, body } = await pending;
		expect(status).toBe(200);
		const check = checkOf(body, 'daemon');
		expect(check.ok).toBe(false);
		expect(check.detail).toContain('2000 ms');
		expect(checkOf(body, 'config-dir').ok).toBe(true);
		expect((body as { ok: boolean }).ok).toBe(false);
	});
});
