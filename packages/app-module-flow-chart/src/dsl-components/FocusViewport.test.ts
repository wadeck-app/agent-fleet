import { describe, expect, it } from 'vitest';

import { READABLE_ZOOM } from './ChartViewPlan.js';
import { focusViewport } from './FocusViewport.js';

const CANVAS = { width: 600, height: 700 };
const NODE = { width: 240, height: 76 };

describe('focusViewport', () => {
	it('opens at the readable zoom', () => {
		const viewport = focusViewport('TB', CANVAS, { x: 0, y: 0, width: 240, height: 4000 }, { x: 0, y: 0, ...NODE });
		expect(viewport.zoom).toBe(READABLE_ZOOM);
	});

	it('puts the step near the top of a vertical chart, with its successors below', () => {
		const viewport = focusViewport(
			'TB',
			CANVAS,
			{ x: 0, y: 0, width: 240, height: 4000 },
			{ x: 0, y: 1000, ...NODE }
		);
		expect(1000 * viewport.zoom + viewport.y).toBeCloseTo(CANVAS.height * 0.12);
	});

	it('centers a chart narrower than the canvas', () => {
		const viewport = focusViewport('TB', CANVAS, { x: 0, y: 0, width: 240, height: 4000 }, { x: 0, y: 0, ...NODE });
		expect(120 * viewport.zoom + viewport.x).toBeCloseTo(CANVAS.width / 2);
	});

	it('never scrolls past the left edge of a chart wider than the canvas', () => {
		const viewport = focusViewport('TB', CANVAS, { x: 0, y: 0, width: 1400, height: 900 }, { x: 0, y: 0, ...NODE });
		expect(viewport.x).toBeLessThanOrEqual(16);
		expect(viewport.x).toBeGreaterThan(0);
	});

	it('never scrolls past the right edge of a chart wider than the canvas', () => {
		const viewport = focusViewport(
			'TB',
			CANVAS,
			{ x: 0, y: 0, width: 1400, height: 900 },
			{ x: 1160, y: 0, ...NODE }
		);
		expect(1400 * viewport.zoom + viewport.x).toBeGreaterThanOrEqual(CANVAS.width - 16);
	});

	it('puts the step near the left of a horizontal chart', () => {
		const viewport = focusViewport(
			'LR',
			CANVAS,
			{ x: 0, y: 0, width: 4000, height: 240 },
			{ x: 800, y: 0, ...NODE }
		);
		expect(800 * viewport.zoom + viewport.x).toBeCloseTo(CANVAS.width * 0.12);
	});
});
