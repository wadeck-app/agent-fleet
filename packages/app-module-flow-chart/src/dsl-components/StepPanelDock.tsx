import { useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';

import { DrawerResizeHandle } from './DrawerResizeHandle.js';
import type { StepPanelLayout } from './StepPanelExperiment.js';

export const DRAWER_DEFAULT_WIDTH = 360;
export const DRAWER_MIN_WIDTH = 280;
export const DRAWER_MAX_WIDTH = 640;

// Written out in full: Tailwind finds classes by scanning source text.
// Floating: the slot is as tall as the chart (inset-y), the panel inside never passes it; the empty part of the slot lets the chart through.
const FLOATING_SLOT_CLASS =
	'mt-3 lg:pointer-events-none lg:absolute lg:inset-y-2 lg:right-2 lg:mt-0 lg:flex lg:w-80 lg:flex-col';
// Drawer: a column of the row, as tall as the chart because the panel is absolutely placed in it and adds no height.
const DRAWER_SLOT_CLASS = 'relative lg:w-[var(--step-drawer-width)] lg:shrink-0';
const DRAWER_FILL_CLASS = 'lg:absolute lg:inset-0 lg:pl-2';

/**
 * Where the step panel sits relative to the chart. Wide windows: floating over the chart (`overlay`, `tabs`,
 * `accordion`) or docked right of it (`drawer`, the chart narrows). Narrow windows: below the chart. In every case the
 * panel is boxed by the height of the chart, so it never passes its frame. Nothing is reserved while no step is selected.
 */
export function StepPanelDock({
	layout,
	canvas,
	panel,
}: {
	layout: StepPanelLayout;
	canvas: ReactNode;
	panel: ReactNode | undefined;
}) {
	// Kept here, not in the drawer: closing the panel must not forget the width the reader chose.
	const [drawerWidth, setDrawerWidth] = useState(DRAWER_DEFAULT_WIDTH);
	if (layout === 'drawer') {
		const slotStyle = { '--step-drawer-width': `${drawerWidth}px` } as CSSProperties;
		return (
			<div data-testid="panel-dock" className="flex flex-col gap-3 lg:flex-row lg:gap-0">
				<div className="min-w-0 flex-1">{canvas}</div>
				{panel !== undefined && (
					<div data-testid="panel-slot" className={DRAWER_SLOT_CLASS} style={slotStyle}>
						<DrawerResizeHandle
							value={drawerWidth}
							min={DRAWER_MIN_WIDTH}
							max={DRAWER_MAX_WIDTH}
							onChange={setDrawerWidth}
						/>
						<div data-testid="panel-fill" className={DRAWER_FILL_CLASS}>
							{panel}
						</div>
					</div>
				)}
			</div>
		);
	}
	return (
		<div data-testid="panel-dock" className="relative">
			{canvas}
			{panel !== undefined && (
				<div data-testid="panel-slot" className={FLOATING_SLOT_CLASS}>
					{panel}
				</div>
			)}
		</div>
	);
}
