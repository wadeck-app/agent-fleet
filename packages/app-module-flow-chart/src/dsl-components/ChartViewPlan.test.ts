import { describe, expect, it } from 'vitest';

import { MAX_CANVAS_HEIGHT, MAX_FIT_NODES, READABLE_ZOOM, planChartView } from './ChartViewPlan.js';
import { BUILD_GRAPH, chain, node } from './testing/GraphFixtures.js';

const VIEWPORT_HEIGHT = 800;
const BASE_HEIGHT = 520;

describe('planChartView', () => {
	it('lays a short chain out left to right when it stays readable on a wide canvas', () => {
		const plan = planChartView(chain(3), 1400, VIEWPORT_HEIGHT);

		expect(plan).toMatchObject({ direction: 'LR', canvasHeight: BASE_HEIGHT, focus: false });
		expect(plan.fittedZoom).toBeGreaterThanOrEqual(READABLE_ZOOM);
	});

	it('goes vertical, and grows the canvas, when left to right would be unreadable', () => {
		const plan = planChartView(chain(7), 880, VIEWPORT_HEIGHT);

		expect(plan.direction).toBe('TB');
		expect(plan.canvasHeight).toBeGreaterThan(BASE_HEIGHT);
		expect(plan.fittedZoom).toBeGreaterThanOrEqual(READABLE_ZOOM);
		expect(plan.focus).toBe(false);
	});

	it('fits a 25 step chain whole, by growing the canvas rather than zooming out', () => {
		const plan = planChartView(chain(25), 880, VIEWPORT_HEIGHT);

		expect(plan).toMatchObject({ direction: 'TB', focus: false });
		expect(plan.canvasHeight).toBeLessThanOrEqual(MAX_CANVAS_HEIGHT);
	});

	it('focuses a step only for a big flow that stays unreadable even on the tallest canvas, without growing the canvas', () => {
		const plan = planChartView(chain(60), 880, VIEWPORT_HEIGHT);

		expect(plan).toMatchObject({ direction: 'TB', canvasHeight: BASE_HEIGHT, grown: false, focus: true });
		expect(plan.fittedZoom).toBeLessThan(READABLE_ZOOM);
	});

	it('always shows the whole of a small but wide flow, however small it gets', () => {
		const root = node('root');
		const children = Array.from({ length: MAX_FIT_NODES - 1 }, (_, i) => node(`c${i}`));
		const graph = {
			nodes: [root, ...children],
			edges: children.map(c => ({ from: 'root', to: c.id, kind: 'dependency' as const })),
		};

		const plan = planChartView(graph, 880, VIEWPORT_HEIGHT);

		expect(plan.fittedZoom).toBeLessThan(READABLE_ZOOM);
		expect(plan.focus).toBe(false);
	});

	it('honours a direction chosen by the reader', () => {
		expect(planChartView(chain(3), 1400, VIEWPORT_HEIGHT, 'TB').direction).toBe('TB');
		expect(planChartView(chain(7), 880, VIEWPORT_HEIGHT, 'LR').direction).toBe('LR');
	});

	it('never goes under the minimum canvas height on a small window', () => {
		expect(planChartView(BUILD_GRAPH, 1400, 300).canvasHeight).toBe(420);
	});

	it('refuses an empty graph and an unmeasured canvas loudly', () => {
		expect(() => planChartView({ nodes: [], edges: [] }, 880, VIEWPORT_HEIGHT)).toThrow(/no step/);
		expect(() => planChartView(chain(2), 0, VIEWPORT_HEIGHT)).toThrow(/width/);
	});
});
