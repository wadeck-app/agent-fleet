import type { DashboardData } from '@shared';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from './DashboardPage';
import * as useDashboardModule from './useDashboard';

// Mock the useDashboard hook
vi.mock('./useDashboard', () => ({
	useDashboard: vi.fn(),
}));

describe('DashboardPage', () => {
	const mockDashboardData: DashboardData = {
		timestamp: '2025-12-21T10:00:00Z',
		orchestrator: {
			status: 'ready',
			uptime: 3600000, // 1 hour
			version: '1.0.0',
		},
		workers: {
			connected: 5,
			idle: 3,
			busy: 2,
		},
		tasks: {
			total: 20,
			active: 5,
			review: 3,
			done: 10,
			blocked: 1,
			failed: 1,
		},
		throughput: {
			tasksPerHour: 12.5,
			successRate: 92,
			avgTaskDuration: 222000,
		},
		recentActivity: [
			{
				timestamp: '2025-12-21T09:58:00Z',
				type: 'task_completed',
				message: 'Completed flow execution',
				taskId: 'task-123',
				workerId: 'worker-1',
			},
			{
				timestamp: '2025-12-21T09:55:00Z',
				type: 'task_started',
				message: 'Started deployment',
				taskId: 'task-124',
				workerId: 'worker-2',
			},
		],
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('loading state', () => {
		it('should show loading state on initial load', () => {
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: null,
				loading: true,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<DashboardPage />);

			expect(screen.getByText('Loading dashboard...')).toBeInTheDocument();
		});

		it('should not show loading state when data is present', () => {
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: mockDashboardData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<DashboardPage />);

			expect(screen.queryByText('Loading dashboard...')).not.toBeInTheDocument();
		});
	});

	describe('error state', () => {
		it('should display error alert when error occurs', () => {
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: null,
				loading: false,
				error: 'Failed to load dashboard',
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<DashboardPage />);

			expect(screen.getByText('Failed to load dashboard')).toBeInTheDocument();
		});

		it('should call clearError when dismissing error alert', () => {
			const mockClearError = vi.fn();
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: mockDashboardData,
				loading: false,
				error: 'Failed to load dashboard',
				wsConnected: false,
				refresh: vi.fn(),
				clearError: mockClearError,
			});

			render(<DashboardPage />);

			// Find and click the dismiss button
			const dismissButton = screen.getByLabelText('Dismiss error');
			fireEvent.click(dismissButton);

			expect(mockClearError).toHaveBeenCalledOnce();
		});
	});

	describe('dashboard content', () => {
		it('should render page title', () => {
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: mockDashboardData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<DashboardPage />);

			expect(screen.getByText('Dashboard')).toBeInTheDocument();
		});

		it('should render all three dashboard cards', () => {
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: mockDashboardData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<DashboardPage />);

			expect(screen.getByText('Orchestrator Status')).toBeInTheDocument();
			expect(screen.getByText('Workers')).toBeInTheDocument();
			expect(screen.getByText('Tasks')).toBeInTheDocument();
		});

		it('should render orchestrator status data', () => {
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: mockDashboardData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<DashboardPage />);

			expect(screen.getByText('ready')).toBeInTheDocument();
			expect(screen.getByText('1h 0m')).toBeInTheDocument();
			expect(screen.getByText('1.0.0')).toBeInTheDocument();
		});

		it('should render workers data', () => {
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: mockDashboardData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<DashboardPage />);

			// Check for workers text labels to verify worker data is rendered
			expect(screen.getByText('Connected')).toBeInTheDocument();
			expect(screen.getByText('Idle')).toBeInTheDocument();
			expect(screen.getByText('Busy')).toBeInTheDocument();
		});

		it('should render tasks data', () => {
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: mockDashboardData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<DashboardPage />);

			expect(screen.getByText('20')).toBeInTheDocument();
			expect(screen.getByText('10')).toBeInTheDocument();
		});
	});

	describe('refresh functionality', () => {
		it('should render refresh button', () => {
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: mockDashboardData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<DashboardPage />);

			expect(screen.getByText('Refresh')).toBeInTheDocument();
		});

		it('should call refresh when refresh button is clicked', async () => {
			const mockRefresh = vi.fn().mockResolvedValue(undefined);
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: mockDashboardData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: mockRefresh,
				clearError: vi.fn(),
			});

			render(<DashboardPage />);

			const refreshButton = screen.getByText('Refresh');
			fireEvent.click(refreshButton);

			await waitFor(() => {
				expect(mockRefresh).toHaveBeenCalledOnce();
			});
		});

		it('should disable refresh button while refreshing', async () => {
			const mockRefresh = vi.fn((): Promise<void> => new Promise(resolve => setTimeout(resolve, 100)));
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: mockDashboardData,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: mockRefresh,
				clearError: vi.fn(),
			});

			render(<DashboardPage />);

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

	describe('no data state', () => {
		it('should not render cards when data is null', () => {
			vi.mocked(useDashboardModule.useDashboard).mockReturnValue({
				data: null,
				loading: false,
				error: null,
				wsConnected: false,
				refresh: vi.fn(),
				clearError: vi.fn(),
			});

			render(<DashboardPage />);

			expect(screen.queryByText('Orchestrator Status')).not.toBeInTheDocument();
			expect(screen.queryByText('Workers')).not.toBeInTheDocument();
			expect(screen.queryByText('Tasks')).not.toBeInTheDocument();
		});
	});
});
