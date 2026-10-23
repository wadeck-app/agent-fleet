import type { ReactNode } from 'react';

import { cleanup, render } from '@testing-library/react';
import { AbExperiments } from '@wadeck-app/dsl-ui';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	STEP_PANEL_DENSITY_ID,
	STEP_PANEL_EXPERIMENT_ID,
	type StepPanelChoice,
	useStepPanelExperiment,
} from './StepPanelExperiment.js';

function Probe({ onChoice }: { onChoice: (choice: StepPanelChoice) => void }) {
	onChoice(useStepPanelExperiment());
	return null;
}

function choiceIn(host: (children: ReactNode) => ReactNode): StepPanelChoice {
	let seen: StepPanelChoice | undefined;
	render(<>{host(<Probe onChoice={choice => (seen = choice)} />)}</>);
	if (seen === undefined) {
		throw new Error('The probe never rendered.');
	}
	return seen;
}

describe('useStepPanelExperiment', () => {
	beforeEach(() => {
		localStorage.clear();
		window.history.replaceState(null, '', '/');
	});
	afterEach(() => {
		cleanup();
	});

	it('uses the experiment ids documented for the dock', () => {
		expect(STEP_PANEL_EXPERIMENT_ID).toBe('flow-chart-step-panel');
		expect(STEP_PANEL_DENSITY_ID).toBe('flow-chart-step-panel-density');
	});

	it('returns the baseline (floating panel, comfortable) when nobody chose anything', () => {
		const choice = choiceIn(children => <AbExperiments enabled>{children}</AbExperiments>);
		expect(choice).toEqual({ layout: 'overlay', density: 'comfortable' });
	});

	it('returns initial when the dock is off, even with a stored choice and a URL parameter', () => {
		localStorage.setItem(`ab.${STEP_PANEL_EXPERIMENT_ID}`, 'drawer');
		localStorage.setItem(`ab.${STEP_PANEL_DENSITY_ID}`, 'compact');
		window.history.replaceState(null, '', `/?ab.${STEP_PANEL_EXPERIMENT_ID}=tabs`);
		const choice = choiceIn(children => <AbExperiments enabled={false}>{children}</AbExperiments>);
		expect(choice).toEqual({ layout: 'overlay', density: 'comfortable' });
	});

	it('returns initial outside development when no host mounts a dock', () => {
		localStorage.setItem(`ab.${STEP_PANEL_EXPERIMENT_ID}`, 'accordion');
		const choice = choiceIn(children => children);
		expect(choice.layout).toBe('overlay');
	});

	it('applies the stored choice when the dock is on', () => {
		localStorage.setItem(`ab.${STEP_PANEL_EXPERIMENT_ID}`, 'drawer');
		localStorage.setItem(`ab.${STEP_PANEL_DENSITY_ID}`, 'compact');
		const choice = choiceIn(children => <AbExperiments enabled>{children}</AbExperiments>);
		expect(choice).toEqual({ layout: 'drawer', density: 'compact' });
	});

	it('lets the URL parameter win when the dock is on', () => {
		localStorage.setItem(`ab.${STEP_PANEL_EXPERIMENT_ID}`, 'drawer');
		window.history.replaceState(null, '', `/?ab.${STEP_PANEL_EXPERIMENT_ID}=tabs`);
		const choice = choiceIn(children => <AbExperiments enabled>{children}</AbExperiments>);
		expect(choice.layout).toBe('tabs');
	});
});
