import { ConditionalEdge } from './ConditionalEdge';
import { DataFlowEdge } from './DataFlowEdge';
import { DependencyEdge } from './DependencyEdge';
import { LoopEdge } from './LoopEdge';

export const edgeTypes = {
	dependency: DependencyEdge,
	loop: LoopEdge,
	conditional: ConditionalEdge,
	dataflow: DataFlowEdge,
};
