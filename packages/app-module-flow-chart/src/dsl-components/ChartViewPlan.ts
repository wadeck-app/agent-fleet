import type { FlowGraph } from 'flow-core';

import { type LayoutDirection, NODE_HEIGHT, NODE_WIDTH, layoutGraph } from './GraphLayout.js';

// Below this zoom the step text is unreadable: the chart then opens on one step instead of on the whole flow.
export const READABLE_ZOOM = 0.6;
/** Share of the canvas kept free on each side when fitting. */
export const FIT_PADDING = 0.1;
export const MAX_FIT_ZOOM = 1.2;
/** Options of every "fit the whole chart" viewport computation (initial view and the Fit to view control). */
export const FIT_OPTIONS = { padding: FIT_PADDING, minZoom: 0.1, maxZoom: MAX_FIT_ZOOM };
const MIN_CANVAS_HEIGHT = 420;
const CANVAS_VIEWPORT_SHARE = 0.65;
/** A taller canvas than this is a page of its own; beyond it the chart opens on one step. */
export const MAX_CANVAS_HEIGHT = 2600;
/** Up to this many steps the whole chart is always shown (fitted, however small); beyond it, a flow too big to be readable opens on one step. */
export const MAX_FIT_NODES = 25;

export interface ChartViewPlan {
	direction: LayoutDirection;
	/** Canvas height in px: a vertical chart grows it so the whole flow stays readable instead of shrinking. */
	canvasHeight: number;
	/** The canvas is taller than the default one: the page scrolls past it, so the wheel must not zoom the chart. */
	grown: boolean;
	/** Zoom at which the whole chart fits the canvas. */
	fittedZoom: number;
	/** More than MAX_FIT_NODES steps that cannot be readable even on the tallest canvas: open on the step that matters instead. */
	focus: boolean;
}

function fitZoom(graph: FlowGraph, direction: LayoutDirection, width: number, height: number): number {
	const positions = [...layoutGraph(graph, direction).values()];
	const boundsWidth = Math.max(...positions.map(p => p.x)) - Math.min(...positions.map(p => p.x)) + NODE_WIDTH;
	const boundsHeight = Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y)) + NODE_HEIGHT;
	const usable = 1 - 2 * FIT_PADDING;
	return Math.min(MAX_FIT_ZOOM, (width * usable) / boundsWidth, (height * usable) / boundsHeight);
}

function planFor(graph: FlowGraph, direction: LayoutDirection, width: number, baseHeight: number): ChartViewPlan {
	let canvasHeight = baseHeight;
	if (direction === 'TB') {
		const positions = [...layoutGraph(graph, 'TB').values()];
		const boundsHeight = Math.max(...positions.map(p => p.y)) - Math.min(...positions.map(p => p.y)) + NODE_HEIGHT;
		const needed = Math.ceil((boundsHeight * READABLE_ZOOM) / (1 - 2 * FIT_PADDING));
		canvasHeight = Math.min(MAX_CANVAS_HEIGHT, Math.max(baseHeight, needed));
	}
	const fittedZoom = fitZoom(graph, direction, width, canvasHeight);
	const focus = graph.nodes.length > MAX_FIT_NODES && fittedZoom < READABLE_ZOOM;
	// Opening on one step centers it in the canvas: a grown canvas would only add empty space around it.
	if (focus) {
		return { direction, canvasHeight: baseHeight, grown: false, fittedZoom, focus };
	}
	return { direction, canvasHeight, grown: canvasHeight > baseHeight, fittedZoom, focus };
}

/**
 * Decides how the chart first appears: the layout direction (left to right when that is readable, else vertical),
 * the canvas height, and whether the whole flow fits at a readable zoom or the chart must open on one step.
 * `forcedDirection` is the reader's choice, which only changes the other outputs.
 */
export function planChartView(
	graph: FlowGraph,
	canvasWidth: number,
	viewportHeight: number,
	forcedDirection?: LayoutDirection
): ChartViewPlan {
	if (graph.nodes.length === 0) {
		throw new Error('Cannot plan a chart with no step: the caller must handle the empty graph.');
	}
	if (!(canvasWidth > 0)) {
		throw new Error(`Cannot plan the chart: the canvas width is ${canvasWidth}px, it must be measured first.`);
	}
	const baseHeight = Math.max(MIN_CANVAS_HEIGHT, Math.round(viewportHeight * CANVAS_VIEWPORT_SHARE));
	if (forcedDirection !== undefined) {
		return planFor(graph, forcedDirection, canvasWidth, baseHeight);
	}

	const horizontal = planFor(graph, 'LR', canvasWidth, baseHeight);
	if (horizontal.fittedZoom >= READABLE_ZOOM) {
		return horizontal;
	}
	const vertical = planFor(graph, 'TB', canvasWidth, baseHeight);
	return vertical.fittedZoom > horizontal.fittedZoom ? vertical : horizontal;
}
