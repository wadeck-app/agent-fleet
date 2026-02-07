import type { FlowEdge, FlowNode } from '../types';
import type { FlowDefinition, FlowStep } from '../types/flow-engine.types';

/**
 * Convert React Flow format back to FlowDefinition
 */
export function reactFlowToFlowDefinition(
	nodes: FlowNode[],
	edges: FlowEdge[],
	metadata: Omit<FlowDefinition, 'steps'>
): FlowDefinition {
	// Extract steps from nodes (excluding constant nodes)
	const steps = nodes
		.filter(node => node.type !== 'constant')
		.map(node => {
			if (!('step' in node.data) || !node.data.step) {
				throw new Error(`Node ${node.id} is missing step data`);
			}
			const step = { ...node.data.step } as FlowStep;

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
