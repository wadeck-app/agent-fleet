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
