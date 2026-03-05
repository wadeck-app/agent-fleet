import type { Worker } from '@shared/api/workers.contract';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WorkerMetricsGrid } from './WorkerMetricsGrid';

describe('WorkerMetricsGrid', () => {
	const baseWorker: Worker = {
		workerId: 'worker-123',
		name: 'Test Worker',
		connected: true,
		state: 'idle',
	};

	it('renders all metric labels', () => {
		render(<WorkerMetricsGrid worker={baseWorker} />);

		expect(screen.getByText('Tasks Completed')).toBeInTheDocument();
		expect(screen.getByText('Success Rate')).toBeInTheDocument();
		expect(screen.getByText('Uptime')).toBeInTheDocument();
		expect(screen.getByText('Last Heartbeat')).toBeInTheDocument();
	});

	it('renders N/A when metrics are absent', () => {
		render(<WorkerMetricsGrid worker={baseWorker} />);

		const naElements = screen.getAllByText('N/A');
		// All 4 metrics should show N/A when no data is present
		expect(naElements).toHaveLength(4);
	});

	it('renders tasks completed when available', () => {
		const worker: Worker = {
			...baseWorker,
			tasksCompleted: 42,
		};

		render(<WorkerMetricsGrid worker={worker} />);

		expect(screen.getByText('42')).toBeInTheDocument();
	});

	it('renders success rate when available', () => {
		const worker: Worker = {
			...baseWorker,
			successRate: 95,
		};

		render(<WorkerMetricsGrid worker={worker} />);

		expect(screen.getByText('95%')).toBeInTheDocument();
	});

	it('renders uptime in hours and minutes', () => {
		const worker: Worker = {
			...baseWorker,
			// 2 hours and 30 minutes in milliseconds
			uptime: 2 * 60 * 60 * 1000 + 30 * 60 * 1000,
		};

		render(<WorkerMetricsGrid worker={worker} />);

		expect(screen.getByText('2h 30m')).toBeInTheDocument();
	});

	it('renders last heartbeat as relative time for recent heartbeat', () => {
		const worker: Worker = {
			...baseWorker,
			// 5 minutes ago
			lastHeartbeat: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
		};

		render(<WorkerMetricsGrid worker={worker} />);

		expect(screen.getByText(/5m ago/)).toBeInTheDocument();
	});

	it('renders all metrics when fully populated', () => {
		const worker: Worker = {
			...baseWorker,
			tasksCompleted: 100,
			successRate: 98,
			uptime: 24 * 60 * 60 * 1000, // 24 hours
			lastHeartbeat: new Date(Date.now() - 2 * 60 * 1000).toISOString(), // 2 minutes ago
		};

		render(<WorkerMetricsGrid worker={worker} />);

		expect(screen.getByText('100')).toBeInTheDocument();
		expect(screen.getByText('98%')).toBeInTheDocument();
		expect(screen.getByText('24h 0m')).toBeInTheDocument();
		expect(screen.getByText(/2m ago/)).toBeInTheDocument();
	});
});
