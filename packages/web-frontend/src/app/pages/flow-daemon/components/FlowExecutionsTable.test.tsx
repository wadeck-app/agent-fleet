import { MemoryRouter } from 'react-router-dom';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { buildExecutionSummary } from '../flowDaemonFixtures';
import { FlowExecutionsTable, type FlowExecutionsTableProps } from './FlowExecutionsTable';

function renderTable(overrides: Partial<FlowExecutionsTableProps> = {}) {
	const props: FlowExecutionsTableProps = {
		items: [],
		total: 0,
		page: 0,
		limit: 20,
		initialLoading: false,
		refreshing: false,
		onPageChange: vi.fn(),
		onLimitChange: vi.fn(),
		onOpenExecution: vi.fn(),
		...overrides,
	};
	render(
		<MemoryRouter>
			<FlowExecutionsTable {...props} />
		</MemoryRouter>
	);
	return props;
}

describe('FlowExecutionsTable', () => {
	it('shows the empty message when there is no execution', () => {
		renderTable();

		expect(screen.getByText('No executions match these filters.')).toBeInTheDocument();
	});

	it('shows flow, status, duration and failed/total step counts', () => {
		renderTable({
			items: [
				buildExecutionSummary({
					flowId: 'deploy',
					status: 'failed',
					duration: '2m 3s',
					failedStepCount: 1,
					stepCount: 4,
				}),
			],
			total: 1,
		});

		expect(screen.getByText('deploy')).toBeInTheDocument();
		expect(screen.getByText('failed')).toBeInTheDocument();
		expect(screen.getByText('2m 3s')).toBeInTheDocument();
		expect(screen.getByText('1/4')).toBeInTheDocument();
	});

	it('shows the last error with a recovered hint when it was recovered', () => {
		renderTable({
			items: [buildExecutionSummary({ lastError: 'step build exited with 2', lastErrorRecovered: true })],
			total: 1,
		});

		expect(screen.getByText('step build exited with 2')).toBeInTheDocument();
		expect(screen.getByText('recovered')).toBeInTheDocument();
	});

	it('does not show the recovered hint for an unrecovered error', () => {
		renderTable({
			items: [buildExecutionSummary({ lastError: 'boom', lastErrorRecovered: false })],
			total: 1,
		});

		expect(screen.getByText('boom')).toBeInTheDocument();
		expect(screen.queryByText('recovered')).not.toBeInTheDocument();
	});

	it('opens the execution when its row is clicked', () => {
		const props = renderTable({ items: [buildExecutionSummary({ executionId: 'exec-42' })], total: 1 });

		fireEvent.click(screen.getByTestId('table-row'));

		expect(props.onOpenExecution).toHaveBeenCalledWith('exec-42');
	});

	it('links the flow to the detail page without triggering the row click', () => {
		const props = renderTable({ items: [buildExecutionSummary({ executionId: 'exec-42' })], total: 1 });

		const link = screen.getByRole('link', { name: 'nightly-build' });
		expect(link).toHaveAttribute('href', '/flow/executions/exec-42');
		fireEvent.click(link);

		expect(props.onOpenExecution).not.toHaveBeenCalled();
	});

	it('converts the one-based table pager to the zero-based page', () => {
		const props = renderTable({
			items: [buildExecutionSummary()],
			total: 100,
			page: 1,
			limit: 20,
		});

		expect(screen.getByText('Page 2 of 5')).toBeInTheDocument();

		fireEvent.click(screen.getByRole('button', { name: 'Go to page 3' }));
		expect(props.onPageChange).toHaveBeenCalledWith(2);
	});
});
