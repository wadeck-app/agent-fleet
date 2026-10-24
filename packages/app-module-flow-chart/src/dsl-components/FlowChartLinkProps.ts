import { resolveExpressionValue } from '@wadeck-app/dsl-renderer';

/** The keys a contribution of `flow-chart:FlowChartLink` may carry: nothing that styles the button. */
export const FLOW_CHART_LINK_KEYS = ['target', 'executionId', 'flowId'] as const;

export interface FlowChartLinkProps {
	target: unknown;
	executionId: unknown;
	flowId: unknown;
	/** Keys of the node outside the contract (the platform checks only the root $type, never the props). */
	unexpectedKeys: string[];
}

/** Reads the node of a contribution: the declared values resolved against the context, and the undeclared keys. */
export function readFlowChartLinkProps(
	node: Record<string, unknown>,
	ctx: Record<string, unknown>
): FlowChartLinkProps {
	const declared: readonly string[] = FLOW_CHART_LINK_KEYS;
	return {
		target: resolveExpressionValue(node['target'], ctx),
		executionId: resolveExpressionValue(node['executionId'], ctx),
		flowId: resolveExpressionValue(node['flowId'], ctx),
		// "$type", "$if" and the like belong to the engine, not to the contribution.
		unexpectedKeys: Object.keys(node)
			.filter(key => !key.startsWith('$') && !declared.includes(key))
			.sort(),
	};
}
