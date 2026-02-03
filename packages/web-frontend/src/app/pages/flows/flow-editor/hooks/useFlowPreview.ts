import { useMemo } from 'react';

import type { FlowEdge, FlowNode } from '../types';
import type { FlowDefinition } from '../types/flow-engine.types';
import { reactFlowToFlowDefinition } from '../utils/flowToReactFlow';

/**
 * Computes a preview FlowDefinition from current visual editor state
 * This preview reflects what WILL be saved when user clicks Save
 */
export function useFlowPreview(
	baseFlow: FlowDefinition | null,
	nodes: FlowNode[],
	edges: FlowEdge[]
): FlowDefinition | null {
	return useMemo(() => {
		if (!baseFlow) return null;
		return reactFlowToFlowDefinition(baseFlow, nodes, edges);
	}, [baseFlow, nodes, edges]);
}
