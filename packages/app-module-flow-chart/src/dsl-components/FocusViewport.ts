import { READABLE_ZOOM } from './ChartViewPlan.js';
import type { LayoutDirection } from './GraphLayout.js';

/** Share of the canvas kept before the anchored step, along the flow direction. */
export const FOCUS_LEAD_SHARE = 0.12;
const EDGE_PADDING = 16;

interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

/**
 * Offset of the chart on the axis across the flow, kept inside the chart: the chart is centered when it is narrower
 * than the canvas, else the step is centered but the view never scrolls past the chart's own edges.
 */
function acrossOffset(canvas: number, boundsStart: number, boundsSize: number, center: number): number {
	const atStart = EDGE_PADDING - boundsStart * READABLE_ZOOM;
	const atEnd = canvas - EDGE_PADDING - (boundsStart + boundsSize) * READABLE_ZOOM;
	if (atStart <= atEnd) {
		return (atStart + atEnd) / 2;
	}
	return Math.min(atStart, Math.max(atEnd, canvas / 2 - center * READABLE_ZOOM));
}

/**
 * The viewport that opens a chart too big to be readable at READABLE_ZOOM: the step sits near the start of the flow
 * direction (left, or top) so its successors follow it, and is centered across it without leaving the chart.
 */
export function focusViewport(
	direction: LayoutDirection,
	canvas: { width: number; height: number },
	bounds: Rect,
	step: Rect
): { x: number; y: number; zoom: number } {
	if (direction === 'LR') {
		return {
			x: canvas.width * FOCUS_LEAD_SHARE - step.x * READABLE_ZOOM,
			y: acrossOffset(canvas.height, bounds.y, bounds.height, step.y + step.height / 2),
			zoom: READABLE_ZOOM,
		};
	}
	return {
		x: acrossOffset(canvas.width, bounds.x, bounds.width, step.x + step.width / 2),
		y: canvas.height * FOCUS_LEAD_SHARE - step.y * READABLE_ZOOM,
		zoom: READABLE_ZOOM,
	};
}
