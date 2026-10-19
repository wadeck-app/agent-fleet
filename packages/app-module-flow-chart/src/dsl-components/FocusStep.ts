import type { FlowGraph } from 'flow-core';

/**
 * The step to show first when the whole chart is too big to be readable: the first failed step (what a reader
 * looks for), else the first running one, else the first step.
 */
export function pickFocusStep(graph: FlowGraph): string {
	const first = graph.nodes[0];
	if (first === undefined) {
		throw new Error('Cannot pick a step to focus: the graph has no step. The caller must handle the empty graph.');
	}
	return (graph.nodes.find(n => n.status === 'failed') ?? graph.nodes.find(n => n.status === 'running') ?? first).id;
}
