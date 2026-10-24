import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type { FlowExecutionDetail } from '@shared/api/flow-daemon.contract';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { FlowExecutionDetailPage } from './FlowExecutionDetailPage';
import { buildExecutionDetail, buildExecutionLogs, buildStep } from './flowDaemonFixtures';
import { useFlowExecutionDetail } from './hooks/useFlowExecutionDetail';
import { useFlowExecutionLogs } from './hooks/useFlowExecutionLogs';

vi.mock('./hooks/useFlowExecutionDetail', () => ({
	useFlowExecutionDetail: vi.fn(),
}));

vi.mock('./hooks/useFlowExecutionLogs', () => ({
	useFlowExecutionLogs: vi.fn(),
}));

function mockDetail(data: FlowExecutionDetail | null, error: string | null = null) {
	vi.mocked(useFlowExecutionDetail).mockReturnValue({ data, loading: false, error, refresh: vi.fn() });
}

function renderPage(url = '/flow/executions/exec-0001') {
	return render(
		<MemoryRouter initialEntries={[url]}>
			<Routes>
				<Route path="/flow/executions/:id" element={<FlowExecutionDetailPage />} />
			</Routes>
		</MemoryRouter>
	);
}

const scrollIntoView = vi.fn();

describe('FlowExecutionDetailPage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		// jsdom does not implement scrollIntoView
		Element.prototype.scrollIntoView = scrollIntoView;
		vi.mocked(useFlowExecutionLogs).mockReturnValue({
			step: undefined,
			level: undefined,
			searchText: '',
			page: 0,
			limit: 100,
			hasActiveFilter: false,
			setStep: vi.fn(),
			setLevel: vi.fn(),
			setSearchText: vi.fn(),
			setPage: vi.fn(),
			logs: buildExecutionLogs({
				entries: [
					{ timestamp: '2026-05-06T10:00:00.000Z', level: 'info', stepId: 'compile', message: 'started' },
				],
				total: 1,
			}),
			loading: false,
			error: null,
			refresh: vi.fn(),
		});
	});

	it('shows the daemon logs of the execution without a step filter at first', () => {
		mockDetail(buildExecutionDetail());

		renderPage('/flow/executions/exec-0001');

		expect(useFlowExecutionLogs).toHaveBeenCalledWith('exec-0001', undefined);
		expect(screen.getByLabelText('Execution daemon logs')).toHaveTextContent('compile: started');
		expect(scrollIntoView).not.toHaveBeenCalled();
	});

	it('opens the logs filtered on a step from the steps table', () => {
		mockDetail(buildExecutionDetail({ steps: [buildStep({ stepId: 'compile' })] }));

		renderPage();
		fireEvent.click(screen.getByRole('button', { name: 'Show logs of step compile' }));

		expect(useFlowExecutionLogs).toHaveBeenLastCalledWith('exec-0001', 'compile');
		expect(scrollIntoView).toHaveBeenCalledTimes(1);
	});

	it('loads the execution of the id found in the URL', () => {
		mockDetail(buildExecutionDetail());

		renderPage('/flow/executions/exec-0001');

		expect(useFlowExecutionDetail).toHaveBeenCalledWith('exec-0001');
	});

	it('shows the header, the steps and the flow show text', () => {
		mockDetail(
			buildExecutionDetail({
				flowId: 'nightly-build',
				totalCostUsd: 1.5,
				steps: [buildStep({ stepId: 'compile' })],
				text: 'Flow: nightly-build\nStatus: completed',
			})
		);

		renderPage();

		expect(screen.getByText('Execution of nightly-build')).toBeInTheDocument();
		expect(screen.getByText('$1.5000')).toBeInTheDocument();
		expect(screen.getByText('compile')).toBeInTheDocument();
		expect(screen.getByLabelText('flow show output')).toHaveTextContent('Flow: nightly-build');
	});

	it('shows the error of a failed step prominently', () => {
		mockDetail(
			buildExecutionDetail({
				status: 'failed',
				steps: [buildStep({ stepId: 'deploy', status: 'failed', error: 'deploy exited with code 2' })],
			})
		);

		renderPage();

		expect(screen.getByRole('alert')).toHaveTextContent('deploy exited with code 2');
	});

	it('shows the backend error text, not a generic message', () => {
		mockDetail(null, "Execution 'exec-0001' was not found. List executions with: flow history");

		renderPage();

		expect(screen.getByRole('alert')).toHaveTextContent(
			"Execution 'exec-0001' was not found. List executions with: flow history"
		);
	});
});
