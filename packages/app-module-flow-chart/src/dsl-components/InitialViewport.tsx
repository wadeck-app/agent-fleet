import { useEffect, useRef } from 'react';

import { getNodesBounds, getViewportForBounds, useReactFlow, useStore } from '@xyflow/react';

import { FIT_OPTIONS } from './ChartViewPlan.js';

const FOCUS_ZOOM = 0.85;
const FOCUS_TOP_SHARE = 0.15;

/**
 * Fits the whole chart once the nodes are measured. When the plan says the chart cannot be readable even fitted
 * on the tallest canvas (`focus`), it opens on the step that matters (first failed, running, or first) and says
 * so; "Fit to view" shows everything.
 */
export function InitialViewport({
	focusId,
	focus,
	onFocused,
}: {
	focusId: string;
	focus: boolean;
	onFocused: (focusedOn: boolean) => void;
}) {
	const flow = useReactFlow();
	const width = useStore(state => state.width);
	const height = useStore(state => state.height);
	const done = useRef(false);
	useEffect(() => {
		// Wait for the canvas to be measured; the node sizes are known from the layout.
		if (width === 0 || height === 0 || done.current) {
			return;
		}
		done.current = true;
		const nodes = flow.getNodes();
		const fitted = getViewportForBounds(
			getNodesBounds(nodes),
			width,
			height,
			FIT_OPTIONS.minZoom,
			FIT_OPTIONS.maxZoom,
			FIT_OPTIONS.padding
		);
		const target = nodes.find(node => node.id === focusId);
		if (!focus || target === undefined) {
			void flow.setViewport(fitted);
			return;
		}
		// The step is centered horizontally and sits in the upper part, so its successors are visible below it.
		const centerX = target.position.x + (target.width ?? 0) / 2;
		const topY = target.position.y;
		void flow.setViewport({
			x: width / 2 - centerX * FOCUS_ZOOM,
			y: height * FOCUS_TOP_SHARE - topY * FOCUS_ZOOM,
			zoom: FOCUS_ZOOM,
		});
		onFocused(true);
	}, [width, height, flow, focusId, focus, onFocused]);
	return null;
}
