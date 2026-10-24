import { describe, expect, it } from 'vitest';

import { FLOW_CHART_LINK_KEYS, readFlowChartLinkProps } from './FlowChartLinkProps.js';

describe('readFlowChartLinkProps', () => {
	it('resolves target, executionId and flowId against the context', () => {
		expect(
			readFlowChartLinkProps(
				{
					$type: 'flow-chart:FlowChartLink',
					target: 'execution',
					executionId: '$route.id',
					flowId: '$ctx.row.flowId',
				},
				{ $route: { id: 'e1' }, row: { flowId: 'deploy' } }
			)
		).toEqual({ target: 'execution', executionId: 'e1', flowId: 'deploy', unexpectedKeys: [] });
	});

	it('lists every key outside the contract, sorted, ignoring $-prefixed engine keys', () => {
		const props = readFlowChartLinkProps(
			{ $type: 'flow-chart:FlowChartLink', $if: true, target: 'index', variant: 'primary', className: 'x' },
			{}
		);
		expect(props.unexpectedKeys).toEqual(['className', 'variant']);
	});

	it('declares the three keys of the contract', () => {
		expect([...FLOW_CHART_LINK_KEYS]).toEqual(['target', 'executionId', 'flowId']);
	});
});
