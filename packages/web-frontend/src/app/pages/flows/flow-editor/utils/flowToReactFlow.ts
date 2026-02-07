import type { FlowEdge, FlowNode } from '../types';
import type { FlowDefinition, FlowStep } from '../types/flow-engine.types';
import { applyDagreLayout } from './layoutAlgorithms';

/**
 * Convert FlowDefinition to React Flow format with auto-layout
 */
export function flowDefinitionToReactFlow(flow: FlowDefinition): {
	nodes: FlowNode[];
	edges: FlowEdge[];
} {
	// Create nodes first with temporary positions
	const nodes: FlowNode[] = flow.steps.map(step => {
		return {
			id: step.id,
			type: step.type, // 'model', 'script', 'subflow'
			position: { x: 0, y: 0 }, // Temporary, will be updated by dagre
			data: {
				step,
				validationIssues: [],
			},
		};
	});

	// Create edges from dependencies
	// Separate conditional edges (with 'when' clause) from normal dependencies
	const edges: FlowEdge[] = [];

	flow.steps.forEach(step => {
		if (!step.depends || step.depends.length === 0) return;

		// If step has a 'when' condition, create conditional edges
		if (step.when) {
			step.depends.forEach(depId => {
				edges.push({
					id: `${depId}->conditional->${step.id}`,
					source: depId,
					sourceHandle: 'right',
					target: step.id,
					targetHandle: 'left',
					type: 'conditional',
					data: {
						edgeType: 'conditional' as const,
						condition: step.when,
					},
				});
			});
		} else {
			// Normal dependency edges
			step.depends.forEach(depId => {
				edges.push({
					id: `${depId}->${step.id}`,
					source: depId,
					sourceHandle: 'right',
					target: step.id,
					targetHandle: 'left',
					type: 'dependency',
					data: { edgeType: 'dependency' as const },
				});
			});
		}
	});

	// Create edges from onFailure.goto (loops)
	// Use bottom handles for loop edges to route failures below the normal flow
	flow.steps
		.filter(step => step.onFailure?.goto)
		.forEach(step => {
			edges.push({
				id: `${step.id}->loop->${step.onFailure!.goto}`,
				source: step.id,
				sourceHandle: 'bottom',
				target: step.onFailure!.goto!,
				targetHandle: 'bottom',
				type: 'loop',
				animated: true,
				data: {
					edgeType: 'loop' as const,
					loopConfig: step.onFailure,
				},
			});
		});

	// Apply dagre layout to position nodes optimally and avoid edge crossings
	const layoutedNodes = applyDagreLayout(nodes, edges);

	return {
		nodes: layoutedNodes,
		edges,
	};
}

/**
 * Convert React Flow format back to FlowDefinition
 */
export function reactFlowToFlowDefinition(
	baseFlow: FlowDefinition,
	nodes: FlowNode[],
	edges: FlowEdge[]
): FlowDefinition {
	// CRITICAL: Exclude data flow edges and constant nodes (UI-only, not persisted to backend)
	const backendEdges = edges.filter(e => e.data?.edgeType !== 'dataflow');
	const backendNodes = nodes.filter(n => n.type !== 'constant');

	// Build dependency map from edges
	const dependencyMap = new Map<string, string[]>();
	const conditionalMap = new Map<string, string>();
	const loopMap = new Map<string, any>();

	backendEdges.forEach(edge => {
		if (edge.data?.edgeType === 'dependency') {
			const deps = dependencyMap.get(edge.target) || [];
			deps.push(edge.source);
			dependencyMap.set(edge.target, deps);
		} else if (edge.data?.edgeType === 'conditional') {
			const deps = dependencyMap.get(edge.target) || [];
			deps.push(edge.source);
			dependencyMap.set(edge.target, deps);
			// Store the condition for this target node
			if (edge.data.condition) {
				conditionalMap.set(edge.target, edge.data.condition);
			}
		} else if (edge.data?.edgeType === 'loop') {
			loopMap.set(edge.source, edge.data.loopConfig);
		}
	});

	// Convert nodes back to steps (only backend nodes, excluding constants)
	const steps: FlowStep[] = backendNodes.map(node => {
		if (!('step' in node.data) || !node.data.step) {
			throw new Error(`Node ${node.id} is missing step data`);
		}
		const step = { ...node.data.step } as FlowStep;

		// Add dependencies from edges
		const deps = dependencyMap.get(node.id);
		if (deps && deps.length > 0) {
			step.depends = deps;
		} else {
			delete step.depends;
		}

		// Add condition from conditional edges
		const condition = conditionalMap.get(node.id);
		if (condition) {
			step.when = condition;
		}

		// Add loop config from edges
		const loopConfig = loopMap.get(node.id);
		if (loopConfig) {
			step.onFailure = loopConfig;
		}

		return step;
	});

	// Return updated flow definition
	return {
		...baseFlow,
		steps,
	};
}
