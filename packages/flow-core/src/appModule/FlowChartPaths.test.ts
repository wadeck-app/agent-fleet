import { describe, expect, it } from 'vitest';

import { FLOW_CHART_INDEX_PATH, chartPathOfExecution, chartPathOfFlow } from './FlowChartPaths.js';

describe('flow-chart page paths', () => {
	it('points the chart index at the page the flow-chart module adds to the Flow menu', () => {
		expect(FLOW_CHART_INDEX_PATH).toBe('/modules/flow-chart/flows');
	});

	it('points the chart of a run at the run page, encoding the id', () => {
		expect(chartPathOfExecution('abc123')).toBe('/modules/flow-chart/flows/runs/abc123');
		expect(chartPathOfExecution('ab 1')).toBe('/modules/flow-chart/flows/runs/ab%201');
	});

	it('points the chart of a flow definition at its page, encoding the id', () => {
		expect(chartPathOfFlow('build task/1')).toBe('/modules/flow-chart/flows/build%20task%2F1');
	});
});
