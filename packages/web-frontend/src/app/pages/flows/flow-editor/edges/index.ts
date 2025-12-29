import { ConditionalEdge } from './ConditionalEdge';
import { DependencyEdge } from './DependencyEdge';
import { LoopEdge } from './LoopEdge';

export { ConditionalEdge, DependencyEdge, LoopEdge };

export const edgeTypes = {
	dependency: DependencyEdge,
	loop: LoopEdge,
	conditional: ConditionalEdge,
};
