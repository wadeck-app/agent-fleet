import type { ModuleContext } from '@wadeck-app/app-core-sdk';
import { DefinitionSnapshotStore, FlowQueryService, definitionsDirOf, hashDefinition } from 'flow-core';
import { FlowConfigFixture, callRoute, collectRoutes } from 'flow-core/testing';
import * as yaml from 'js-yaml';
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

describe('GET /graph of a run that recorded its definition', () => {
	it('draws the recorded definition after the flow file was edited, with real edges and no "changed" warning', async () => {
		const recorded = yaml.load(FLOW_YAML);
		const hash = hashDefinition(recorded);
		const ref = new DefinitionSnapshotStore(definitionsDirOf(fixture.configDir)).save({
			flowId: 'build_task',
			version: '1.0.0',
			hash,
			text: FLOW_YAML,
		}).ref;
		fixture.addExecution({
			executionId: 'rec1',
			flowId: 'build_task',
			flowFile,
			flowVersion: '1.0.0',
			definitionHash: hash,
			definitionSnapshot: ref,
			versionChoice: 'file',
			steps: { plan: { status: 'completed' }, test: { status: 'failed' }, ship: { status: 'pending' } },
		});
		writeFileSync(
			flowFile,
			'id: build_task\nname: Edited\nsteps:\n  - id: only\n    type: script\n    script: x\n'
		);

		const { status, body } = await callRoute(routes, 'GET /graph', { query: { executionId: 'rec1' } });

		const result = body as {
			graph: { nodes: { id: string }[]; edges: { kind: string }[]; warnings?: string[] };
			flowName: string;
			definition: unknown;
		};
		expect(status).toBe(200);
		expect(result.graph.nodes.map(node => node.id)).toEqual(['plan', 'test', 'ship']);
		expect(result.graph.edges.some(edge => edge.kind === 'sequence')).toBe(false);
		expect(result.graph.warnings ?? []).toEqual([]);
		expect(result.flowName).toBe('Build a task');
		expect(result.definition).toEqual({ source: 'recorded', version: '1.0.0', snapshot: ref });
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

	it('serves the step texts without ANSI and as stored otherwise, with no redaction field', async () => {
		const ESC = String.fromCharCode(27);
		fixture.addExecution({
			executionId: 'exec1',
			flowId: 'build_task',
			flowFile,
			status: 'failed',
			steps: {
				test: {
					status: 'failed',
					error: `${ESC}[31mpush failed${ESC}[0m`,
					stdout: `${ESC}[36mrunning${ESC}[0m\nPASSWORD=left-as-stored`,
				},
			},
		});
		const { body } = await callRoute(routes, 'GET /graph', { query: { executionId: 'exec1' } });
		const result = body as {
			graph: {
				nodes: { id: string; meta?: { error?: string }; io?: { recorded: { stdout?: { text: string } } } }[];
			};
		};
		const test = result.graph.nodes.find(n => n.id === 'test')!;

		expect(JSON.stringify(body).includes(ESC)).toBe(false);
		expect(test.meta?.error).toBe('push failed');
		expect(test.io?.recorded.stdout?.text).toBe('running\nPASSWORD=left-as-stored');
		expect(body).not.toHaveProperty('redactions');
		expect(test.io?.recorded).not.toHaveProperty('redactions');
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
		const { status, body } = await callRoute(routes, 'GET /flows');
		expect(status).toBe(200);
		expect(body).toMatchObject({
			flows: [],
			total: 0,
			limit: 20,
			offset: 0,
			emptyMessage: 'No flow has run yet: run a flow (flow run <file>) and it shows here',
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

describe('GET /flows fields for the index variants', () => {
	beforeEach(() => {
		fixture.addExecution({
			executionId: 'old',
			flowId: 'build_task',
			flowFile,
			status: 'completed',
			startedAt: '2026-10-18T10:00:00.000Z',
		});
		fixture.addExecution({
			executionId: 'new run',
			flowId: 'build_task',
			flowFile,
			status: 'failed',
			startedAt: '2026-10-18T11:00:00.000Z',
		});
		fixture.addExecution({
			executionId: 'r1',
			flowId: 'deploy',
			flowFile,
			status: 'running',
			startedAt: '2026-10-18T09:00:00.000Z',
		});
		fixture.addExecution({
			executionId: 'h1',
			flowId: 'lint',
			flowFile,
			status: 'completed',
			startedAt: '2026-10-18T08:00:00.000Z',
		});
	});

	type Row = Record<string, unknown> & { flowId: string };
	const flowsOf = (body: unknown): Row[] => (body as { flows: Row[] }).flows;

	it('gives each flow its last run, health, counts and the two chart paths, with the date as ISO text', async () => {
		const { body } = await callRoute(routes, 'GET /flows');
		expect(flowsOf(body)[0]).toEqual({
			flowId: 'build_task',
			executionCount: 2,
			failedCount: 1,
			runningCount: 0,
			lastStatus: 'failed',
			lastStartedAt: '2026-10-18T11:00:00.000Z',
			health: 'failing',
			chartPath: '/modules/flow-chart/flows/build_task',
			lastRunChartPath: '/modules/flow-chart/flows/runs/new%20run',
		});
	});

	it('filters by text before paginating, and says the total of the matches', async () => {
		const { body } = await callRoute(routes, 'GET /flows', { query: { q: 'BUILD', limit: '1' } });
		expect(flowsOf(body).map(f => f.flowId)).toEqual(['build_task']);
		expect(body).toMatchObject({ total: 1 });
	});

	it('filters by health, and treats empty q and health as unset (the DSL sends ?health=)', async () => {
		const running = await callRoute(routes, 'GET /flows', { query: { health: 'running' } });
		expect(flowsOf(running.body).map(f => f.flowId)).toEqual(['deploy']);
		const all = await callRoute(routes, 'GET /flows', { query: { q: '', health: '' } });
		expect(flowsOf(all.body)).toHaveLength(3);
	});

	it('treats health=any as no health filter', async () => {
		const { body } = await callRoute(routes, 'GET /flows', { query: { health: 'any' } });
		expect(flowsOf(body)).toHaveLength(3);
	});

	describe('emptyMessage (about the page, like the executions table)', () => {
		it('says the page is empty when flows exist but not on this page', async () => {
			const { body } = await callRoute(routes, 'GET /flows', { query: { limit: '2', page: '5' } });
			expect(body).toMatchObject({ total: 3, emptyMessage: 'No flows on this page' });
		});

		it('says no flow matches when a filter removed them all, naming how to clear it', async () => {
			const { body } = await callRoute(routes, 'GET /flows', { query: { q: 'zzz' } });
			expect(body).toMatchObject({ total: 0, emptyMessage: 'No flow matches the filters' });
			const byHealth = await callRoute(routes, 'GET /flows', { query: { q: 'lint', health: 'failing' } });
			expect(byHealth.body).toMatchObject({ emptyMessage: 'No flow matches the filters' });
		});

		it('does not treat health=any or empty values as a filter', async () => {
			fixture.dispose();
			fixture = new FlowConfigFixture();
			const collected = collectRoutes<ModuleContext>();
			registerGraphRoutes(collected.ctx, FlowQueryService.forConfigDir(fixture.configDir));
			const { body } = await callRoute(collected.routes, 'GET /flows', { query: { q: '', health: 'any' } });
			expect(body).toMatchObject({
				total: 0,
				emptyMessage: 'No flow has run yet: run a flow (flow run <file>) and it shows here',
			});
		});
	});

	describe('chips (health toggles with counts; the DSL cannot repeat a node, so each one is a named object)', () => {
		type Chip = { label: string; to: string; variant: string };
		const chipsOf = (body: unknown) => (body as { chips: Record<string, Chip> }).chips;

		it('counts the flows of each health after the text filter, whatever the health filter and the page', async () => {
			const { body } = await callRoute(routes, 'GET /flows', { query: { health: 'failing', limit: '1' } });
			expect(Object.keys(chipsOf(body))).toEqual(['any', 'failing', 'running', 'healthy']);
			expect(Object.values(chipsOf(body)).map(chip => chip.label)).toEqual([
				'Any (3)',
				'Failing (1)',
				'Running (1)',
				'Healthy (1)',
			]);
			const narrowed = await callRoute(routes, 'GET /flows', { query: { q: 'build' } });
			expect(Object.values(chipsOf(narrowed.body)).map(chip => chip.label)).toEqual([
				'Any (1)',
				'Failing (1)',
				'Running (0)',
				'Healthy (0)',
			]);
		});

		it('marks the chip of the active health primary and the others secondary (any when no filter)', async () => {
			const none = await callRoute(routes, 'GET /flows');
			expect(Object.values(chipsOf(none.body)).map(chip => chip.variant)).toEqual([
				'primary',
				'secondary',
				'secondary',
				'secondary',
			]);
			const running = await callRoute(routes, 'GET /flows', { query: { health: 'running' } });
			expect(Object.values(chipsOf(running.body)).map(chip => chip.variant)).toEqual([
				'secondary',
				'secondary',
				'primary',
				'secondary',
			]);
		});

		it('links to the index page with the health, keeping the text and the page size, and dropping the page', async () => {
			const { body } = await callRoute(routes, 'GET /flows', {
				query: { q: 'a b', health: 'running', limit: '50', page: '3' },
			});
			const chips = chipsOf(body);
			expect(chips['any']!.to).toBe('/modules/flow-chart/flows?q=a+b&size=50');
			expect(chips['failing']!.to).toBe('/modules/flow-chart/flows?q=a+b&health=failing&size=50');
			const plain = await callRoute(routes, 'GET /flows');
			expect(chipsOf(plain.body)['any']!.to).toBe('/modules/flow-chart/flows');
			expect(chipsOf(plain.body)['healthy']!.to).toBe('/modules/flow-chart/flows?health=healthy');
		});
	});

	it('refuses an unknown health (400) and lists the accepted values', async () => {
		const { status, body } = await callRoute(routes, 'GET /flows', { query: { health: 'sick' } });
		expect(status).toBe(400);
		expect(errorOf(body)).toMatch(/failing, running, healthy.*'sick'/);
	});
});
