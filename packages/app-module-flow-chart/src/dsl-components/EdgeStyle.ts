import type { FlowGraphEdgeKind } from 'flow-core';

export interface EdgeStyle {
	/** A theme variable: the stroke follows the light/dark theme. */
	stroke: string;
	/** SVG dash pattern; none for a solid line. */
	dash: string | undefined;
	animated: boolean;
	/** xyflow edge type. */
	type: 'smoothstep';
}

const STYLES: Record<FlowGraphEdgeKind, EdgeStyle> = {
	dependency: { stroke: 'var(--color-muted)', dash: undefined, animated: false, type: 'smoothstep' },
	conditional: { stroke: 'var(--color-content)', dash: '6 4', animated: false, type: 'smoothstep' },
	loop: { stroke: 'var(--color-warning)', dash: '4 4', animated: true, type: 'smoothstep' },
	substep: { stroke: 'var(--color-primary)', dash: '2 3', animated: false, type: 'smoothstep' },
	sequence: { stroke: 'var(--color-muted)', dash: '10 3 2 3', animated: false, type: 'smoothstep' },
};

const KINDS = Object.keys(STYLES).join(', ');

export function edgeStyle(kind: FlowGraphEdgeKind): EdgeStyle {
	const style = (STYLES as Record<string, EdgeStyle | undefined>)[kind];
	if (style === undefined) {
		throw new Error(`Unknown edge kind '${String(kind)}': expected one of ${KINDS}. Add it to EdgeStyle.ts.`);
	}
	return style;
}

export const EDGE_LEGEND: readonly { kind: FlowGraphEdgeKind; description: string }[] = [
	{ kind: 'dependency', description: 'depends on' },
	{ kind: 'conditional', description: 'runs only when the condition holds' },
	{ kind: 'loop', description: 'on failure, goes back (retry loop)' },
	{ kind: 'substep', description: 'sub-step (indented under its parent)' },
	{ kind: 'sequence', description: 'recorded order (dependencies unknown: flow file changed or injected steps)' },
];

export interface TraversalStyle {
	opacity: number;
	width: number;
}

/**
 * How an edge looks once the run is known: followed edges are heavy, edges the run did not follow are faded.
 * `undefined` is a graph without a run (nothing to tell apart).
 */
export function traversalStyle(traversed: boolean | undefined): TraversalStyle {
	if (traversed === undefined) {
		return { opacity: 1, width: 1.5 };
	}
	return traversed ? { opacity: 1, width: 2.5 } : { opacity: 0.3, width: 1.5 };
}
