import { isDev, useAbExperiments, useAbTest, useRegisterAbTests } from '@wadeck-app/dsl-ui';

/** A/B test of the layout of the step details panel; `initial` is the baseline (a floating panel with its own scroll). */
export const STEP_PANEL_EXPERIMENT_ID = 'flow-chart-step-panel';
/** Independent second axis: how much room the panel text and the captured blocks take. */
export const STEP_PANEL_DENSITY_ID = 'flow-chart-step-panel-density';

export type StepPanelLayout = 'overlay' | 'drawer' | 'tabs' | 'accordion';
export type StepPanelDensity = 'comfortable' | 'compact';

export interface StepPanelChoice {
	layout: StepPanelLayout;
	density: StepPanelDensity;
}

const INITIAL_LAYOUT: StepPanelLayout = 'overlay';
const INITIAL_DENSITY: StepPanelDensity = 'comfortable';

/**
 * The layout and density to draw the panel with. Experiments run only where the shell enabled them (its dock is
 * mounted and on, or, without a dock, a development build): everywhere else the baseline is used whatever a
 * browser stored or a link asked for (dsl-ui's `useAbTest` itself always reads the storage and the URL).
 */
export function useStepPanelExperiment(): StepPanelChoice {
	const host = useAbExperiments();
	const enabled = host === null ? isDev() : host.enabled;
	const layout = useAbTest<StepPanelLayout>({
		id: STEP_PANEL_EXPERIMENT_ID,
		label: 'Step panel',
		initial: INITIAL_LAYOUT,
		options: {
			overlay: {
				label: 'Overlay',
				hint: 'Baseline. Floating panel over the right of the chart, never taller than the chart; the header stays, the body scrolls.',
			},
			drawer: {
				label: 'Drawer',
				hint: 'Docked right of the chart over its full height, resizable width; the chart narrows instead of being covered.',
			},
			tabs: {
				label: 'Tabs',
				hint: 'Floating panel with one block at a time: Summary, Error, Inputs, Links, Outputs.',
			},
			accordion: {
				label: 'Accordion',
				hint: 'Floating panel with collapsible sections, only the error open (the summary when there is none).',
			},
		},
	});
	const density = useAbTest<StepPanelDensity>({
		id: STEP_PANEL_DENSITY_ID,
		label: 'Step panel density',
		initial: INITIAL_DENSITY,
		options: {
			comfortable: { label: 'Comfortable', hint: 'Baseline. Regular text, captured blocks up to 14rem tall.' },
			compact: { label: 'Compact', hint: 'Smaller text and spacing, captured blocks up to 8rem tall.' },
		},
	});
	// Nothing is registered while experiments are off, so no dock row is offered either.
	useRegisterAbTests([layout, density]);
	return enabled
		? { layout: layout.value, density: density.value }
		: { layout: INITIAL_LAYOUT, density: INITIAL_DENSITY };
}
