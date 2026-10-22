import { MemoryRouter } from 'react-router-dom';

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import type { FlowGraphResult } from 'flow-core';
import { describe, expect, it } from 'vitest';

import { FlowGraphView } from './FlowGraphView.js';
import { ANNOTATED_RUN_GRAPH, BUILD_GRAPH, SUBFLOW_GRAPH, chain, node } from './testing/GraphFixtures.js';

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
		expect(screen.getByRole('heading', { name: 'build_task' })).toBeInTheDocument();
		expect(screen.getByText('Build a task', { exact: false })).toBeInTheDocument();
		expect(screen.getByText('exec1', { exact: false })).toBeInTheDocument();
		expect(screen.getByTestId('step-plan')).toHaveAttribute('data-status', 'completed');
		expect(screen.getByTestId('step-test')).toHaveAttribute('data-status', 'failed');
		expect(screen.getByTestId('step-ship')).toHaveAttribute('data-status', 'pending');
		expect(screen.getByText(/4 steps: 2 pending, 1 completed, 1 failed/)).toBeInTheDocument();
	});

	it('has no "Back to" link: the shell breadcrumb is the way back', () => {
		renderView(executionResult());
		expect(screen.queryByRole('link', { name: /^Back to/ })).toBeNull();
		cleanup();
		renderView(executionResult({ execution: undefined, graph: chain(3) }));
		expect(screen.queryByRole('link', { name: /^Back to/ })).toBeNull();
	});

	it('links the header of a run to its logs page', () => {
		renderView(executionResult());
		expect(screen.getByRole('link', { name: 'Logs' })).toHaveAttribute(
			'href',
			'/modules/flow/executions/exec1/logs'
		);
	});

	it('has no logs link for a definition without a run', () => {
		renderView(executionResult({ execution: undefined, graph: chain(3) }));
		expect(screen.queryByRole('link', { name: 'Logs' })).toBeNull();
	});

	it('says a chart without a run shows the structure of the flow file, in the header and in the legend', () => {
		renderView(executionResult({ execution: undefined, graph: chain(3) }));
		const header = screen.getByRole('banner');
		expect(within(header).getByText('Flow structure (no run selected)')).toBeInTheDocument();
		expect(within(header).getByText(/steps as written in the flow file/)).toBeInTheDocument();
		expect(screen.queryByText('definition')).toBeNull();
		expect(
			within(screen.getByRole('list', { name: 'Legend' })).getByText(/steps as written in the flow file/)
		).toBeInTheDocument();
	});

	it('names the run and its status when the chart shows a run, in the header and in the legend', () => {
		renderView(executionResult());
		const header = screen.getByRole('banner');
		expect(within(header).getByText('Run exec1')).toBeInTheDocument();
		expect(within(header).getByText('failed')).toBeInTheDocument();
		expect(screen.queryByText('Flow structure (no run selected)')).toBeNull();
		expect(
			within(screen.getByRole('list', { name: 'Legend' })).getByText(/status of each step/)
		).toBeInTheDocument();
	});

	it('shows a definition without status colors', () => {
		renderView(executionResult({ execution: undefined, graph: chain(3) }));
		expect(screen.getByTestId('step-step-0')).toHaveAttribute('data-status', 'none');
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
		fireEvent.click(screen.getByRole('button', { name: 'Close' }));
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

	it('titles the chart with the flow id, and shows the name only when it differs from the id', () => {
		renderView(executionResult({ flowName: 'build_task' }));
		expect(screen.getByRole('heading', { name: 'build_task' })).toBeInTheDocument();
		expect(screen.queryByText(/Build a task/)).toBeNull();
	});

	it('shows the warnings of the graph, so an inferred chart is never mistaken for a recorded one', () => {
		renderView(
			executionResult({ graph: { ...BUILD_GRAPH, warnings: ['The flow file /x.yml changed since this run.'] } })
		);
		expect(screen.getByRole('status', { name: 'Chart warnings' })).toHaveTextContent('changed since this run');
	});

	it('explains the recorded-order edges in the legend, and says their dependencies are unknown', () => {
		const graph = {
			nodes: [node('a', { kind: 'removed' }), node('b', { kind: 'removed' })],
			edges: [{ from: 'a', to: 'b', kind: 'sequence' as const, label: 'recorded order' }],
		};
		renderView(executionResult({ graph }));
		expect(
			within(screen.getByRole('list', { name: 'Legend' })).getByText(/recorded order.*dependencies unknown/)
		).toBeInTheDocument();
	});

	it('keeps the controls out of the canvas, where they would cover the steps', () => {
		renderView(executionResult());
		const canvas = screen.getByTestId('chart-canvas');
		expect(within(canvas).queryByRole('toolbar')).toBeNull();
		expect(screen.getByRole('toolbar', { name: 'Chart controls' })).toBeInTheDocument();
	});

	it('opens on the whole flow for a chain that fits readably, with no zoom-in hint', () => {
		renderView(executionResult({ graph: chain(12), execution: undefined }));
		expect(screen.queryByText(/Zoomed in on step/)).toBeNull();
	});

	it('takes no room for the details until a step is selected, so the chart keeps the full width', () => {
		renderView(executionResult());
		expect(screen.queryByRole('complementary', { name: 'Step details' })).toBeNull();
		fireEvent.click(screen.getByTestId('step-test'));
		expect(screen.getByRole('complementary', { name: 'Step details' })).toBeInTheDocument();
	});

	it('marks a step missing from the flow file with a discreet note, not a boxed REMOVED badge', () => {
		const graph = { nodes: [node('a', { kind: 'removed' }), node('b')], edges: [] };
		renderView(executionResult({ graph }));
		expect(within(screen.getByTestId('step-a')).getByText('not in file')).toBeInTheDocument();
		expect(within(screen.getByTestId('step-b')).queryByText('not in file')).toBeNull();
		expect(screen.queryByText(/^removed$/i)).toBeNull();
	});

	it('does not repeat the status, the kind or raw flags in the details of a removed step', () => {
		const graph = {
			nodes: [node('a', { kind: 'removed', status: 'failed', meta: { type: 'removed', removed: true } })],
			edges: [],
		};
		renderView(executionResult({ graph }));
		fireEvent.click(screen.getByTestId('step-a'));
		const panel = screen.getByRole('complementary', { name: 'Step details' });
		expect(within(panel).getAllByText('failed')).toHaveLength(1);
		expect(within(panel).queryByText('removed')).toBeNull();
		expect(within(panel).queryByText('true')).toBeNull();
	});

	it('zooms in on a step for a 30 step chain and tells the reader how to see the rest', () => {
		renderView(executionResult({ graph: chain(30), execution: undefined }));
		expect(screen.getByText(/Zoomed in on step 'step-0'.*Fit to view/)).toBeInTheDocument();
	});

	it('says it zoomed in on a step, outside the canvas, when the flow is too big to be readable', () => {
		renderView(executionResult({ graph: chain(80), execution: undefined }));
		const hint = screen.getByText(/Zoomed in on step/);
		expect(hint).toBeInTheDocument();
		expect(within(screen.getByTestId('chart-canvas')).queryByText(/Zoomed in on step/)).toBeNull();
	});
});

describe('FlowGraphView sub-steps', () => {
	it('draws the sub-steps of a step, nested, and says how many each step has', () => {
		renderView(executionResult({ graph: SUBFLOW_GRAPH }));
		for (const id of ['plan', 'build', 'b1', 'b2', 'b2a', 'b2b', 'ship']) {
			expect(screen.getByTestId('step-' + id)).toBeInTheDocument();
		}
		expect(screen.getByRole('button', { name: 'Collapse 2 sub-steps of build' })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'Collapse 2 sub-steps of b2' })).toBeInTheDocument();
		expect(within(screen.getByTestId('step-build')).getByText('2 sub-steps')).toBeInTheDocument();
		expect(within(screen.getByTestId('step-plan')).queryByText(/sub-step/)).toBeNull();
	});

	it('folds and unfolds the sub-steps of one parent with its chevron, without selecting the step', () => {
		renderView(executionResult({ graph: SUBFLOW_GRAPH }));
		fireEvent.click(screen.getByRole('button', { name: 'Collapse 2 sub-steps of b2' }));
		expect(screen.queryByTestId('step-b2a')).toBeNull();
		expect(screen.getByTestId('step-b1')).toBeInTheDocument();
		expect(screen.queryByRole('complementary', { name: 'Step details' })).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Collapse 2 sub-steps of build' }));
		expect(screen.queryByTestId('step-b1')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Expand 2 sub-steps of build' }));
		expect(screen.getByTestId('step-b1')).toBeInTheDocument();
		expect(screen.queryByTestId('step-b2a')).toBeNull();
	});

	it('keeps the layout direction the chart opened with when a parent is folded or unfolded', () => {
		renderView(executionResult({ graph: SUBFLOW_GRAPH }));
		const label = () => screen.getByRole('button', { name: /Switch to (vertical|horizontal) layout/ }).textContent;
		const before = label();
		fireEvent.click(screen.getByRole('button', { name: 'Collapse 2 sub-steps of build' }));
		expect(label()).toBe(before);
		fireEvent.click(screen.getByRole('button', { name: 'Expand 2 sub-steps of build' }));
		expect(label()).toBe(before);
	});

	it('starts with a parent folded when it has more than 8 sub-steps', () => {
		const children = Array.from({ length: 9 }, (_, i) => node('c' + i));
		const graph = {
			nodes: [node('p'), ...children],
			edges: children.map(c => ({ from: c.id, to: 'p', kind: 'substep' as const })),
		};
		renderView(executionResult({ graph }));
		expect(screen.queryByTestId('step-c0')).toBeNull();
		fireEvent.click(screen.getByRole('button', { name: 'Expand 9 sub-steps of p' }));
		expect(screen.getByTestId('step-c0')).toBeInTheDocument();
	});

	it('explains the indentation in the legend when sub-steps are drawn', () => {
		renderView(executionResult({ graph: SUBFLOW_GRAPH }));
		expect(
			within(screen.getByRole('list', { name: 'Legend' })).getByText(/indented under its parent/)
		).toBeInTheDocument();
	});

	describe('path and inputs/outputs of a run', () => {
		const annotated = () => executionResult({ graph: ANNOTATED_RUN_GRAPH });

		it('numbers the steps that ran and shows the others as skipped or not reached', () => {
			renderView(annotated());
			expect(screen.getByTestId('ordinal-plan')).toHaveTextContent('1');
			expect(screen.getByTestId('ordinal-test')).toHaveTextContent('2');
			expect(screen.queryByTestId('ordinal-ship')).toBeNull();
			expect(screen.getByTestId('step-ship')).toHaveAttribute('data-outcome', 'not-reached');
			expect(screen.getByTestId('step-ship')).toHaveAccessibleName(/not reached/);
			expect(screen.getByTestId('step-notify')).toHaveAccessibleName(/skipped/);
			expect(screen.getByText(/3 attempts/)).toBeInTheDocument();
		});

		it('says in the legend what is recorded and what is inferred', () => {
			renderView(annotated());
			const legend = screen.getByRole('list', { name: 'Legend' });
			expect(within(legend).getByText(/run order \(recorded/)).toBeInTheDocument();
			expect(within(legend).getByText(/followed by the run.*inferred/)).toBeInTheDocument();
			expect(within(legend).getByText(/skipped/)).toBeInTheDocument();
			expect(within(legend).getByText(/not reached/)).toBeInTheDocument();
		});

		it('shows the inputs as declared with the note that resolved values are not recorded', () => {
			renderView(annotated());
			fireEvent.click(screen.getByTestId('step-test'));
			const panel = screen.getByRole('complementary', { name: 'Step details' });
			const inputs = within(panel).getByRole('region', { name: 'Inputs' });
			expect(within(inputs).getByText('env.REGION')).toBeInTheDocument();
			expect(within(inputs).getByText('eu')).toBeInTheDocument();
			expect(within(inputs).getByText(/uses steps.plan.outputs.files/)).toBeInTheDocument();
			expect(within(inputs).getByText(/Resolved values not recorded/)).toBeInTheDocument();
		});

		it('selects the linked step when its name is clicked', () => {
			renderView(annotated());
			fireEvent.click(screen.getByTestId('step-test'));
			const flow = within(screen.getByRole('complementary', { name: 'Step details' })).getByRole('region', {
				name: 'Data flow',
			});
			expect(within(flow).getByText('Uses output of')).toBeInTheDocument();
			// Plan is used by Test and Notify; following the link to Plan shows who uses it.
			fireEvent.click(within(flow).getByRole('button', { name: 'Plan' }));
			const planFlow = within(screen.getByRole('complementary', { name: 'Step details' })).getByRole('region', {
				name: 'Data flow',
			});
			expect(within(planFlow).getByText('Used by')).toBeInTheDocument();
			expect(within(planFlow).getByRole('button', { name: 'Test' })).toBeInTheDocument();
			expect(within(planFlow).getByRole('button', { name: 'Notify' })).toBeInTheDocument();
		});

		it('shows the captured output of a failed step shortened, with Show more', () => {
			renderView(annotated());
			fireEvent.click(screen.getByTestId('step-test'));
			const block = screen.getByRole('region', { name: 'Outputs' });
			const before = within(block).getByLabelText(/^stdout/).textContent!.length;
			fireEvent.click(within(block).getByRole('button', { name: /Show more/ }));
			expect(within(block).getByLabelText(/^stdout/).textContent!.length).toBeGreaterThan(before);
			expect(within(block).getByLabelText(/^stdout/)).toHaveTextContent('FAIL a.test.ts');
			fireEvent.click(within(block).getByRole('button', { name: 'Show less' }));
			expect(within(block).getByLabelText(/^stdout/).textContent!.length).toBe(before);
		});

		it('explains why a step did not run and links its logs preselected on the step', () => {
			renderView(annotated());
			fireEvent.click(screen.getByTestId('step-ship'));
			const panel = screen.getByRole('complementary', { name: 'Step details' });
			expect(within(panel).getByText(/Not reached: 'test' failed/)).toBeInTheDocument();
			expect(within(panel).getByText('(inferred)')).toBeInTheDocument();
			expect(within(panel).getByRole('link', { name: 'Logs of this step' })).toHaveAttribute(
				'href',
				'/modules/flow/executions/exec1/logs?step=ship'
			);
		});

		it('offers no logs link in the panel of a definition without a run', () => {
			renderView(executionResult({ execution: undefined, graph: chain(3) }));
			fireEvent.click(screen.getByTestId('step-step-0'));
			expect(screen.queryByRole('link', { name: 'Logs of this step' })).toBeNull();
		});
	});
});
