import type { ConstantNodeData } from '../nodes/ConstantNode';
import type { FlowNode } from '../types';
import type { VariableType } from '../types/flow-engine.types';

/**
 * Check if sourceType can connect to targetType
 */
export function areTypesCompatible(sourceType: VariableType, targetType: VariableType): boolean {
	// Exact match always works
	if (sourceType === targetType) return true;

	// Compatible conversions
	if (targetType === 'string') return true; // Everything can convert to string
	if (targetType === 'object') return true; // Everything can be wrapped in object

	// number → boolean (truthy/falsy)
	if (sourceType === 'number' && targetType === 'boolean') return true;

	// string → number (if parseable)
	if (sourceType === 'string' && targetType === 'number') return true;

	// string → boolean (if 'true'/'false')
	if (sourceType === 'string' && targetType === 'boolean') return true;

	// No other conversions allowed
	return false;
}

/**
 * Get type from handle ID on a node
 */
export function getHandleType(handleId: string, node: FlowNode): VariableType | null {
	// Check if it's a constant node
	if (node.type === 'constant') {
		return (node.data as unknown as ConstantNodeData).type;
	}

	// Check input ports
	if (node.data.inputPorts) {
		const port = node.data.inputPorts.find(p => p.id === handleId);
		if (port) return port.type;
	}

	// Check output ports
	if (node.data.outputPorts) {
		const port = node.data.outputPorts.find(p => p.id === handleId);
		if (port) return port.type;
	}

	return null;
}
