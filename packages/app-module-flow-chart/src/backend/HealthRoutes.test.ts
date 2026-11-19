import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { registerHealthRoutes } from './HealthRoutes.js';

// @formatter:off
const FLOW_YAML = `id: build_task
name: Build a task
steps:
  - id: plan
    type: model
    prompt: plan it
  - id: ship
    type: script
    depends: [plan]
    script: npm publish
`;
// @formatter:on

let fixture: FlowConfigFixture;
let flowFile: string;

beforeEach(() => {
	fixture = new FlowConfigFixture();
	flowFile = join(fixture.configDir, 'build_task.yml');
});

afterEach(() => {
	vi.restoreAllMocks();
	fixture.dispose();
});

function routesFor(service: FlowQueryService): ReturnType<typeof collectRoutes>['routes'] {
	const { routes, ctx } = collectRoutes<ModuleContext>();
	registerHealthRoutes(ctx, service);
	return routes;
}

describe('GET /health', () => {
	it('registers only the health route', () => {
		expect([...routesFor(FlowQueryService.forConfigDir(fixture.configDir)).keys()]).toEqual(['GET /health']);
	});

	it('is ok with no flow known, and says so on both checks', async () => {
		const { status, body } = await callRoute(
			routesFor(FlowQueryService.forConfigDir(fixture.configDir)),
			'GET /health'
		);
		expect(status).toBe(200);
		expect(body).toEqual({
			ok: true,
			checks: [
				{ name: 'flow-definitions', ok: true, detail: 'no flow known' },
				{ name: 'flow-graph', ok: true, detail: 'no flow known' },
			],
		});
	});

	it('is ok when the graph of the first known flow builds', async () => {
		writeFileSync(flowFile, FLOW_YAML);
		fixture.addExecution({ executionId: 'e1', flowId: 'build_task', flowFile });
		const { body } = await callRoute(routesFor(FlowQueryService.forConfigDir(fixture.configDir)), 'GET /health');
		expect(body).toEqual({
			ok: true,
			checks: [
				{ name: 'flow-definitions', ok: true },
				{ name: 'flow-graph', ok: true },
			],
		});
	});

	it('fails the graph check, naming the flow and the error, when its definition is gone', async () => {
		fixture.addExecution({ executionId: 'e1', flowId: 'build_task', flowFile });
		const { status, body } = await callRoute(
			routesFor(FlowQueryService.forConfigDir(fixture.configDir)),
			'GET /health'
		);
		expect(status).toBe(200);
		const typed = body as { ok: boolean; checks: { name: string; ok: boolean; detail?: string }[] };
		expect(typed.ok).toBe(false);
		expect(typed.checks[0]).toEqual({ name: 'flow-definitions', ok: true });
		expect(typed.checks[1]!.name).toBe('flow-graph');
		expect(typed.checks[1]!.ok).toBe(false);
		expect(typed.checks[1]!.detail).toContain('build_task');
		expect(typed.checks[1]!.detail!.length).toBeGreaterThan('The graph of flow build_task does not build: '.length);
	});

	it('fails the definitions check with the path and the error, and does not claim a graph was built', async () => {
		const service = FlowQueryService.forConfigDir(fixture.configDir);
		vi.spyOn(service, 'listFlows').mockImplementation(() => {
			throw new Error('EACCES: permission denied');
		});
		const graph = vi.spyOn(service, 'getFlowGraph');
		const { body } = await callRoute(routesFor(service), 'GET /health');
		const typed = body as { ok: boolean; checks: { name: string; ok: boolean; detail?: string }[] };
		expect(typed.ok).toBe(false);
		expect(typed.checks[0]!.ok).toBe(false);
		expect(typed.checks[0]!.detail).toContain(service.directories.executionsDir);
		expect(typed.checks[0]!.detail).toContain('EACCES: permission denied');
		expect(graph).not.toHaveBeenCalled();
	});
});
