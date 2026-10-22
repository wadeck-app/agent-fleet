import dagre from 'dagre';
import type { FlowGraph, FlowGraphEdge } from 'flow-core';
import { type GraphTreeRow, buildGraphTree, liftEdges, visibleTreeRows } from 'flow-core/graph-tree';

export type LayoutDirection = 'LR' | 'TB';

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 76;
/** How far a sub-step is shifted right of its parent, per level. */
export const INDENT = 40;
/** Distance between the tops of two stacked rows (a block of a step and its sub-steps). */
export const ROW_PITCH = NODE_HEIGHT + 28;

export interface NodePosition {
	/** Top-left corner, in flow coordinates. */
	x: number;
	y: number;
}

export interface TreeLayout {
	positions: Map<string, NodePosition>;
	/** Rows shown (the sub-steps of collapsed parents are left out), in tree order. */
	rows: GraphTreeRow[];
	/** Edges redrawn on the shown steps. */
	edges: FlowGraphEdge[];
}

const NOTHING_COLLAPSED: ReadonlySet<string> = new Set();

/**
 * Layout rule, both directions. The top-level steps form the spine and are placed by dagre (left to right, or top to
 * bottom) exactly as a flat flow would be. A step with sub-steps (`parent`) owns a block: the step on top, then its
 * sub-steps stacked below it in tree order (flow-core buildGraphTree), each level shifted right by INDENT, like a file
 * tree. A block is as tall as its stack, so the next step of the spine starts after the last sub-step. Loop edges
 * are left out of the ranking: they point backwards on purpose, and counting them would make dagre reverse part of the flow.
 */
export function layoutTree(
	graph: FlowGraph,
	direction: LayoutDirection,
	collapsed: ReadonlySet<string> = NOTHING_COLLAPSED
): TreeLayout {
	const allRows = buildGraphTree(graph);
	const rows = visibleTreeRows(allRows, collapsed);
	const edges = liftEdges(graph.edges, allRows, new Set(rows.map(r => r.nodeId)));

	const blocks: GraphTreeRow[][] = [];
	for (const row of rows) {
		if (row.depth === 0) {
			blocks.push([row]);
		} else {
			blocks[blocks.length - 1]!.push(row);
		}
	}
	const deepest = (block: GraphTreeRow[]): number => Math.max(...block.map(r => r.depth));

	const layout = new dagre.graphlib.Graph();
	layout.setGraph({
		rankdir: direction,
		nodesep: 36,
		ranksep: direction === 'LR' ? 90 : 60,
		marginx: 16,
		marginy: 16,
	});
	layout.setDefaultEdgeLabel(() => ({}));
	for (const block of blocks) {
		// Padded on both sides so the step itself stays centered on the spine whatever the depth of its sub-steps.
		layout.setNode(block[0]!.nodeId, {
			width: NODE_WIDTH + 2 * deepest(block) * INDENT,
			height: NODE_HEIGHT + (block.length - 1) * ROW_PITCH,
		});
	}
	const spine = new Set(blocks.map(block => block[0]!.nodeId));
	for (const edge of liftEdges(edges, rows, spine)) {
		if (edge.kind !== 'loop' && edge.kind !== 'substep') {
			layout.setEdge(edge.from, edge.to);
		}
	}
	dagre.layout(layout);

	const positions = new Map<string, NodePosition>();
	for (const block of blocks) {
		const top = block[0]!;
		const placed = layout.node(top.nodeId);
		const left = placed.x - NODE_WIDTH / 2;
		const y = placed.y - placed.height / 2;
		block.forEach((row, index) => {
			positions.set(row.nodeId, { x: left + row.depth * INDENT, y: y + index * ROW_PITCH });
		});
	}
	return { positions, rows, edges };
}

/** Where each shown step goes; see {@link layoutTree}. */
export function layoutGraph(
	graph: FlowGraph,
	direction: LayoutDirection,
	collapsed: ReadonlySet<string> = NOTHING_COLLAPSED
): Map<string, NodePosition> {
	return layoutTree(graph, direction, collapsed).positions;
}
