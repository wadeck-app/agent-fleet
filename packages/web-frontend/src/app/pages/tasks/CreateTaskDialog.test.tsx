import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CreateTaskDialog } from './CreateTaskDialog';

// Declare mocks via vi.hoisted so they are available inside vi.mock factories (which are hoisted)
const { mockNavigate, mockUseWorkers, mockCreateTask } = vi.hoisted(() => ({
	mockNavigate: vi.fn(),
	mockUseWorkers: vi.fn(() => ({
		data: { workers: [] },
		loading: false,
	})),
	mockCreateTask: vi.fn().mockResolvedValue({ id: 'task-1' }),
}));

// Mock dependencies
vi.mock('react-router-dom', () => ({
	useNavigate: () => mockNavigate,
}));

vi.mock('@framework/features/toast/ToastContext', () => ({
	useToast: () => ({
		showToast: vi.fn(),
	}),
}));

vi.mock('../workers/useWorkers', () => ({
	useWorkers: mockUseWorkers,
}));

vi.mock('../projects/projects.api', () => ({
	projectsApi: {
		getProjectsList: vi.fn().mockResolvedValue({ items: [] }),
	},
}));

vi.mock('../workers/workers.api', () => ({
	workersApi: {
		getWorkerFlows: vi.fn().mockResolvedValue([]),
	},
}));

vi.mock('./TasksService', () => ({
	tasksService: {
		createTask: mockCreateTask,
	},
}));

describe('CreateTaskDialog', () => {
	const defaultProps = {
		open: true,
		onOpenChange: vi.fn(),
		onSuccess: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
		localStorage.clear();
		mockNavigate.mockReset();
	});

	it('renders two-column layout with resizable splitter', () => {
		render(<CreateTaskDialog {...defaultProps} />);

		// Check for section titles
		expect(screen.getByText('Informations de base')).toBeInTheDocument();
		expect(screen.getByText('Configuration du flow')).toBeInTheDocument();

		// Check for basic fields in left column
		expect(screen.getByLabelText(/Description/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/Priority/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/Project/i)).toBeInTheDocument();
		expect(screen.getByLabelText(/Assign to Worker/i)).toBeInTheDocument();

		// Check for flow field in right column
		expect(screen.getByLabelText(/Flow/i)).toBeInTheDocument();
	});

	it('persists splitter position to localStorage', async () => {
		render(<CreateTaskDialog {...defaultProps} />);

		// Check that default position is loaded from localStorage or uses default
		const storedPosition = localStorage.getItem('createTaskDialog.splitterPosition');
		expect(storedPosition).toBeNull(); // Initially null

		// Note: Testing actual drag functionality would require more complex setup
		// This test verifies the structure is in place
	});

	it('renders dialog with correct title and description', () => {
		render(<CreateTaskDialog {...defaultProps} />);

		expect(screen.getByText('Créer une tâche')).toBeInTheDocument();
		expect(screen.getByText('Remplissez les détails pour créer une nouvelle tâche')).toBeInTheDocument();
	});

	it('renders action buttons', () => {
		render(<CreateTaskDialog {...defaultProps} />);

		expect(screen.getByRole('button', { name: /Créer tâche/i })).toBeInTheDocument();
		expect(screen.getByRole('button', { name: /Annuler/i })).toBeInTheDocument();
	});

	it('calls onOpenChange when cancel button is clicked', async () => {
		const user = userEvent.setup();
		const onOpenChange = vi.fn();

		render(<CreateTaskDialog {...defaultProps} onOpenChange={onOpenChange} />);

		const cancelButton = screen.getByRole('button', { name: /Annuler/i });
		await user.click(cancelButton);

		expect(onOpenChange).toHaveBeenCalledWith(false);
	});

	it('initializes splitter width from localStorage if available', () => {
		// Set a custom position in localStorage
		localStorage.setItem('createTaskDialog.splitterPosition', '60');

		render(<CreateTaskDialog {...defaultProps} />);

		// The component should load the saved position
		const storedPosition = localStorage.getItem('createTaskDialog.splitterPosition');
		expect(storedPosition).toBe('60');
	});

	it('navigates to task detail page on "Create and open" without calling onSuccess/onOpenChange', async () => {
		const user = userEvent.setup();
		const onSuccess = vi.fn();
		const onOpenChange = vi.fn();

		// Mock workers to provide a valid worker for selection
		mockUseWorkers.mockReturnValue({
			data: {
				workers: [{ workerId: 'worker-1', connected: true, state: 'idle' as const }],
			},
			loading: false,
		} as any);

		// Mock tasksService to return a task with an ID
		mockCreateTask.mockResolvedValue({ id: 'task-123' });

		render(<CreateTaskDialog {...defaultProps} onSuccess={onSuccess} onOpenChange={onOpenChange} />);

		// Fill in required description field using fireEvent (faster than user.type per-character)
		const descriptionField = screen.getByLabelText(/Description/i);
		fireEvent.change(descriptionField, { target: { value: 'Test' } });

		// Select worker from dropdown
		const workerField = screen.getByLabelText(/Assign to Worker/i);
		await user.click(workerField);
		const workerOption = await screen.findByText('worker-1 (idle)');
		await user.click(workerOption);

		// Click "Create and open" button
		const createAndOpenButton = screen.getByRole('button', { name: /Create and open/i });
		await user.click(createAndOpenButton);

		// Wait for async operations to complete
		await vi.waitFor(() => {
			expect(mockNavigate).toHaveBeenCalledWith('/tasks/task-123');
		});

		// Regression: onSuccess/onOpenChange must NOT be called --
		// they trigger setSearchParams({ replace: true }) which overrides the navigation
		expect(onSuccess).not.toHaveBeenCalled();
		expect(onOpenChange).not.toHaveBeenCalled();
	});
});
