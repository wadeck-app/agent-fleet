import { ButtonLink } from '@wadeck-app/dsl-ui';
import { FLOW_ACTION_BUTTON_STYLE } from 'flow-core/graph-tree';

import { type FetchFunction, type GraphTarget, useFlowGraph } from './FlowGraphLoader.js';
import { FlowGraphView } from './FlowGraphView.js';

/** The executions list of the flow module (its manifest path). */
const EXECUTIONS_PATH = '/modules/flow/executions';

interface FlowGraphProps {
	target: GraphTarget;
	fetchFunction?: FetchFunction;
}

/** Loads the graph of a run or of a flow definition and draws it. Loading and failures say what happened and what to do. */
export function FlowGraph({ target, fetchFunction }: FlowGraphProps) {
	const graph = useFlowGraph(target, fetchFunction);

	if (graph.state === 'loading') {
		return (
			<div role="status" className="rounded-lg border border-border bg-surface p-6 text-sm text-muted">
				Loading the flow chart...
			</div>
		);
	}
	if (graph.state === 'not-found') {
		return (
			<section
				role="status"
				aria-label="Execution not found"
				className="flex flex-col items-start gap-3 rounded-lg border border-border bg-surface p-6 text-sm text-content"
			>
				<h2 className="text-lg font-semibold">Execution not found</h2>
				<p>{graph.message}</p>
				<ButtonLink to={EXECUTIONS_PATH} label="See all executions" {...FLOW_ACTION_BUTTON_STYLE} />
			</section>
		);
	}
	if (graph.state === 'error') {
		return (
			<div role="alert" className="rounded-lg border border-danger bg-danger-bg p-4 text-sm text-danger-text">
				<div className="mb-1 font-semibold">The flow chart cannot be shown</div>
				<div className="break-words">{graph.message}</div>
			</div>
		);
	}
	return <FlowGraphView result={graph.result} refreshError={graph.refreshError} />;
}
