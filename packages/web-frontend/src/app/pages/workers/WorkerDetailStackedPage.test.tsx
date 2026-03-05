import { MemoryRouter, Route, Routes } from 'react-router-dom';

import type { Worker } from '@shared/api/workers.contract';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkerDetailStackedPage } from './WorkerDetailStackedPage';
import { useWorker } from './hooks/useWorker';

// Mock dependencies
vi.mock('./hooks/useWorker');

vi.mock('./components/WorkerTaskHistoryTable', () => ({
	WorkerTaskHistoryTable: () => <div>Tasks</div>,
}));

vi.mock('./components/WorkerFlowsList', () => ({
	WorkerFlowsList: () => <div>Flows</div>,
}));

vi.mock('./components/WorkerInfoPanel', () => ({
	WorkerInfoPanel: () => <div>Info</div>,
}));

vi.mock('./components/WorkerMetricsGrid', () => ({
	WorkerMetricsGrid: () => <div>Metrics</div>,
}));

vi.mock('@/hooks/useRealtimeRefresh', () => ({
	useRealtimeRefresh: vi.fn(),
}));

describe('WorkerDetailStackedPage', () => {
	const mockWorker: Worker = {
		workerId: 'worker-1',
		name: 'Test Worker',
		connected: true,
		state: 'idle',
		version: 1,
	};

	// Helper to render with router
	const renderWithRouter = (workerId = 'worker-1') => {
		return render(
			<MemoryRouter initialEntries={[`/workers/${workerId}/stacked`]}>
				<Routes>
					<Route path="/workers/:workerId/stacked" element={<WorkerDetailStackedPage />} />
				</Routes>
			</MemoryRouter>
		);
	};

	it('shows loading spinner while loading', () => {
		vi.mocked(useWorker).mockReturnValue({
			worker: null,
			isLoading: true,
			isError: false,
			error: null,
			refetch: vi.fn(),
		});

		renderWithRouter();

		expect(screen.getByText('Loading Worker...')).toBeInTheDocument();
	});

	it('shows error when fetch fails', () => {
		vi.mocked(useWorker).mockReturnValue({
			worker: null,
			isLoading: false,
			isError: true,
			error: new Error('Worker not found'),
			refetch: vi.fn(),
		});

		renderWithRouter();

		expect(screen.getByText('Error')).toBeInTheDocument();
		expect(screen.getByText('Worker not found')).toBeInTheDocument();
	});

	it('shows worker name in header when loaded', () => {
		vi.mocked(useWorker).mockReturnValue({
			worker: mockWorker,
			isLoading: false,
			isError: false,
			error: null,
			refetch: vi.fn(),
		});

		renderWithRouter();

		expect(screen.getByText('Test Worker')).toBeInTheDocument();
	});

	it('renders metrics grid', () => {
		vi.mocked(useWorker).mockReturnValue({
			worker: mockWorker,
			isLoading: false,
			isError: false,
			error: null,
			refetch: vi.fn(),
		});

		renderWithRouter();

		expect(screen.getByText('Metrics')).toBeInTheDocument();
	});

	it('renders tabs (Task History, Flows, Info)', () => {
		vi.mocked(useWorker).mockReturnValue({
			worker: mockWorker,
			isLoading: false,
			isError: false,
			error: null,
			refetch: vi.fn(),
		});

		renderWithRouter();

		expect(screen.getByText('Task History')).toBeInTheDocument();
		expect(screen.getByText('Flows')).toBeInTheDocument();
		expect(screen.getByText('Info')).toBeInTheDocument();
	});
});
