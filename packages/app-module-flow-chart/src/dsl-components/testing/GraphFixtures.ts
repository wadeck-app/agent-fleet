import { type ExecutionState, type FlowGraph, type FlowGraphNode, annotateGraph, buildFlowGraph } from 'flow-core';
import type { FlowDefinition } from 'flow-engine/types';

export function node(id: string, extra: Partial<FlowGraphNode> = {}): FlowGraphNode {
	return { id, kind: 'script', label: id, ...extra };
}

/** plan -> test -> ship, with a retry loop test -> plan (onFailure.goto) and a conditional edge to a notification. */
export const BUILD_GRAPH: FlowGraph = {
	nodes: [
		node('plan', { kind: 'model', label: 'Plan', status: 'completed', durationLabel: '12.3s', attempts: 1 }),
		node('test', {
			label: 'Test',
			status: 'failed',
			durationLabel: '2m5s',
			attempts: 3,
			meta: { error: 'exit 1: 3 tests failed', onFailureGoto: 'plan', workerId: 'w-1' },
		}),
		node('ship', { status: 'pending' }),
		node('notify', { status: 'pending', meta: { when: 'steps.test.failed' } }),
	],
	edges: [
		{ from: 'plan', to: 'test', kind: 'dependency' },
		{ from: 'test', to: 'ship', kind: 'dependency' },
		{ from: 'test', to: 'notify', kind: 'conditional', label: 'steps.test.failed' },
		{ from: 'test', to: 'plan', kind: 'loop', label: 'on failure (max 2x)' },
	],
};

/** A straight chain of `count` steps, to check layout and fit on a long flow. */
export function chain(count: number): FlowGraph {
	const nodes = Array.from({ length: count }, (_, i) => node(`step-${i}`));
	const edges = nodes.slice(1).map((n, i) => ({ from: nodes[i]!.id, to: n.id, kind: 'dependency' as const }));
	return { nodes, edges };
}

/**
 * plan -> build -> ship, where `build` was composed of b1 and b2 (b2 depends on b1) and b2 itself of b2a and b2b:
 * a sub-flow two levels deep (the `substep` edges point from the sub-step to its parent, like flow-core builds them).
 */
export const SUBFLOW_GRAPH: FlowGraph = {
	nodes: [
		node('plan', { status: 'completed' }),
		node('build', { kind: 'subflow', status: 'running' }),
		node('b1', { kind: 'injected', status: 'completed' }),
		node('b2', { kind: 'injected', status: 'running' }),
		node('b2a', { kind: 'injected', status: 'completed' }),
		node('b2b', { kind: 'injected', status: 'pending' }),
		node('ship', { status: 'pending' }),
	],
	edges: [
		{ from: 'plan', to: 'build', kind: 'dependency' },
		{ from: 'build', to: 'ship', kind: 'dependency' },
		{ from: 'b1', to: 'build', kind: 'substep', label: 'sub-step of' },
		{ from: 'b2', to: 'build', kind: 'substep', label: 'sub-step of' },
		{ from: 'b1', to: 'b2', kind: 'dependency' },
		{ from: 'b2a', to: 'b2', kind: 'substep', label: 'sub-step of' },
		{ from: 'b2b', to: 'b2', kind: 'substep', label: 'sub-step of' },
		{ from: 'b2a', to: 'b2b', kind: 'dependency' },
	],
};

const RUN_FLOW = {
	id: 'build_task',
	version: '1.0.0',
	name: 'Build a task',
	steps: [
		{ id: 'plan', name: 'Plan', type: 'model', prompt: 'Plan ${{ inputs.task }}' },
		{
			id: 'test',
			name: 'Test',
			type: 'script',
			depends: ['plan'],
			script: 'npm test ${{ steps.plan.outputs.files }}',
			env: { REGION: 'eu' },
		},
		{ id: 'ship', name: 'Ship', type: 'script', depends: ['test'], script: 'echo ship' },
		{
			id: 'notify',
			name: 'Notify',
			type: 'script',
			depends: ['plan'],
			when: '${{ steps.plan.outputs.files }} == none',
			script: 'echo hi',
		},
	],
} as unknown as FlowDefinition;

/** A long stdout, to check the "Show more" of the captured output. */
export const LONG_STDOUT = `${'line of test output\n'.repeat(60)}FAIL a.test.ts`;

const RUN_EXECUTION: ExecutionState = {
	executionId: 'exec1',
	flowFile: '/flows/build.yml',
	flowId: 'build_task',
	status: 'failed',
	currentSteps: [],
	startedAt: '2026-08-16T12:00:00.000Z',
	completedAt: '2026-08-16T12:04:00.000Z',
	steps: {
		plan: {
			status: 'completed',
			attempts: 1,
			startedAt: '2026-08-16T12:00:01.000Z',
			completedAt: '2026-08-16T12:01:00.000Z',
		},
		test: {
			status: 'failed',
			attempts: 3,
			startedAt: '2026-08-16T12:01:10.000Z',
			completedAt: '2026-08-16T12:04:00.000Z',
			error: 'exit 1: 3 tests failed',
			stdout: LONG_STDOUT,
			meta: { duration_ms: 1000, exit_code: 1 },
		},
		ship: { status: 'pending' },
		notify: { status: 'pending' },
	},
};

/** A failed run drawn the way the API sends it: plan -> test (failed) -> ship (not reached), notify skipped by its condition. */
export const ANNOTATED_RUN_GRAPH: FlowGraph = annotateGraph(
	buildFlowGraph(RUN_FLOW, RUN_EXECUTION),
	RUN_FLOW,
	RUN_EXECUTION
);
