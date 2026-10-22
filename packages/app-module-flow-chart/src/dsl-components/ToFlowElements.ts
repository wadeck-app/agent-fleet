import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { FlowGraph, FlowGraphEdge, FlowGraphNode } from 'flow-core';
import type { GraphTreeRow } from 'flow-core/graph-tree';

import { edgeStyle, traversalStyle } from './EdgeStyle.js';
import { type LayoutDirection, NODE_HEIGHT, NODE_WIDTH, layoutTree } from './GraphLayout.js';

/** Where a step sits in the tree of sub-steps, for its node to draw the indent cue and the chevron. */
export interface StepTreeData {
	depth: number;
	/** Direct sub-steps. */
	childCount: number;
	collapsed: boolean;
	/** The chevron is shown: the step has sub-steps and the chart can fold them. */
	toggleable: boolean;
}

export interface StepNodeData extends Record<string, unknown> {
	step: FlowGraphNode;
	direction: LayoutDirection;
	tree: StepTreeData;
	onToggleCollapse?: (stepId: string) => void;
}

export type StepNode = Node<StepNodeData, 'step'>;

export interface TreeControls {
	collapsed: ReadonlySet<string>;
	onToggle: (stepId: string) => void;
}

interface Handles {
	source: string;
	target: string;
}

const FLOW: Handles = { source: 'out', target: 'in' };
const LOOP: Handles = { source: 'loop-out', target: 'loop-in' };
const TREE: Handles = { source: 'tree-out', target: 'tree-in' };
const STACK: Handles = { source: 'stack-out', target: 'stack-in' };
// Both on the left side: the edge goes around the left of the rows in between instead of through them.
const AROUND: Handles = { source: 'side-out', target: 'side-in' };

/**
 * Handles of an ordering edge (dependency, conditional, sequence). Along the flow the usual in/out pair; a vertical
 * chart leaves a step that has sub-steps below it by the left side, and two steps that are not neighbours in the
 * stack of a block (sub-steps) are joined around the left side so the line does not cross the rows in between.
 */
function orderingHandles(
	edge: FlowGraphEdge,
	direction: LayoutDirection,
	rowOf: ReadonlyMap<string, { row: GraphTreeRow; index: number }>,
	collapsed: ReadonlySet<string>
): Handles {
	const from = rowOf.get(edge.from)!;
	const to = rowOf.get(edge.to)!;
	if (from.row.depth === 0 && to.row.depth === 0) {
		return direction === 'TB' && from.row.childCount > 0 && !collapsed.has(edge.from) ? AROUND : FLOW;
	}
	return to.index === from.index + 1 ? STACK : AROUND;
}

/**
 * xyflow nodes and edges of a flow graph. Flow edges use the `in`/`out` handles (left/right, or top/bottom);
 * a retry loop uses the `loop-in`/`loop-out` handles on the other side so it curves around the flow; the link
 * from a parent to a sub-step is an elbow from the parent's lower left corner to the left of the sub-step.
 * `tree` makes the parents with sub-steps foldable; without it every sub-step is shown and nothing can be folded.
 */
export function toFlowElements(
	graph: FlowGraph,
	direction: LayoutDirection,
	selectedId: string | undefined,
	tree?: TreeControls
): { nodes: StepNode[]; edges: Edge[] } {
	const collapsed = tree?.collapsed ?? new Set<string>();
	const layout = layoutTree(graph, direction, collapsed);
	const nodeById = new Map(graph.nodes.map(n => [n.id, n]));
	const rowOf = new Map(layout.rows.map((row, index) => [row.nodeId, { row, index }]));

	const nodes: StepNode[] = layout.rows.map(row => {
		const step = nodeById.get(row.nodeId)!;
		const isCollapsed = collapsed.has(row.nodeId);
		return {
			id: step.id,
			type: 'step',
			position: layout.positions.get(step.id)!,
			width: NODE_WIDTH,
			height: NODE_HEIGHT,
			selected: step.id === selectedId,
			data: {
				step,
				direction,
				tree: {
					depth: row.depth,
					childCount: row.childCount,
					collapsed: isCollapsed,
					toggleable: tree !== undefined && row.childCount > 0,
				},
				...(tree !== undefined && row.childCount > 0 ? { onToggleCollapse: tree.onToggle } : {}),
			},
		};
	});

	const edges: Edge[] = layout.edges.map(edge => {
		const style = edgeStyle(edge.kind);
		const followed = traversalStyle(edge.traversed);
		const isLoop = edge.kind === 'loop';
		const isLink = edge.kind === 'substep';
		const handles = isLoop ? LOOP : isLink ? TREE : orderingHandles(edge, direction, rowOf, collapsed);
		const around = handles === AROUND;
		return {
			id: `${edge.kind}:${edge.from}->${edge.to}`,
			// A sub-step link is stored child -> parent (the sub-step "is of" the parent) but drawn down from the parent.
			source: isLink ? edge.to : edge.from,
			target: isLink ? edge.from : edge.to,
			sourceHandle: handles.source,
			targetHandle: handles.target,
			type: style.type,
			...(isLoop ? { pathOptions: { offset: 36, borderRadius: 14 } } : {}),
			...(around ? { pathOptions: { offset: 26, borderRadius: 10 } } : {}),
			// An edge the run did not follow does not animate: it would look active.
			animated: style.animated && edge.traversed !== false,
			label: isLink ? undefined : edge.label,
			style: {
				stroke: style.stroke,
				strokeDasharray: style.dash,
				strokeWidth: followed.width,
				opacity: followed.opacity,
			},
			...(isLink
				? {}
				: { markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke, width: 16, height: 16 } }),
			labelStyle: { fill: 'var(--color-content)', fontSize: 11 },
			labelBgStyle: { fill: 'var(--color-surface)', fillOpacity: 0.95 },
			labelBgPadding: [6, 3],
			labelBgBorderRadius: 4,
			focusable: false,
		};
	});
	return { nodes, edges };
}
