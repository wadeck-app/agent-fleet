import { MemoryRouter, Route, Routes } from 'react-router-dom';

import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowExecutionsPage } from './FlowExecutionsPage';
import { buildExecutionSummary } from './flowDaemonFixtures';
import { type UseFlowExecutionsResult, useFlowExecutions } from './hooks/useFlowExecutions';

vi.mock('./hooks/useFlowExecutions', () => ({
	useFlowExecutions: vi.fn(),
}));

const refresh = vi.fn();

function mockExecutions(overrides: Partial<UseFlowExecutionsResult>) {
	vi.mocked(useFlowExecutions).mockReturnValue({
		filters: { status: undefined, flow: undefined, page: 0, limit: 20 },
		setStatus: vi.fn(),
		setFlow: vi.fn(),
		setPage: vi.fn(),
		setLimit: vi.fn(),
		executions: { items: [], total: 0, limit: 20, offset: 0 },
		loading: false,
		error: null,
		refresh,
		flowOptions: [],
		flowOptionsError: null,
		...overrides,
	});
}

function renderPage() {
	return render(
		<MemoryRouter initialEntries={['/flow/executions']}>
			<Routes>
				<Route path="/flow/executions" element={<FlowExecutionsPage />} />
				<Route path="/flow/executions/:id" element={<div>Detail of the execution</div>} />
			</Routes>
		</MemoryRouter>
	);
}

describe('FlowExecutionsPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('lists the executions with the total in the header', () => {
		mockExecutions({
			executions: {
				items: [buildExecutionSummary({ executionId: 'e1', flowId: 'alpha' })],
				total: 1,
				limit: 20,
				offset: 0,
			},
		});

		renderPage();

		expect(screen.getByText('alpha')).toBeInTheDocument();
		expect(screen.getByText('(1)')).toBeInTheDocument();
	});

	it('opens the detail page when a row is clicked', () => {
		mockExecutions({
			executions: { items: [buildExecutionSummary({ executionId: 'e1' })], total: 1, limit: 20, offset: 0 },
		});

		renderPage();
		fireEvent.click(screen.getByTestId('table-row'));

		expect(screen.getByText('Detail of the execution')).toBeInTheDocument();
	});

	it('shows the backend error and no table', () => {
		mockExecutions({ executions: null, error: 'limit must be at most 500' });

		renderPage();

		expect(screen.getByRole('alert')).toHaveTextContent('limit must be at most 500');
		expect(screen.queryByTestId('table-row')).not.toBeInTheDocument();
		expect(screen.queryByText('No executions match these filters.')).not.toBeInTheDocument();
	});

	it('warns when the flow filter list could not be loaded', () => {
		mockExecutions({ flowOptionsError: 'flows index unavailable' });

		renderPage();

		expect(screen.getByRole('alert')).toHaveTextContent(
			'The flow filter list could not be loaded: flows index unavailable'
		);
	});

	it('refreshes on demand', () => {
		mockExecutions({});

		renderPage();
		fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));

		expect(refresh).toHaveBeenCalledTimes(1);
	});
});
