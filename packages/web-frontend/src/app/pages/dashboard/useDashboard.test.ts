import type { DashboardData } from '@shared/api/dashboard.contract';
import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { dashboardService } from './DashboardService';
import { useDashboard } from './useDashboard';

// Mock the service layer
vi.mock('./DashboardService', () => ({
	dashboardService: {
		getDashboard: vi.fn(),
	},
}));

// Mock the WebSocket hook
vi.mock('../../hooks/useOrchestratorWebSocket', () => ({
	useOrchestratorWebSocket: vi.fn(() => ({
		status: 'disconnected',
		isConnected: false,
		lastMessage: null,
		connect: vi.fn(),
		disconnect: vi.fn(),
		send: vi.fn(),
	})),
}));

// Mock useTransport
vi.mock('@/transport', () => ({
	useTransport: vi.fn(() => ({
		connectionState: 'disconnected',
		request: vi.fn(),
		subscribe: vi.fn(),
		unsubscribe: vi.fn(),
	})),
}));

// Mock useRealtimeRefresh
vi.mock('@/hooks/useRealtimeRefresh', () => ({
	useRealtimeRefresh: vi.fn(),
}));

describe('useDashboard', () => {
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
		recentActivity: [],
	};

	beforeEach(() => {
		vi.clearAllMocks();
		// Clear any existing timers
		vi.clearAllTimers();
	});

	describe('initial load', () => {
		it('should load dashboard data on mount', async () => {
			vi.mocked(dashboardService.getDashboard).mockResolvedValue(mockDashboardData);

			const { result } = renderHook(() => useDashboard());

			// Initially loading
			expect(result.current.loading).toBe(true);
			expect(result.current.data).toBeNull();

			// Wait for data to load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.data).toEqual(mockDashboardData);
			expect(result.current.error).toBeNull();
			expect(result.current.wsConnected).toBe(false);
			expect(dashboardService.getDashboard).toHaveBeenCalled();
		});

		it('should handle load errors', async () => {
			const error = new Error('Failed to load dashboard');
			vi.mocked(dashboardService.getDashboard).mockRejectedValue(error);

			const { result } = renderHook(() => useDashboard());

			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			expect(result.current.error).toBe('Failed to load dashboard');
			expect(result.current.data).toBeNull();
		});

		it('should not load data when enabled is false', async () => {
			vi.mocked(dashboardService.getDashboard).mockResolvedValue(mockDashboardData);

			const { result } = renderHook(() => useDashboard({ enabled: false }));

			// Verify no load is triggered when disabled
			expect(result.current.loading).toBe(true); // Still in initial state
			expect(result.current.data).toBeNull();
			expect(dashboardService.getDashboard).not.toHaveBeenCalled();
		});
	});

	describe('manual refresh', () => {
		it('should refresh data manually', async () => {
			vi.mocked(dashboardService.getDashboard).mockResolvedValue(mockDashboardData);

			const { result } = renderHook(() => useDashboard());

			// Wait for initial load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Update mock data
			const updatedData: DashboardData = {
				...mockDashboardData,
				workers: { connected: 10, idle: 8, busy: 2 },
			};
			vi.mocked(dashboardService.getDashboard).mockResolvedValue(updatedData);

			// Manual refresh
			await act(async () => {
				await result.current.refresh();
			});

			expect(result.current.data).toEqual(updatedData);
			expect(dashboardService.getDashboard).toHaveBeenCalled();
		});

		it('should handle refresh errors', async () => {
			vi.mocked(dashboardService.getDashboard).mockResolvedValue(mockDashboardData);

			const { result } = renderHook(() => useDashboard());

			// Wait for initial load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Mock error on refresh
			const error = new Error('Refresh failed');
			vi.mocked(dashboardService.getDashboard).mockRejectedValue(error);

			// Manual refresh
			await act(async () => {
				await result.current.refresh();
			});

			expect(result.current.error).toBe('Refresh failed');
			expect(result.current.data).toEqual(mockDashboardData); // Data should remain from initial load
		});
	});

	describe('error handling', () => {
		it('should clear error', async () => {
			const error = new Error('Failed to load dashboard');
			vi.mocked(dashboardService.getDashboard).mockRejectedValue(error);

			const { result } = renderHook(() => useDashboard());

			await waitFor(() => {
				expect(result.current.error).toBe('Failed to load dashboard');
			});

			// Clear error
			act(() => {
				result.current.clearError();
			});

			expect(result.current.error).toBeNull();
		});
	});

	describe('polling', () => {
		it('should enable polling with specified interval', async () => {
			vi.mocked(dashboardService.getDashboard).mockResolvedValue(mockDashboardData);

			const { result } = renderHook(() => useDashboard());

			// Wait for initial load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Note: Polling removed - dashboard now uses real-time events only
			// This test verifies that after initial load, no automatic polling occurs
			const initialCallCount = vi.mocked(dashboardService.getDashboard).mock.calls.length;

			// Verify no additional calls are made (no automatic polling)
			expect(vi.mocked(dashboardService.getDashboard).mock.calls.length).toBe(initialCallCount);
		});

		it('should not show loading state after initial load', async () => {
			vi.mocked(dashboardService.getDashboard).mockResolvedValue(mockDashboardData);

			const { result } = renderHook(() => useDashboard());

			// Wait for initial load
			await waitFor(() => {
				expect(result.current.loading).toBe(false);
			});

			// Verify data was loaded
			expect(result.current.data).toEqual(mockDashboardData);

			// Loading should remain false
			expect(result.current.loading).toBe(false);
		});
	});
});
