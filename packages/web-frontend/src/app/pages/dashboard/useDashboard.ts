import { useCallback, useEffect, useRef, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { DashboardData } from '@shared/api/dashboard.contract';
import { B2F_TASKS_UPDATED, B2F_WORKERS_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';
import { useTransport } from '@/transport';

import { dashboardService } from './DashboardService';

/**
 * ===========================================================================================
 * USE DASHBOARD HOOK - State Management & Real-time Updates
 * ===========================================================================================
 *
 * Responsibilities:
 * - Manage loading, error, and data states
 * - Subscribe to real-time events (B2F_TASKS_UPDATED, B2F_WORKERS_UPDATED)
 * - Handle initial data load
 * - Provide manual refresh capability
 * - Show loading only on initial load
 *
 * Strategy:
 * - Subscribe to granular events (tasks/workers updated)
 * - Refresh dashboard data when events are received
 * - No polling - events only!
 *
 * ===========================================================================================
 */

export interface UseDashboardParams {
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
	const { enabled = true, useWebSocket = true } = params || {};
	const [data, setData] = useState<DashboardData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	// Track if component is mounted for cleanup
	const isMountedRef = useRef(true);

	// Get transport for connection state tracking
	const { connectionState } = useTransport();

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

	// Subscribe to real-time events: tasks and workers updates
	// When any task or worker changes, refresh the dashboard
	useRealtimeRefresh({
		events: [B2F_TASKS_UPDATED, B2F_WORKERS_UPDATED],
		onEvent: refresh,
		enabled: enabled && useWebSocket,
		logPrefix: 'Dashboard',
	});

	// Check if WebSocket is connected (convenience for return value)
	const wsConnected = connectionState === 'connected';

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

	// Polling removed! Dashboard now uses real-time events only (B2F_TASKS_UPDATED, B2F_WORKERS_UPDATED)

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
