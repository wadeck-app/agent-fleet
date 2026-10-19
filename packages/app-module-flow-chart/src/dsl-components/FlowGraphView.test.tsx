import { MemoryRouter } from 'react-router-dom';

import { fireEvent, render, screen, within } from '@testing-library/react';
import type { FlowGraphResult } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { FlowGraphView } from './FlowGraphView.js';
import { BUILD_GRAPH, chain } from './testing/GraphFixtures.js';

function executionResult(overrides: Partial<FlowGraphResult> = {}): FlowGraphResult {
	return {
		graph: BUILD_GRAPH,
		flowId: 'build_task',
		flowName: 'Build a task',
		flowFile: '/flows/build.yml',
		execution: { executionId: 'exec1', status: 'failed', startedAt: '2026-08-16T12:00:00.000Z', completedAt: null },
		...overrides,
	};
}

function renderView(result: FlowGraphResult, refreshError?: string) {
	return render(
		<MemoryRouter>
			<FlowGraphView result={result} refreshError={refreshError} />
		</MemoryRouter>
	);
}

describe('FlowGraphView', () => {
	it('draws every step with its status, and names the flow and the run in the header', () => {
		renderView(executionResult());
		expect(screen.getByRole('heading', { name: 'Build a task' })).toBeInTheDocument();
		expect(screen.getByText('exec1', { exact: false })).toBeInTheDocument();
		expect(screen.getByTestId('step-plan')).toHaveAttribute('data-status', 'completed');
		expect(screen.getByTestId('step-test')).toHaveAttribute('data-status', 'failed');
		expect(screen.getByTestId('step-ship')).toHaveAttribute('data-status', 'pending');
		expect(screen.getByText(/4 steps: 2 pending, 1 completed, 1 failed/)).toBeInTheDocument();
	});

	it('links back to the execution page of flow', () => {
		renderView(executionResult());
		expect(screen.getByRole('link', { name: 'Back to the execution' })).toHaveAttribute(
			'href',
			'/modules/flow/executions/exec1'
		);
	});

	it('shows a definition without status colors, a "definition" badge and a link to the index', () => {
		renderView(executionResult({ execution: undefined, graph: chain(3) }));
		expect(screen.getByText('definition')).toBeInTheDocument();
		expect(screen.getByTestId('step-step-0')).toHaveAttribute('data-status', 'none');
		expect(screen.getByRole('link', { name: 'Back to flow charts' })).toHaveAttribute(
			'href',
			'/modules/flow-chart/flows'
		);
		expect(within(screen.getByRole('list', { name: 'Legend' })).queryByText(/completed/)).toBeNull();
	});

	it('explains only the edge kinds that are drawn', () => {
		renderView(executionResult());
		const legend = screen.getByRole('list', { name: 'Legend' });
		expect(within(legend).getByText('depends on')).toBeInTheDocument();
		expect(within(legend).getByText(/retry loop/)).toBeInTheDocument();
		expect(within(legend).queryByText('sub-step of')).toBeNull();
	});

	it('hints at clicking while nothing is selected, then shows the clicked step with its error', () => {
		renderView(executionResult());
		expect(screen.getByText(/Click a step to see/)).toBeInTheDocument();
		fireEvent.click(screen.getByTestId('step-test'));
		const panel = screen.getByRole('complementary', { name: 'Step details' });
		expect(within(panel).getByText('Test')).toBeInTheDocument();
		expect(within(panel).getByText('exit 1: 3 tests failed')).toBeInTheDocument();
		expect(within(panel).getByText('2m5s')).toBeInTheDocument();
		expect(within(panel).getByText('3')).toBeInTheDocument();
	});

	it('closes the details', () => {
		renderView(executionResult());
		fireEvent.click(screen.getByTestId('step-test'));
		fireEvent.click(screen.getByRole('button', { name: 'Close step details' }));
		expect(screen.getByText(/Click a step to see/)).toBeInTheDocument();
	});

	it('reports a failed refresh next to the last known chart', () => {
		renderView(executionResult(), 'disk full');
		expect(screen.getByRole('alert')).toHaveTextContent('disk full');
		expect(screen.getByTestId('step-plan')).toBeInTheDocument();
	});

	it('draws a single step', () => {
		renderView(executionResult({ graph: { nodes: [BUILD_GRAPH.nodes[0]!], edges: [] } }));
		expect(screen.getByText(/1 step: 1 completed/)).toBeInTheDocument();
		expect(screen.getAllByTestId(/^step-/)).toHaveLength(1);
	});

	it('draws 50 steps', () => {
		renderView(executionResult({ execution: undefined, graph: chain(50) }));
		expect(screen.getAllByTestId(/^step-/)).toHaveLength(50);
	});

	it('says so, with the file, when the flow has no step', () => {
		renderView(executionResult({ graph: { nodes: [], edges: [] } }));
		expect(screen.getByRole('status')).toHaveTextContent('/flows/build.yml');
	});

	it('offers fit to view, zoom and a layout switch', () => {
		renderView(executionResult());
		const toolbar = screen.getByRole('toolbar', { name: 'Chart controls' });
		expect(within(toolbar).getByRole('button', { name: 'Fit to view' })).toBeInTheDocument();
		expect(within(toolbar).getByRole('button', { name: 'Zoom in' })).toBeInTheDocument();
		const layout = within(toolbar).getByRole('button', { name: /Switch to vertical layout/ });
		fireEvent.click(layout);
		// The chart remounts for the new layout, so the toolbar is a new element.
		expect(screen.getByRole('button', { name: /Switch to horizontal layout/ })).toBeInTheDocument();
	});

	it('lays a long flow out vertically from the start', () => {
		renderView(executionResult({ graph: chain(20) }));
		expect(screen.getByRole('button', { name: /Switch to horizontal layout/ })).toBeInTheDocument();
	});
});
