import type { FlowGraph, FlowGraphNode } from 'flow-core';

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
