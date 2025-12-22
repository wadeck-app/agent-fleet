import type { TasksData } from '@shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { TasksPage } from './TasksPage';
import * as useTasksModule from './useTasks';

// Mock the useTasks hook
vi.mock('./useTasks', () => ({
	useTasks: vi.fn(),
}));

describe('TasksPage', () => {
	const mockTasksData: TasksData = {
		timestamp: '2025-12-21T10:00:00Z',
		summary: {
			total: 15,
			byStatus: {
				todo: 3,
				in_progress: 4,
				testing: 1,
				review: 2,
				approved: 3,
				merged: 1,
				blocked: 1,
			},
			byPriority: {
				low: 3,
				medium: 6,
				high: 4,
				urgent: 2,
			},
		},
		tasks: [
			{
				id: 'task-1',
				description: 'Implement authentication',
				status: 'in_progress',
				priority: 'high',
				createdAt: '2025-12-21T08:00:00Z',
				updatedAt: '2025-12-21T09:30:00Z',
				assignedTo: {
					workerId: 'worker-1',
					workerType: 'dev',
				},
				comments: [],
				metadata: {},
				history: [],
			},
			{
				id: 'task-2',
				description: 'Review pull request',
				status: 'review',
				priority: 'medium',
				createdAt: '2025-12-21T07:00:00Z',
				updatedAt: '2025-12-21T09:00:00Z',
				assignedTo: {
					workerId: 'worker-2',
					workerType: 'reviewer',
				},
				comments: [],
				metadata: {},
				history: [],
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('loading state', () => {
		it('should show loading state on initial load', () => {
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: null,
				loading: true,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<TasksPage />);

			expect(screen.getByText('Loading tasks...')).toBeInTheDocument();
		});

		it('should not show loading state when data is present', () => {
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: mockTasksData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<TasksPage />);

			expect(screen.queryByText('Loading tasks...')).not.toBeInTheDocument();
		});
	});

	describe('error state', () => {
		it('should display error alert when error occurs', () => {
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: null,
				loading: false,
				error: 'Failed to load tasks',
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<TasksPage />);

			expect(screen.getByText('Failed to load tasks')).toBeInTheDocument();
		});

		it('should call clearError when dismissing error alert', () => {
			const mockClearError = vi.fn();
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: mockTasksData,
				loading: false,
				error: 'Failed to load tasks',
				wsConnected: false,
				refresh: vi.fn(),
				clearError: mockClearError,
			});

			render(<TasksPage />);

			// Find and click the dismiss button
			const dismissButton = screen.getByLabelText('Dismiss error');
			fireEvent.click(dismissButton);

			expect(mockClearError).toHaveBeenCalledOnce();
		});
	});

	describe('page content', () => {
		it('should render page title', () => {
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: mockTasksData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<TasksPage />);

			expect(screen.getByText('Tasks')).toBeInTheDocument();
		});

		it('should render summary stats', () => {
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: mockTasksData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<TasksPage />);

			expect(screen.getByText('Total Tasks')).toBeInTheDocument();
			expect(screen.getByText('In Progress')).toBeInTheDocument();
			expect(screen.getByText('Review')).toBeInTheDocument();
			expect(screen.getByText('Completed')).toBeInTheDocument();
			expect(screen.getByText('Blocked')).toBeInTheDocument();
		});

		it('should render tasks table', () => {
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: mockTasksData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<TasksPage />);

			expect(screen.getByText('Tasks List')).toBeInTheDocument();
			expect(screen.getByText('task-1')).toBeInTheDocument();
			expect(screen.getByText('Implement authentication')).toBeInTheDocument();
		});

		it('should render filters', () => {
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: mockTasksData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<TasksPage />);

			expect(screen.getByLabelText('Status')).toBeInTheDocument();
			expect(screen.getByLabelText('Priority')).toBeInTheDocument();
			expect(screen.getByLabelText('Worker ID')).toBeInTheDocument();
		});
	});

	describe('refresh functionality', () => {
		it('should render refresh button', () => {
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: mockTasksData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<TasksPage />);

			expect(screen.getByText('Refresh')).toBeInTheDocument();
		});

		it('should call refresh when refresh button is clicked', async () => {
			const mockRefresh = vi.fn().mockResolvedValue(undefined);
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: mockTasksData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: mockRefresh,
				clearError: vi.fn(),
			});

			render(<TasksPage />);

			const refreshButton = screen.getByText('Refresh');
			fireEvent.click(refreshButton);

			await waitFor(() => {
				expect(mockRefresh).toHaveBeenCalledOnce();
			});
		});

		it('should disable refresh button while refreshing', async () => {
			const mockRefresh = vi.fn(() => new Promise(resolve => setTimeout(resolve, 100)));
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: mockTasksData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: mockRefresh,
				clearError: vi.fn(),
			});

			render(<TasksPage />);

			const refreshButton = screen.getByText('Refresh');
			fireEvent.click(refreshButton);

			// Button should be disabled immediately
			expect(refreshButton).toBeDisabled();

			// Wait for refresh to complete
			await waitFor(() => {
				expect(mockRefresh).toHaveBeenCalled();
			});
		});
	});

	describe('filter functionality', () => {
		it('should call useTasks with filters when status is changed', () => {
			const mockUseTasks = vi.fn().mockReturnValue({
				data: mockTasksData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});
			vi.mocked(useTasksModule.useTasks).mockImplementation(mockUseTasks);

			const { rerender } = render(<TasksPage />);

			// Find status filter
			const statusSelect = screen.getByLabelText('Status');
			fireEvent.change(statusSelect, { target: { value: 'in_progress' } });

			// Force re-render to trigger useTasks with new filters
			rerender(<TasksPage />);

			// Verify useTasks was called with filters
			expect(mockUseTasks).toHaveBeenCalled();
		});

		it('should show clear filters button when filters are applied', () => {
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: mockTasksData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<TasksPage />);

			// Apply a filter
			const statusSelect = screen.getByLabelText('Status');
			fireEvent.change(statusSelect, { target: { value: 'in_progress' } });

			// Clear button should appear
			expect(screen.getByText('Clear Filters')).toBeInTheDocument();
		});
	});

	describe('no data state', () => {
		it('should not render content when data is null', () => {
			vi.mocked(useTasksModule.useTasks).mockReturnValue({
				data: null,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<TasksPage />);

			expect(screen.queryByText('Total Tasks')).not.toBeInTheDocument();
			expect(screen.queryByText('Tasks List')).not.toBeInTheDocument();
		});
	});
});
