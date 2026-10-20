import type { FlowGraph } from 'flow-core';

import { type LayoutDirection, layoutGraph } from './GraphLayout.js';

/**
 * The step to show first when the whole chart is too big to be readable: the first failed step (what a reader
 * looks for), else the first running one, else the entry of the flow: the step the layout puts first along the flow
 * direction (top, or left), the leftmost/topmost of them when several start the flow.
 */
export function pickFocusStep(graph: FlowGraph, direction: LayoutDirection): string {
	const first = graph.nodes[0];
	if (first === undefined) {
		throw new Error('Cannot pick a step to focus: the graph has no step. The caller must handle the empty graph.');
	}
	const highlighted = graph.nodes.find(n => n.status === 'failed') ?? graph.nodes.find(n => n.status === 'running');
	if (highlighted !== undefined) {
		return highlighted.id;
	}
	const positions = layoutGraph(graph, direction);
	const along = (id: string): number => (direction === 'TB' ? positions.get(id)!.y : positions.get(id)!.x);
	const across = (id: string): number => (direction === 'TB' ? positions.get(id)!.x : positions.get(id)!.y);
	return [...graph.nodes].sort((a, b) => along(a.id) - along(b.id) || across(a.id) - across(b.id))[0]!.id;
}
