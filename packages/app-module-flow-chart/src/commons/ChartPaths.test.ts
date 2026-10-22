import { describe, expect, it } from 'vitest';

import { chartPathOfExecution, chartPathOfFlow } from './ChartPaths.js';

describe('ChartPaths', () => {
	it('points at the page of a flow definition, encoding the id', () => {
		expect(chartPathOfFlow('build task/1')).toBe('/modules/flow-chart/flows/build%20task%2F1');
	});

	it('points at the page of a run, encoding the id', () => {
		expect(chartPathOfExecution('ab 1')).toBe('/modules/flow-chart/flows/runs/ab%201');
	});
});
