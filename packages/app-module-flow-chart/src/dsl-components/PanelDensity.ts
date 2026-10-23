import type { StepPanelDensity } from './StepPanelExperiment.js';

/** Classes that differ between the densities, written out in full: Tailwind finds classes by scanning source text. */
export interface DensityClasses {
	/** Text size of the whole panel. */
	text: string;
	/** Padding of the header and of the body. */
	padding: string;
	/** Gap between the blocks of the body. */
	gap: string;
	/** Tallest a captured output or error block gets before it scrolls. */
	block: string;
}

/** The scrolling part of the panel: it takes the height the header leaves and scrolls past it; the wheel never reaches the chart. */
export const PANEL_BODY_SCROLL_CLASS = 'min-h-0 flex-1 overflow-y-auto overscroll-contain';

export const DENSITY_CLASSES: Record<StepPanelDensity, DensityClasses> = {
	comfortable: { text: 'text-sm', padding: 'px-4 py-3', gap: 'gap-3', block: 'max-h-56' },
	compact: { text: 'text-xs', padding: 'px-3 py-2', gap: 'gap-2', block: 'max-h-32' },
};
