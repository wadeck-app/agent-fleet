// violations-suppress: ts/no-barrel-index app-core-cli requires src/dsl-components/index.ts as the DSL library entry (default export of the component registry entries); it is not a re-export barrel
import { createElement } from 'react';

import { type ComponentRegistryEntry, resolveExpressionValue } from '@wadeck-app/dsl-renderer';

import { FlowChartLink } from './FlowChartLink.js';
import { FLOW_CHART_LINK_KEYS, readFlowChartLinkProps } from './FlowChartLinkProps.js';
import { FlowGraph } from './FlowGraph.js';
import type { GraphTarget } from './FlowGraphLoader.js';

function targetOf(node: Record<string, unknown>, ctx: Record<string, unknown>): GraphTarget | undefined {
	const executionId = resolveExpressionValue(node['executionId'], ctx);
	const flowId = resolveExpressionValue(node['flowId'], ctx);
	if (typeof executionId === 'string' && executionId !== '') {
		return { executionId };
	}
	if (typeof flowId === 'string' && flowId !== '') {
		return { flowId };
	}
	return undefined;
}

// Registered by app-core as `flow-chart:FlowGraph` and `flow-chart:FlowChartLink`.
const entries: ComponentRegistryEntry[] = [
	{
		name: 'FlowGraph',
		category: 'composite',
		tags: ['flow', 'graph', 'chart'],
		knownKeys: ['executionId', 'flowId'],
		render: ({ node, ctx }) => {
			const target = targetOf(node, ctx);
			if (target === undefined) {
				return createElement(
					'div',
					{
						role: 'alert',
						className: 'rounded-lg border border-danger bg-danger-bg p-4 text-sm text-danger-text',
					},
					'flow-chart:FlowGraph needs executionId or flowId (for example executionId: $route.id), and none resolved to a value.'
				);
			}
			// A new target is a new chart: the key resets the selection and the loader.
			return createElement(FlowGraph, { key: JSON.stringify(target), target });
		},
	},
	{
		name: 'FlowChartLink',
		category: 'atomic',
		tags: ['flow', 'chart', 'link'],
		knownKeys: [...FLOW_CHART_LINK_KEYS],
		render: ({ node, ctx }) => createElement(FlowChartLink, readFlowChartLinkProps(node, ctx)),
	},
];

export default entries;
