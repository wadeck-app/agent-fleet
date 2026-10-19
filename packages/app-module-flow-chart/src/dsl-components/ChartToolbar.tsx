import { ButtonAction, IconButton } from '@wadeck-app/dsl-ui';
import { useReactFlow } from '@xyflow/react';

import { FIT_OPTIONS } from './ChartViewPlan.js';
import type { LayoutDirection } from './GraphLayout.js';

/** Above the canvas, not over it: a floating toolbar covers the first steps of the chart. */
export function ChartToolbar({
	direction,
	onToggleDirection,
	onFit,
	hint,
}: {
	direction: LayoutDirection;
	onToggleDirection: () => void;
	onFit: () => void;
	hint: string | undefined;
}) {
	const flow = useReactFlow();
	return (
		<div className="flex flex-wrap items-center justify-between gap-2">
			<p className="min-w-0 text-xs text-muted">{hint}</p>
			<div className="flex flex-wrap gap-1" role="toolbar" aria-label="Chart controls">
				<IconButton
					icon="+"
					aria-label="Zoom in"
					variant="secondary"
					size="icon-sm"
					onClick={() => void flow.zoomIn()}
				/>
				<IconButton
					icon="-"
					aria-label="Zoom out"
					variant="secondary"
					size="icon-sm"
					onClick={() => void flow.zoomOut()}
				/>
				<ButtonAction
					label="Fit to view"
					variant="secondary"
					size="sm"
					onClick={() => {
						onFit();
						void flow.fitView({ ...FIT_OPTIONS, duration: 200 });
					}}
				/>
				<ButtonAction
					label={direction === 'LR' ? 'Switch to vertical layout' : 'Switch to horizontal layout'}
					variant="secondary"
					size="sm"
					onClick={onToggleDirection}
				/>
			</div>
		</div>
	);
}
