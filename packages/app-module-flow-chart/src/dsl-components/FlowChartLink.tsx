import { ButtonLink } from '@wadeck-app/dsl-ui';
import { FLOW_ACTION_BUTTON_STYLE, FLOW_CHART_INDEX_PATH, chartPathOfExecution } from 'flow-core/graph-tree';

import { FLOW_CHART_LINK_KEYS, type FlowChartLinkProps } from './FlowChartLinkProps.js';

function refusal(children: string) {
	return (
		<span role="alert" className="text-xs text-danger-text">
			{children}
		</span>
	);
}

/**
 * The one component the flow module's action slots accept (flow-core FLOW_ACTION_SLOT_ACCEPTS): a navigating button
 * whose style is not a prop but the FLOW_ACTION_BUTTON_STYLE constant, so every action next to an execution looks the
 * same. The DSL cannot concatenate the id into a path, hence a component. Anything wrong is shown, not hidden or
 * ignored: the contributed view is wired wrongly, and a key outside the contract (className, variant...) is refused.
 */
export function FlowChartLink({ target, executionId, unexpectedKeys }: FlowChartLinkProps) {
	if (unexpectedKeys.length > 0) {
		return refusal(
			`flow-chart:FlowChartLink does not accept ${unexpectedKeys.join(', ')}: its style is fixed by the flow module. Keep only ${FLOW_CHART_LINK_KEYS.join(', ')}.`
		);
	}
	if (target === 'index') {
		return <ButtonLink to={FLOW_CHART_INDEX_PATH} label="Flow charts" {...FLOW_ACTION_BUTTON_STYLE} />;
	}
	if (target !== 'execution') {
		return refusal(
			`flow-chart:FlowChartLink needs target: execution (with executionId: $route.id) or target: index, got ${JSON.stringify(target)}.`
		);
	}
	if (typeof executionId !== 'string' || executionId === '') {
		return refusal(
			'flow-chart: no execution id reached the "See flow chart" button (expected executionId: $route.id in the view).'
		);
	}
	return <ButtonLink to={chartPathOfExecution(executionId)} label="See flow chart" {...FLOW_ACTION_BUTTON_STYLE} />;
}
