import type { Worker } from '@shared/api/workers.contract';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { WorkerInfoPanel } from './WorkerInfoPanel';

// Mock dependencies
vi.mock('@framework/features/toast/ToastContext', () => ({
	useToast: () => ({ showToast: vi.fn() }),
}));

vi.mock('react-router-dom', () => ({
	Link: ({ to, children }: { to: string; children: React.ReactNode }) => <a href={to}>{children}</a>,
}));

vi.mock('@/app/pages/workers/WorkersService', () => ({
	workersService: {
		renameWorker: vi.fn(),
	},
}));

describe('WorkerInfoPanel', () => {
	const baseWorker: Worker = {
		workerId: 'worker-123',
		name: 'Test Worker',
		connected: true,
		state: 'idle',
		version: 1,
	};

	it('renders worker ID and name', () => {
		render(<WorkerInfoPanel worker={baseWorker} />);

		expect(screen.getByText('Worker ID')).toBeInTheDocument();
		expect(screen.getByText('worker-123')).toBeInTheDocument();
		expect(screen.getByText('Name')).toBeInTheDocument();
		expect(screen.getByText('Test Worker')).toBeInTheDocument();
	});

	it('renders state and connection badges', () => {
		render(<WorkerInfoPanel worker={baseWorker} />);

		expect(screen.getByText('State')).toBeInTheDocument();
		expect(screen.getByText('Idle')).toBeInTheDocument();
		expect(screen.getByText('Connection')).toBeInTheDocument();
		expect(screen.getByText('Connected')).toBeInTheDocument();
	});

	it('renders workspace info when connected and available', () => {
		const worker: Worker = {
			...baseWorker,
			projectId: 'project-123',
			workspacePath: '/home/user/workspace',
		};

		render(<WorkerInfoPanel worker={worker} />);

		expect(screen.getByText('Workspace')).toBeInTheDocument();
		expect(screen.getByText('Project: project-123')).toBeInTheDocument();
		expect(screen.getByText('/home/user/workspace')).toBeInTheDocument();
	});

	it('shows "Offline" when disconnected', () => {
		const worker: Worker = {
			...baseWorker,
			connected: false,
		};

		render(<WorkerInfoPanel worker={worker} />);

		expect(screen.getByText('Workspace')).toBeInTheDocument();
		expect(screen.getByText('Offline')).toBeInTheDocument();
	});

	it('renders current task when assigned', () => {
		const worker: Worker = {
			...baseWorker,
			taskId: 'task-456',
			taskStartedAt: '2024-01-01T10:00:00Z',
		};

		render(<WorkerInfoPanel worker={worker} />);

		expect(screen.getByText('Current Task')).toBeInTheDocument();
		expect(screen.getByText('task-456')).toBeInTheDocument();
		expect(screen.getByText(/Started:/)).toBeInTheDocument();
	});

	it('does not render current task section when no task assigned', () => {
		render(<WorkerInfoPanel worker={baseWorker} />);

		expect(screen.queryByText('Current Task')).not.toBeInTheDocument();
	});

	it('renders version when available', () => {
		const worker: Worker = {
			...baseWorker,
			version: 5,
		};

		render(<WorkerInfoPanel worker={worker} />);

		expect(screen.getByText('Version')).toBeInTheDocument();
		expect(screen.getByText('5')).toBeInTheDocument();
	});

	it('renders busy state correctly', () => {
		const worker: Worker = {
			...baseWorker,
			state: 'busy',
		};

		render(<WorkerInfoPanel worker={worker} />);

		expect(screen.getByText('Busy')).toBeInTheDocument();
	});
});
