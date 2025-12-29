import { ModelStepNode } from './ModelStepNode';
import { ScriptStepNode } from './ScriptStepNode';
import { SubFlowStepNode } from './SubFlowStepNode';

export { ModelStepNode, ScriptStepNode, SubFlowStepNode };

export const nodeTypes = {
	model: ModelStepNode,
	script: ScriptStepNode,
	subflow: SubFlowStepNode,
};
