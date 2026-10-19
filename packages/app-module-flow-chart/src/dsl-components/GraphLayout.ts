import dagre from 'dagre';
import type { FlowGraph } from 'flow-core';

export type LayoutDirection = 'LR' | 'TB';

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 76;

export interface NodePosition {
	/** Top-left corner, in flow coordinates. */
	x: number;
	y: number;
}

/**
 * Positions every step with dagre. Loop edges (onFailure.goto) are left out of the ranking: they point
 * backwards on purpose, and counting them would make dagre reverse part of the flow.
 */
export function layoutGraph(graph: FlowGraph, direction: LayoutDirection): Map<string, NodePosition> {
	const layout = new dagre.graphlib.Graph();
	layout.setGraph({
		rankdir: direction,
		nodesep: 36,
		ranksep: direction === 'LR' ? 90 : 60,
		marginx: 16,
		marginy: 16,
	});
	layout.setDefaultEdgeLabel(() => ({}));

	const ids = new Set(graph.nodes.map(n => n.id));
	for (const n of graph.nodes) layout.setNode(n.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
	for (const edge of graph.edges) {
		for (const end of [edge.from, edge.to]) {
			if (!ids.has(end)) {
				throw new Error(
					`Edge ${edge.from} -> ${edge.to} refers to the unknown step '${end}'. flow-core should have refused this graph: report it.`
				);
			}
		}
		if (edge.kind !== 'loop') {
			layout.setEdge(edge.from, edge.to);
		}
	}
	dagre.layout(layout);

	const positions = new Map<string, NodePosition>();
	for (const n of graph.nodes) {
		const placed = layout.node(n.id);
		positions.set(n.id, { x: placed.x - NODE_WIDTH / 2, y: placed.y - NODE_HEIGHT / 2 });
	}
	return positions;
}
