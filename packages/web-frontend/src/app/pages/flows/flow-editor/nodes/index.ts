import { ConstantNode } from './ConstantNode';
import { ModelStepNode } from './ModelStepNode';
import { ScriptStepNode } from './ScriptStepNode';
import { SubFlowStepNode } from './SubFlowStepNode';
import { UserInterventionNode } from './UserInterventionNode';

export { ConstantNode, ModelStepNode, ScriptStepNode, SubFlowStepNode, UserInterventionNode };

export const nodeTypes = {
	model: ModelStepNode,
	script: ScriptStepNode,
	subflow: SubFlowStepNode,
	user_intervention: UserInterventionNode,
	constant: ConstantNode,
};
