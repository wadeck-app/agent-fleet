import { useCallback, useEffect, useRef, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { DashboardData } from '@shared';

import { type WebSocketMessage, useOrchestratorWebSocket } from '@/app/hooks/useOrchestratorWebSocket';

import { dashboardService } from './DashboardService';

/**
 * ===========================================================================================
 * USE DASHBOARD HOOK - State Management & Real-time Updates
 * ===========================================================================================
 *
 * Responsibilities:
 * - Manage loading, error, and data states
 * - Connect to WebSocket for real-time updates
 * - Fall back to polling when WebSocket is disconnected
 * - Handle side effects (loading data on mount)
 * - Provide manual refresh capability
 * - Show loading only on initial load (not on polls)
 *
 * Strategy:
 * - When WebSocket connected: Use real-time state_update messages
 * - When WebSocket disconnected: Fall back to polling (5s interval)
 * - On reconnection: Resume real-time updates
 *
 * ===========================================================================================
 */

export interface UseDashboardParams {
	pollInterval?: number; // milliseconds, default 5000
	enabled?: boolean; // default true
	useWebSocket?: boolean; // default true
}

export interface UseDashboardResult {
	// Data state
	data: DashboardData | null;
	loading: boolean;
	error: string | null;

	// WebSocket connection status
	wsConnected: boolean;

	// Operations
	refresh: () => Promise<void>;
	clearError: () => void;
}

export function useDashboard(params?: UseDashboardParams): UseDashboardResult {
	const { pollInterval = 5000, enabled = true, useWebSocket = true } = params || {};
	const [data, setData] = useState<DashboardData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	// Track if component is mounted for cleanup
	const isMountedRef = useRef(true);

	/**
	 * WebSocket connection for real-time updates
	 */
	const handleWebSocketMessage = useCallback((message: WebSocketMessage) => {
		// Validate that the message contains DashboardData structure
		const isValidDashboardData = (data: unknown): data is DashboardData => {
			if (!data || typeof data !== 'object') return false;
			const obj = data as Record<string, unknown>;

			// Check timestamp
			if (typeof obj.timestamp !== 'string') return false;

			// Check orchestrator object
			if (!obj.orchestrator || typeof obj.orchestrator !== 'object') return false;
			const orchestrator = obj.orchestrator as Record<string, unknown>;
			if (
				typeof orchestrator.status !== 'string' ||
				typeof orchestrator.uptime !== 'number' ||
				typeof orchestrator.version !== 'string'
			)
				return false;

			// Check workers object
			if (!obj.workers || typeof obj.workers !== 'object') return false;
			const workers = obj.workers as Record<string, unknown>;
			if (
				typeof workers.connected !== 'number' ||
				typeof workers.idle !== 'number' ||
				typeof workers.busy !== 'number'
			)
				return false;

			// Check tasks object
			if (!obj.tasks || typeof obj.tasks !== 'object') return false;
			const tasks = obj.tasks as Record<string, unknown>;
			if (
				typeof tasks.total !== 'number' ||
				typeof tasks.active !== 'number' ||
				typeof tasks.review !== 'number' ||
				typeof tasks.done !== 'number' ||
				typeof tasks.blocked !== 'number' ||
				typeof tasks.failed !== 'number'
			)
				return false;

			// Check throughput object
			if (!obj.throughput || typeof obj.throughput !== 'object') return false;
			const throughput = obj.throughput as Record<string, unknown>;
			if (
				typeof throughput.tasksPerHour !== 'number' ||
				typeof throughput.successRate !== 'number' ||
				typeof throughput.avgTaskDuration !== 'number'
			)
				return false;

			// Check recentActivity array
			if (!Array.isArray(obj.recentActivity)) return false;

			return true;
		};

		// Handle state_update messages
		if (message.type === 'state_update' && isMountedRef.current) {
			console.log('[useDashboard] Received state_update via WebSocket');
			if (isValidDashboardData(message.data)) {
				setData(message.data);
				setError(null);
			} else {
				console.log('[useDashboard] state_update does not contain dashboard data - ignoring');
			}
		}
		// Handle snapshot messages (full state)
		else if (message.type === 'snapshot' && isMountedRef.current) {
			console.log('[useDashboard] Received snapshot via WebSocket');
			if (isValidDashboardData(message.data)) {
				setData(message.data);
				setError(null);
			} else {
				console.log('[useDashboard] snapshot does not contain dashboard data - ignoring');
			}
		}
		// Handle error messages
		else if (message.type === 'error' && isMountedRef.current) {
			console.error('[useDashboard] Received error via WebSocket:', message);
			const errorMessage = (message.message as string) || 'WebSocket error received';
			setError(errorMessage);
		}
	}, []);

	const { isConnected: wsConnected } = useOrchestratorWebSocket({
		enabled: enabled && useWebSocket,
		onMessage: handleWebSocketMessage,
	});

	/**
	 * Manual refresh capability
	 */
	const refresh = useCallback(async () => {
		try {
			setError(null);
			const dashboardData = await dashboardService.getDashboard();
			if (isMountedRef.current) {
				setData(dashboardData);
			}
		} catch (err: unknown) {
			if (isMountedRef.current) {
				const message = getErrorMessage(err) || 'Failed to load dashboard';
				setError(message);
				console.error('Error refreshing dashboard:', err);
			}
		}
	}, []);

	/**
	 * Clear the current error
	 */
	const clearError = useCallback(() => {
		setError(null);
	}, []);

	/**
	 * Initial data load
	 * Uses useAbortableEffect to cancel stale requests
	 */
	useAbortableEffect(
		async signal => {
			console.log('[useDashboard] useAbortableEffect called', { enabled, isInitialLoad });
			if (!enabled) {
				console.log('[useDashboard] Disabled, returning');
				return;
			}

			try {
				// Show loading only on initial load
				if (isInitialLoad) {
					console.log('[useDashboard] Setting loading=true');
					setLoading(true);
				}
				setError(null);

				console.log('[useDashboard] Calling dashboardService.getDashboard()...');
				const dashboardData = await dashboardService.getDashboard();
				console.log('[useDashboard] Received data:', dashboardData);

				// Only update state if request wasn't aborted
				console.log(
					'[useDashboard] After fetch - signal.aborted:',
					signal.aborted,
					'isMountedRef.current:',
					isMountedRef.current
				);
				if (!signal.aborted && isMountedRef.current) {
					console.log('[useDashboard] Setting data and isInitialLoad=false');
					setData(dashboardData);
					setIsInitialLoad(false);
				} else {
					console.log(
						'[useDashboard] SKIPPED setting data because signal.aborted:',
						signal.aborted,
						'or not mounted:',
						!isMountedRef.current
					);
				}
			} catch (err) {
				console.error('[useDashboard] Error caught:', err);
				// Ignore aborted requests
				if (!signal.aborted && isMountedRef.current) {
					const message = getErrorMessage(err) || 'Failed to load dashboard';
					setError(message);
					console.error('Error loading dashboard:', err);
				}
			} finally {
				console.log(
					'[useDashboard] Finally - signal.aborted:',
					signal.aborted,
					'isMountedRef.current:',
					isMountedRef.current
				);
				if (!signal.aborted && isMountedRef.current) {
					console.log('[useDashboard] Setting loading=false');
					setLoading(false);
				} else {
					console.log(
						'[useDashboard] SKIPPED setting loading=false because signal.aborted:',
						signal.aborted,
						'or not mounted:',
						!isMountedRef.current
					);
				}
			}
		},
		[enabled, isInitialLoad]
	);

	/**
	 * Polling effect - refresh data at regular intervals
	 * Only active when WebSocket is NOT connected (fallback mode)
	 * Uses setInterval inside useEffect for cleanup
	 */
	useEffect(() => {
		// Don't poll if:
		// - Not enabled
		// - Still doing initial load
		// - WebSocket is connected (real-time updates active)
		if (!enabled || isInitialLoad || wsConnected) {
			return;
		}

		console.log('[useDashboard] Starting polling (WebSocket disconnected)');
		const intervalId = setInterval(async () => {
			try {
				const dashboardData = await dashboardService.getDashboard();
				if (isMountedRef.current) {
					setData(dashboardData);
				}
			} catch (err: unknown) {
				if (isMountedRef.current) {
					const message = getErrorMessage(err) || 'Failed to poll dashboard';
					setError(message);
					console.error('Error polling dashboard:', err);
				}
			}
		}, pollInterval);

		// Cleanup interval on unmount or when dependencies change
		return () => {
			console.log('[useDashboard] Stopping polling');
			clearInterval(intervalId);
		};
	}, [enabled, isInitialLoad, pollInterval, wsConnected]);

	/**
	 * Cleanup on unmount
	 */
	useEffect(() => {
		isMountedRef.current = true;
		return () => {
			isMountedRef.current = false;
		};
	}, []);

	return {
		// Data state
		data,
		loading,
		error,

		// WebSocket connection status
		wsConnected,

		// Operations
		refresh,
		clearError,
	};
}
