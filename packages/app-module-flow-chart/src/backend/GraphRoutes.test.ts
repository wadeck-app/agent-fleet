import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { FlowQueryService } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { registerGraphRoutes } from './GraphRoutes.js';

// @formatter:off
const FLOW_YAML = `id: build_task
name: Build a task
steps:
  - id: plan
    name: Plan
    type: model
    prompt: plan it
  - id: test
    name: Test
    type: script
    depends: [plan]
    script: npm test
    onFailure: { goto: plan, maxIterations: 2 }
  - id: ship
    type: script
    depends: [test]
    script: npm publish
`;
// @formatter:on

let fixture: FlowConfigFixture;
let routes: ReturnType<typeof collectRoutes>['routes'];
let flowFile: string;

beforeEach(() => {
	fixture = new FlowConfigFixture();
	flowFile = join(fixture.configDir, 'build_task.yml');
	writeFileSync(flowFile, FLOW_YAML);
	const collected = collectRoutes<ModuleContext>();
	routes = collected.routes;
	registerGraphRoutes(collected.ctx, FlowQueryService.forConfigDir(fixture.configDir));
});

afterEach(() => fixture.dispose());

function errorOf(body: unknown): string {
	return (body as { error: string }).error;
}

describe('routes', () => {
	it('registers the graph and the flows index', () => {
		expect([...routes.keys()].sort()).toEqual(['GET /flows', 'GET /graph']);
	});
});

describe('GET /graph', () => {
	it('answers the graph of an execution with its step states', async () => {
		fixture.addExecution({
			executionId: 'exec1',
			flowId: 'build_task',
			flowFile,
			status: 'failed',
			steps: {
				plan: {
					status: 'completed',
					startedAt: '2026-08-16T12:00:00.000Z',
					completedAt: '2026-08-16T12:00:05.000Z',
				},
				test: { status: 'failed', error: 'exit 1' },
			},
		});
		const { status, body } = await callRoute(routes, 'GET /graph', { query: { executionId: 'exec1' } });
		const result = body as {
			flowId: string;
			execution: { executionId: string };
			graph: { nodes: { id: string; status?: string }[]; edges: { kind: string }[] };
		};
		expect(status).toBe(200);
		expect(result.flowId).toBe('build_task');
		expect(result.execution.executionId).toBe('exec1');
		expect(result.graph.nodes.map(n => [n.id, n.status])).toEqual([
			['plan', 'completed'],
			['test', 'failed'],
			['ship', 'pending'],
		]);
		expect(result.graph.edges.map(e => e.kind)).toContain('loop');
	});

	it('answers the definition alone for a flowId (no step state)', async () => {
		fixture.addExecution({ executionId: 'exec1', flowId: 'build_task', flowFile });
		const { status, body } = await callRoute(routes, 'GET /graph', { query: { flowId: 'build_task' } });
		const result = body as { execution?: unknown; graph: { nodes: { status?: string }[] } };
		expect(status).toBe(200);
		expect(result.execution).toBeUndefined();
		expect(result.graph.nodes.every(n => n.status === undefined)).toBe(true);
	});

	it('refuses a request with neither executionId nor flowId (400, says which to give)', async () => {
		const { status, body } = await callRoute(routes, 'GET /graph', { query: {} });
		expect(status).toBe(400);
		expect(errorOf(body)).toMatch(/executionId.*flowId/);
	});

	it('refuses a request with both (400)', async () => {
		const { status, body } = await callRoute(routes, 'GET /graph', { query: { executionId: 'a', flowId: 'b' } });
		expect(status).toBe(400);
		expect(errorOf(body)).toMatch(/only one/);
	});

	it('refuses a repeated parameter (400)', async () => {
		const { status } = await callRoute(routes, 'GET /graph', { query: { flowId: ['a', 'b'] } });
		expect(status).toBe(400);
	});

	it('treats an empty parameter as unset: the DSL sends ?flowId= for a missing value', async () => {
		const { status } = await callRoute(routes, 'GET /graph', { query: { executionId: '', flowId: 'ghost' } });
		// Reaches the flow lookup (nobody ran "ghost"), instead of being refused as "both given".
		expect(status).toBe(404);
	});

	it('answers 404 with the lookup message for an unknown execution', async () => {
		const { status, body } = await callRoute(routes, 'GET /graph', { query: { executionId: 'zzz999' } });
		expect(status).toBe(404);
		expect(errorOf(body)).toContain('zzz999');
	});

	it('answers 404 for a flow nobody ran', async () => {
		const { status, body } = await callRoute(routes, 'GET /graph', { query: { flowId: 'ghost' } });
		expect(status).toBe(404);
		expect(errorOf(body)).toContain('ghost');
	});

	it('answers 404 with an actionable message when the flow file is gone (a deleted .flow/.tmp flow)', async () => {
		fixture.addExecution({ executionId: 'exec1', flowId: 'tmp', flowFile: join(fixture.configDir, 'gone.yml') });
		const { status, body } = await callRoute(routes, 'GET /graph', { query: { executionId: 'exec1' } });
		expect(status).toBe(404);
		expect(errorOf(body)).toContain('gone.yml');
	});

	it('answers 422 when the flow file is not a flow', async () => {
		const broken = join(fixture.configDir, 'broken.yml');
		writeFileSync(broken, 'just: a mapping');
		fixture.addExecution({ executionId: 'exec1', flowId: 'broken', flowFile: broken });
		const { status } = await callRoute(routes, 'GET /graph', { query: { executionId: 'exec1' } });
		expect(status).toBe(422);
	});

	it('answers 422 when the definition points at a step that does not exist', async () => {
		const dangling = join(fixture.configDir, 'dangling.yml');
		writeFileSync(dangling, 'id: d\nsteps:\n  - id: a\n    type: script\n    script: x\n    depends: [nope]\n');
		fixture.addExecution({ executionId: 'exec1', flowId: 'd', flowFile: dangling });
		const { status, body } = await callRoute(routes, 'GET /graph', { query: { executionId: 'exec1' } });
		expect(status).toBe(422);
		expect(errorOf(body)).toContain('nope');
	});

	it('does not hide a bug: an unexpected error is a 500 labelled as such', async () => {
		const service = {
			getFlowGraph: () => {
				throw new TypeError('boom');
			},
			listFlows: () => [],
		};
		const collected = collectRoutes<ModuleContext>();
		registerGraphRoutes(collected.ctx, service as unknown as FlowQueryService);
		const { status, body } = await callRoute(collected.routes, 'GET /graph', { query: { flowId: 'x' } });
		expect(status).toBe(500);
		expect(errorOf(body)).toContain('Unexpected error');
		expect(errorOf(body)).toContain('boom');
	});
});

describe('GET /flows', () => {
	it('lists the flows that ran, to pick one to draw', async () => {
		fixture.addExecution({ executionId: 'a1', flowId: 'build_task', flowFile });
		fixture.addExecution({ executionId: 'a2', flowId: 'build_task', flowFile, status: 'failed' });
		const { status, body } = await callRoute(routes, 'GET /flows');
		expect(status).toBe(200);
		const flows = (body as { flows: { flowId: string; executionCount: number; failedCount: number }[] }).flows;
		expect(flows).toHaveLength(1);
		expect(flows[0]).toMatchObject({ flowId: 'build_task', executionCount: 2, failedCount: 1 });
	});

	it('answers an empty list, not an error, before any run', async () => {
		expect(await callRoute(routes, 'GET /flows')).toEqual({
			status: 200,
			body: { flows: [], total: 0, limit: 20, offset: 0 },
		});
	});

	it('gives each flow a short ASCII "Oct 18 16:15" lastStartedLabel next to the raw lastStartedAt', async () => {
		fixture.addExecution({
			executionId: 'a1',
			flowId: 'build_task',
			flowFile,
			startedAt: '2026-10-18T16:15:24.166Z',
		});
		const { body } = await callRoute(routes, 'GET /flows');
		expect((body as { flows: unknown[] }).flows[0]).toMatchObject({
			lastStartedAt: '2026-10-18T16:15:24.166Z',
			lastStartedLabel: 'Oct 18 16:15',
		});
	});

	describe('pagination (what the DSL Pagination and PageSizeSelect send)', () => {
		beforeEach(() => {
			for (let i = 0; i < 5; i++) {
				fixture.addExecution({
					executionId: `e${i}`,
					flowId: `flow_${i}`,
					flowFile,
					startedAt: `2026-10-18T10:0${i}:00.000Z`,
				});
			}
		});

		it('returns the first page with the total, most recent flow first', async () => {
			const { body } = await callRoute(routes, 'GET /flows', { query: { limit: '2' } });
			expect(body).toMatchObject({ total: 5, limit: 2, offset: 0 });
			expect((body as { flows: { flowId: string }[] }).flows.map(flow => flow.flowId)).toEqual([
				'flow_4',
				'flow_3',
			]);
		});

		it('returns the page asked for (zero-based)', async () => {
			const { body } = await callRoute(routes, 'GET /flows', { query: { limit: '2', page: '2' } });
			expect(body).toMatchObject({ total: 5, limit: 2, offset: 4 });
			expect((body as { flows: { flowId: string }[] }).flows.map(flow => flow.flowId)).toEqual(['flow_0']);
		});

		it('refuses a bad limit and a page combined with an offset, saying what is expected', async () => {
			expect(await callRoute(routes, 'GET /flows', { query: { limit: '0' } })).toEqual({
				status: 400,
				body: { error: "'limit' must be an integer between 1 and 500, got '0'." },
			});
			const both = await callRoute(routes, 'GET /flows', { query: { page: '1', offset: '2' } });
			expect(both.status).toBe(400);
		});
	});
});
