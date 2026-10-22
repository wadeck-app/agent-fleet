import type { FlowDefinition } from 'flow-engine/types';

import type { ExecutionState } from '../execution/ExecutionState.js';
import type { FlowGraph } from './FlowGraph.js';
import { computeRunPath, isEdgeTraversed } from './RunPath.js';
import { describeStepIO, findDataLinks } from './StepIO.js';

/**
 * The graph with, on each node, its declared inputs/outputs and data-flow links (`io`) and, when an execution is
 * given, the path of the run (`path`) and which edges it followed (`traversed`). Additive: the nodes and edges of
 * `graph` keep every field they had. Throws FlowCoreError on a damaged execution record (see computeRunPath).
 */
export function annotateGraph(graph: FlowGraph, flow: FlowDefinition, execution?: ExecutionState): FlowGraph {
	const definitions = new Map(flow.steps.map(step => [step.id, step]));
	const links = findDataLinks(flow);
	const paths = execution ? computeRunPath(flow, execution) : undefined;
	return {
		...graph,
		nodes: graph.nodes.map(node => {
			const io = {
				...describeStepIO(definitions.get(node.id), execution?.steps[node.id]),
				...(links[node.id] ?? {}),
			};
			return { ...node, io, ...(paths?.[node.id] !== undefined ? { path: paths[node.id] } : {}) };
		}),
		edges: execution
			? graph.edges.map(edge => ({ ...edge, traversed: isEdgeTraversed(edge, execution) }))
			: graph.edges,
	};
}
