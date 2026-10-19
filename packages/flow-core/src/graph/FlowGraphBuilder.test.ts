import type { FlowDefinition } from 'flow-engine/types';
import { describe, expect, it } from 'vitest';

import { FlowCoreError } from '../errors.js';
import { makeExec } from '../testing/makeExec.js';
import { buildFlowGraph } from './FlowGraphBuilder.js';

function flowOf(steps: unknown[]): FlowDefinition {
	return { id: 'build_task', version: '1.0.0', name: 'Build', steps } as unknown as FlowDefinition;
}

// @formatter:off
const buildAndReview = flowOf([
	{ id: 'plan', name: 'Plan', type: 'model', provider: 'opencode', model: 'haiku', prompt: 'p' },
	{
		id: 'implement',
		name: 'Implement',
		type: 'model',
		depends: ['plan'],
		model: 'sonnet',
		prompt: 'p',
		retry: { maxAttempts: 2, backoff: 'fixed' },
	},
	{
		id: 'test',
		name: 'Run tests',
		type: 'script',
		depends: ['implement'],
		script: 'npm test',
		onFailure: { goto: 'implement', maxIterations: 4 },
	},
	{
		id: 'ship',
		name: 'Ship',
		type: 'script',
		depends: ['test'],
		when: '${{ steps.test.outputs.passed }} == true',
		script: 'echo',
	},
	{
		id: 'approve',
		name: '',
		type: 'user_intervention',
		interventionType: 'approval',
		depends: ['ship'],
		blocking: false,
	},
	{ id: 'deploy', name: 'Deploy', type: 'subflow', flowId: 'deploy_flow', depends: ['approve'] },
]);
// @formatter:on

describe('buildFlowGraph (definition only)', () => {
	it('creates one node per step with its kind and label, without status', () => {
		const { nodes } = buildFlowGraph(buildAndReview);

		expect(nodes.map(n => [n.id, n.kind, n.label])).toEqual([
			['plan', 'model', 'Plan'],
			['implement', 'model', 'Implement'],
			['test', 'script', 'Run tests'],
			['ship', 'script', 'Ship'],
			// A step without a name is labelled by its id.
			['approve', 'user_intervention', 'approve'],
			['deploy', 'subflow', 'Deploy'],
		]);
		expect(nodes.every(n => n.status === undefined && n.durationLabel === undefined)).toBe(true);
	});

	it('maps depends to dependency edges, depends+when to conditional edges and onFailure.goto to a loop edge', () => {
		const { edges } = buildFlowGraph(buildAndReview);

		expect(edges).toContainEqual({ from: 'plan', to: 'implement', kind: 'dependency' });
		expect(edges).toContainEqual({ from: 'test', to: 'implement', kind: 'loop', label: 'on failure (max 4x)' });
		// Template syntax and the steps.X.outputs. prefix are stripped from the label.
		expect(edges).toContainEqual({ from: 'test', to: 'ship', kind: 'conditional', label: 'passed == true' });
		expect(edges.filter(e => e.kind === 'loop')).toHaveLength(1);
		expect(edges).toHaveLength(6);
	});

	it('puts display details in meta', () => {
		const byId = Object.fromEntries(buildFlowGraph(buildAndReview).nodes.map(n => [n.id, n.meta]));

		expect(byId.plan).toMatchObject({ provider: 'opencode', model: 'haiku' });
		expect(byId.implement).toMatchObject({ retryMaxAttempts: 2 });
		expect(byId.test).toMatchObject({ onFailureGoto: 'implement', onFailureMaxIterations: 4 });
		expect(byId.approve).toMatchObject({ interventionType: 'approval', blocking: false });
		expect(byId.deploy).toMatchObject({ flowId: 'deploy_flow' });
	});

	it('defaults the loop limit to 3 like the scheduler', () => {
		const graph = buildFlowGraph(
			flowOf([
				{ id: 'a', name: 'A', type: 'script', script: 'x' },
				{ id: 'b', name: 'B', type: 'script', script: 'x', depends: ['a'], onFailure: { goto: 'a' } },
			])
		);

		expect(graph.edges.find(e => e.kind === 'loop')?.label).toBe('on failure (max 3x)');
	});

	it('links a sub-step to its parent', () => {
		const graph = buildFlowGraph(
			flowOf([
				{ id: 'parent', name: 'Parent', type: 'model', prompt: 'p' },
				{ id: 'child', name: 'Child', type: 'script', script: 'x', parent: 'parent' },
			])
		);

		expect(graph.edges).toEqual([{ from: 'child', to: 'parent', kind: 'substep', label: 'sub-step of' }]);
	});

	it('draws a single-step flow with no edge', () => {
		const graph = buildFlowGraph(flowOf([{ id: 'only', name: 'Only', type: 'script', script: 'x' }]));

		expect(graph.nodes).toHaveLength(1);
		expect(graph.edges).toEqual([]);
	});

	it('handles a flow of 50 chained steps', () => {
		const steps = Array.from({ length: 50 }, (_, i) => ({
			id: `s${i}`,
			name: `S${i}`,
			type: 'script',
			script: 'x',
			...(i > 0 ? { depends: [`s${i - 1}`] } : {}),
		}));

		const graph = buildFlowGraph(flowOf(steps));

		expect(graph.nodes).toHaveLength(50);
		expect(graph.edges).toHaveLength(49);
	});

	it('fails fast on a dangling depends, naming the step and the missing target', () => {
		const flow = flowOf([{ id: 'a', name: 'A', type: 'script', script: 'x', depends: ['ghost'] }]);

		expect(() => buildFlowGraph(flow)).toThrow(/step 'a' has depends on 'ghost'/);
		try {
			buildFlowGraph(flow);
		} catch (err) {
			expect(err).toBeInstanceOf(FlowCoreError);
			expect((err as FlowCoreError).kind).toBe('invalid-flow-graph');
		}
	});

	it('fails fast on a dangling onFailure.goto and on a dangling parent', () => {
		expect(() =>
			buildFlowGraph(flowOf([{ id: 'a', name: 'A', type: 'script', script: 'x', onFailure: { goto: 'nope' } }]))
		).toThrow(/onFailure\.goto 'nope'/);
		expect(() =>
			buildFlowGraph(flowOf([{ id: 'a', name: 'A', type: 'script', script: 'x', parent: 'nope' }]))
		).toThrow(/parent 'nope'/);
	});

	it('fails fast on duplicate step ids', () => {
		const flow = flowOf([
			{ id: 'a', name: 'A', type: 'script', script: 'x' },
			{ id: 'a', name: 'A2', type: 'script', script: 'x' },
		]);

		expect(() => buildFlowGraph(flow)).toThrow(/step id 'a' is declared twice/);
	});
});

describe('buildFlowGraph (with an execution)', () => {
	const failedRun = makeExec({
		executionId: 'f41lc0de',
		status: 'failed',
		steps: {
			plan: {
				status: 'completed',
				startedAt: '2026-08-16T12:00:00.000Z',
				completedAt: '2026-08-16T12:00:05.000Z',
				meta: { model: 'amazon-bedrock/sonnet', cost: { usd: 0.12 } } as never,
			},
			implement: {
				status: 'completed',
				startedAt: '2026-08-16T12:00:05.000Z',
				completedAt: '2026-08-16T12:02:05.000Z',
				attempts: 2,
			},
			test: {
				status: 'failed',
				startedAt: '2026-08-16T12:02:05.000Z',
				completedAt: '2026-08-16T12:02:06.200Z',
				error: '3 tests failed',
			},
			// Created at run time: not in the flow file.
			extra_check: { status: 'running', startedAt: '2026-08-16T12:02:06.000Z', injected: true },
		},
	});

	it('decorates nodes with status, duration, attempts and error', () => {
		const byId = Object.fromEntries(buildFlowGraph(buildAndReview, failedRun).nodes.map(n => [n.id, n]));

		expect(byId.plan).toMatchObject({ status: 'completed', durationLabel: '5.0s' });
		expect(byId.plan.meta).toMatchObject({ costUsd: 0.12, model: 'amazon-bedrock/sonnet' });
		expect(byId.implement).toMatchObject({ status: 'completed', durationLabel: '2m0s', attempts: 2 });
		expect(byId.test).toMatchObject({ status: 'failed', durationLabel: '1.2s' });
		expect(byId.test.meta).toMatchObject({ error: '3 tests failed' });
	});

	it('marks steps absent from the state as pending, without duration', () => {
		const ship = buildFlowGraph(buildAndReview, failedRun).nodes.find(n => n.id === 'ship');

		expect(ship?.status).toBe('pending');
		expect(ship?.durationLabel).toBeUndefined();
	});

	it('reports a running step with the running label', () => {
		const injected = buildFlowGraph(buildAndReview, failedRun).nodes.find(n => n.id === 'extra_check');

		expect(injected).toMatchObject({
			kind: 'injected',
			status: 'running',
			durationLabel: 'running',
			label: 'extra_check',
		});
		expect(injected?.meta).toMatchObject({ injected: true });
	});

	it('does not add edges for injected steps', () => {
		expect(buildFlowGraph(buildAndReview, failedRun).edges).toHaveLength(6);
	});
});

// Shape of a real failed run whose generated flow file was rewritten afterwards: the record holds steps the
// current file no longer declares, none of them flagged `injected`, with no recorded dependencies.
describe('buildFlowGraph (steps recorded by the run but absent from the flow file)', () => {
	const rewrittenFlow = flowOf([{ id: 'finish', name: 'Finish', type: 'script', script: 'echo done' }]);
	// Keys are deliberately not in execution order: the order must come from startedAt, not from the key order.
	// @formatter:off
	const run = makeExec({
		executionId: 'stale1',
		status: 'failed',
		steps: {
			second: {
				status: 'completed',
				startedAt: '2026-10-18T13:53:24.803Z',
				completedAt: '2026-10-18T13:53:28.575Z',
			},
			first: {
				status: 'completed',
				startedAt: '2026-10-18T13:46:02.688Z',
				completedAt: '2026-10-18T13:53:24.794Z',
			},
			fourth: { status: 'failed', startedAt: '2026-10-18T13:59:02.795Z', error: 'stuck' },
			third: {
				status: 'completed',
				startedAt: '2026-10-18T13:55:16.965Z',
				completedAt: '2026-10-18T13:55:17.034Z',
			},
			fifth: { status: 'pending' },
			finish: { status: 'pending' },
		},
	});
	// @formatter:on

	it('orders the nodes by start time, then record order, never definition-first', () => {
		const { nodes } = buildFlowGraph(rewrittenFlow, run);

		expect(nodes.map(n => n.id)).toEqual(['first', 'second', 'third', 'fourth', 'fifth', 'finish']);
	});

	it('marks them removed (not injected) and keeps them out of the injected kind', () => {
		const byId = Object.fromEntries(buildFlowGraph(rewrittenFlow, run).nodes.map(n => [n.id, n]));

		expect(byId.first.kind).toBe('removed');
		expect(byId.first.meta).toMatchObject({ removed: true });
		expect(byId.finish.kind).toBe('script');
	});

	it('links the steps whose dependencies were not recorded in the order they ran', () => {
		const { edges } = buildFlowGraph(rewrittenFlow, run);

		expect(edges).toEqual([
			{ from: 'first', to: 'second', kind: 'sequence', label: 'recorded order' },
			{ from: 'second', to: 'third', kind: 'sequence', label: 'recorded order' },
			{ from: 'third', to: 'fourth', kind: 'sequence', label: 'recorded order' },
			{ from: 'fourth', to: 'fifth', kind: 'sequence', label: 'recorded order' },
		]);
	});

	it('warns that the flow file changed since the run and the edges are inferred', () => {
		const { warnings } = buildFlowGraph(rewrittenFlow, run);

		expect(warnings).toHaveLength(1);
		expect(warnings?.[0]).toContain('first, second, third, fourth, fifth');
		expect(warnings?.[0]).toContain('changed since this run');
	});

	it('has no warning when every recorded step is in the flow file or flagged injected', () => {
		const clean = makeExec({
			executionId: 'ok1',
			steps: { finish: { status: 'completed' }, extra: { status: 'completed', injected: true } },
		});

		expect(buildFlowGraph(rewrittenFlow, clean).warnings).toBeUndefined();
	});

	it('uses the dependencies and parent recorded on an injected step instead of inferring', () => {
		const flow = flowOf([{ id: 'plan', name: 'Plan', type: 'model', prompt: 'p' }]);
		const recorded = makeExec({
			executionId: 'inj1',
			steps: {
				plan: { status: 'completed', startedAt: '2026-10-18T10:00:00.000Z' },
				a: { status: 'completed', injected: true, parent: 'plan', startedAt: '2026-10-18T10:01:00.000Z' },
				b: { status: 'pending', injected: true, dependsOn: ['a'] },
			},
		});

		const { edges, nodes } = buildFlowGraph(flow, recorded);

		expect(nodes.find(n => n.id === 'a')?.kind).toBe('injected');
		expect(edges).toEqual([
			{ from: 'a', to: 'plan', kind: 'substep', label: 'sub-step of' },
			{ from: 'a', to: 'b', kind: 'dependency' },
		]);
	});

	it('refuses a recorded dependency on a step that is not in the run', () => {
		const flow = flowOf([{ id: 'plan', name: 'Plan', type: 'model', prompt: 'p' }]);
		const broken = makeExec({
			executionId: 'bad1',
			steps: { plan: { status: 'completed' }, a: { status: 'pending', injected: true, dependsOn: ['ghost'] } },
		});

		expect(() => buildFlowGraph(flow, broken)).toThrow(/step 'a'.*'ghost'/);
	});
});
