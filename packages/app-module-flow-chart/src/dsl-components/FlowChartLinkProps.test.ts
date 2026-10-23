import { describe, expect, it } from 'vitest';

import { FLOW_CHART_LINK_KEYS, readFlowChartLinkProps } from './FlowChartLinkProps.js';

describe('readFlowChartLinkProps', () => {
	it('resolves target and executionId against the context', () => {
		expect(
			readFlowChartLinkProps(
				{ $type: 'flow-chart:FlowChartLink', target: 'execution', executionId: '$route.id' },
				{ $route: { id: 'e1' } }
			)
		).toEqual({ target: 'execution', executionId: 'e1', unexpectedKeys: [] });
	});

	it('lists every key outside the contract, sorted, ignoring $-prefixed engine keys', () => {
		const props = readFlowChartLinkProps(
			{ $type: 'flow-chart:FlowChartLink', $if: true, target: 'index', variant: 'primary', className: 'x' },
			{}
		);
		expect(props.unexpectedKeys).toEqual(['className', 'variant']);
	});

	it('declares the two keys of the contract', () => {
		expect([...FLOW_CHART_LINK_KEYS]).toEqual(['target', 'executionId']);
	});
});
