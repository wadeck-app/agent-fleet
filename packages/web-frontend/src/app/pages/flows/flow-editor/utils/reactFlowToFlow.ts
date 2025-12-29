import type { FlowEdge, FlowNode } from '../types';
import type { FlowDefinition } from '../types/flow-engine.types';

/**
 * Convert React Flow format back to FlowDefinition
 */
export function reactFlowToFlowDefinition(
	nodes: FlowNode[],
	edges: FlowEdge[],
	metadata: Omit<FlowDefinition, 'steps'>
): FlowDefinition {
	// Extract steps from nodes
	const steps = nodes.map(node => {
		const step = { ...node.data.step };

		// Rebuild depends array from dependency edges
		const dependencyEdges = edges.filter(e => e.target === node.id && e.data?.edgeType === 'dependency');
		step.depends = dependencyEdges.length > 0 ? dependencyEdges.map(e => e.source) : undefined;

		// Rebuild onFailure.goto from loop edges
		const loopEdge = edges.find(e => e.source === node.id && e.data?.edgeType === 'loop');
		if (loopEdge && loopEdge.data?.loopConfig) {
			step.onFailure = loopEdge.data.loopConfig;
		}

		return step;
	});

	return {
		...metadata,
		steps,
	};
}
