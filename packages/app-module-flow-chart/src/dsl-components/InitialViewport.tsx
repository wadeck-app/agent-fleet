import { useEffect, useRef } from 'react';

import { getNodesBounds, getViewportForBounds, useReactFlow, useStore } from '@xyflow/react';

import { FIT_OPTIONS } from './ChartViewPlan.js';
import { focusViewport } from './FocusViewport.js';
import type { LayoutDirection } from './GraphLayout.js';

/**
 * Fits the whole chart once the nodes are measured. When the plan says the chart cannot be readable even fitted
 * on the tallest canvas (`focus`), it opens at the minimum readable zoom, anchored on the step that matters (first
 * failed, running, or first) with the rest of the flow ahead of it, and says so; "Fit to view" shows everything.
 */
export function InitialViewport({
	focusId,
	focus,
	direction,
	onFocused,
}: {
	focusId: string;
	focus: boolean;
	direction: LayoutDirection;
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
		void flow.setViewport(
			focusViewport(direction, { width, height }, getNodesBounds(nodes), {
				x: target.position.x,
				y: target.position.y,
				width: target.width ?? 0,
				height: target.height ?? 0,
			})
		);
		onFocused(true);
	}, [width, height, flow, focusId, focus, direction, onFocused]);
	return null;
}
