import { MemoryRouter } from 'react-router-dom';

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AbExperiments } from '@wadeck-app/dsl-ui';
import type { FlowGraphResult } from 'flow-core';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { FlowGraphView } from './FlowGraphView.js';
import { STEP_PANEL_DENSITY_ID, STEP_PANEL_EXPERIMENT_ID } from './StepPanelExperiment.js';
import { BUILD_GRAPH } from './testing/GraphFixtures.js';

const RESULT: FlowGraphResult = {
	graph: BUILD_GRAPH,
	flowId: 'build_task',
	flowName: 'Build a task',
	flowFile: '/flows/build.yml',
	definition: { source: 'flow-file' },
	execution: { executionId: 'exec1', status: 'failed', startedAt: '2026-08-16T12:00:00.000Z', completedAt: null },
};

function renderIn(dockEnabled: boolean | undefined) {
	const view = (
		<MemoryRouter>
			<FlowGraphView result={RESULT} />
		</MemoryRouter>
	);
	return render(dockEnabled === undefined ? view : <AbExperiments enabled={dockEnabled}>{view}</AbExperiments>);
}

beforeEach(() => {
	localStorage.clear();
	window.history.replaceState(null, '', '/');
});
afterEach(() => {
	cleanup();
});

describe('FlowGraphView step panel experiment', () => {
	it('floats the panel over the chart by default, inside the frame of the chart', () => {
		renderIn(true);
		fireEvent.click(screen.getByTestId('step-test'));
		const slot = screen.getByTestId('panel-slot');
		expect(slot).toHaveClass('lg:absolute', 'lg:inset-y-2');
		expect(screen.getByTestId('panel-dock')).toContainElement(screen.getByTestId('chart-canvas'));
		expect(screen.getByTestId('panel-dock')).toContainElement(slot);
	});

	it('docks the panel beside the chart in the drawer variant', () => {
		localStorage.setItem(`ab.${STEP_PANEL_EXPERIMENT_ID}`, 'drawer');
		renderIn(true);
		fireEvent.click(screen.getByTestId('step-test'));
		expect(screen.getByTestId('panel-dock')).toHaveClass('lg:flex-row');
		expect(screen.getByRole('separator', { name: 'Resize the step panel' })).toBeInTheDocument();
	});

	it('shows tabs, and the compact density, when the dock chose them', () => {
		localStorage.setItem(`ab.${STEP_PANEL_EXPERIMENT_ID}`, 'tabs');
		localStorage.setItem(`ab.${STEP_PANEL_DENSITY_ID}`, 'compact');
		renderIn(true);
		fireEvent.click(screen.getByTestId('step-test'));
		expect(screen.getByRole('tablist', { name: 'Step sections' })).toBeInTheDocument();
		expect(screen.getByRole('complementary', { name: 'Step details' })).toHaveClass('text-xs');
	});

	it('ignores a stored choice when the dock is off', () => {
		localStorage.setItem(`ab.${STEP_PANEL_EXPERIMENT_ID}`, 'tabs');
		renderIn(false);
		fireEvent.click(screen.getByTestId('step-test'));
		expect(screen.queryByRole('tablist')).toBeNull();
		expect(screen.getByTestId('panel-slot')).toHaveClass('lg:absolute');
	});

	it('uses the baseline without any dock host outside development', () => {
		localStorage.setItem(`ab.${STEP_PANEL_EXPERIMENT_ID}`, 'drawer');
		renderIn(undefined);
		fireEvent.click(screen.getByTestId('step-test'));
		expect(screen.queryByRole('separator')).toBeNull();
	});

	it('closes the panel with Escape and leaves no slot behind', () => {
		renderIn(true);
		fireEvent.click(screen.getByTestId('step-test'));
		fireEvent.keyDown(screen.getByRole('complementary', { name: 'Step details' }), { key: 'Escape' });
		expect(screen.queryByTestId('panel-slot')).toBeNull();
	});
});
