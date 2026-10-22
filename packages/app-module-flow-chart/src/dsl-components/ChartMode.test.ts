import { describe, expect, it } from 'vitest';

import { describeChartMode } from './ChartMode.js';

describe('describeChartMode', () => {
	it('says a chart without a run shows the structure of the flow file, with no status', () => {
		const mode = describeChartMode(undefined);
		expect(mode.title).toBe('Flow structure (no run selected)');
		expect(mode.hint).toMatch(/flow file/);
		expect(mode.hint).toMatch(/no status/);
	});

	it('names the run when there is one', () => {
		const mode = describeChartMode({ executionId: 'exec1' });
		expect(mode.title).toBe('Run exec1');
		expect(mode.hint).toMatch(/status of each step/);
	});

	it('uses ASCII only', () => {
		const texts = [describeChartMode(undefined), describeChartMode({ executionId: 'x' })].flatMap(m => [
			m.title,
			m.hint,
		]);
		for (const text of texts) expect(text).toMatch(/^[\x20-\x7e]+$/);
	});
});
