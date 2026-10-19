import type { Edge, Node } from '@xyflow/react';
import { MarkerType } from '@xyflow/react';
import type { FlowGraph, FlowGraphNode } from 'flow-core';

import { edgeStyle } from './EdgeStyle.js';
import { type LayoutDirection, NODE_HEIGHT, NODE_WIDTH, layoutGraph } from './GraphLayout.js';

export interface StepNodeData extends Record<string, unknown> {
	step: FlowGraphNode;
	direction: LayoutDirection;
}

export type StepNode = Node<StepNodeData, 'step'>;

/**
 * xyflow nodes and edges of a flow graph. Flow edges use the `in`/`out` handles (left/right, or top/bottom);
 * a retry loop uses the `loop-in`/`loop-out` handles on the other side so it curves around the flow.
 */
export function toFlowElements(
	graph: FlowGraph,
	direction: LayoutDirection,
	selectedId: string | undefined
): { nodes: StepNode[]; edges: Edge[] } {
	const positions = layoutGraph(graph, direction);
	const nodes: StepNode[] = graph.nodes.map(step => ({
		id: step.id,
		type: 'step',
		position: positions.get(step.id)!,
		width: NODE_WIDTH,
		height: NODE_HEIGHT,
		selected: step.id === selectedId,
		data: { step, direction },
	}));

	const edges: Edge[] = graph.edges.map(edge => {
		const style = edgeStyle(edge.kind);
		const isLoop = edge.kind === 'loop';
		return {
			id: `${edge.kind}:${edge.from}->${edge.to}`,
			source: edge.from,
			target: edge.to,
			sourceHandle: isLoop ? 'loop-out' : 'out',
			targetHandle: isLoop ? 'loop-in' : 'in',
			type: style.type,
			...(isLoop ? { pathOptions: { offset: 36, borderRadius: 14 } } : {}),
			animated: style.animated,
			label: edge.label,
			style: { stroke: style.stroke, strokeDasharray: style.dash, strokeWidth: 1.5 },
			markerEnd: { type: MarkerType.ArrowClosed, color: style.stroke, width: 16, height: 16 },
			labelStyle: { fill: 'var(--color-content)', fontSize: 11 },
			labelBgStyle: { fill: 'var(--color-surface)', fillOpacity: 0.95 },
			labelBgPadding: [6, 3],
			labelBgBorderRadius: 4,
			focusable: false,
		};
	});
	return { nodes, edges };
}
