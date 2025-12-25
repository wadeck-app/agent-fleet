import { useCallback, useEffect, useRef, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { DashboardData } from '@shared/api/dashboard.contract';
import { B2F_DASHBOARD_UPDATED } from '@shared/transport';

import { useTransport } from '@/transport';

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

	// Get transport for WebSocket events and connection state
	const { transport, connectionState } = useTransport();

	/**
	 * WebSocket connection for real-time updates via backend transport
	 */
	const handleDashboardEvent = useCallback((dashboardData: DashboardData) => {
		if (isMountedRef.current) {
			console.log('[useDashboard] Received dashboard update via WebSocket');
			setData(dashboardData);
			setError(null);
		}
	}, []);

	// Subscribe to dashboard events via backend WebSocket
	useEffect(() => {
		if (!enabled || !useWebSocket) return;

		console.log('[useDashboard] Subscribing to dashboard updates');
		const unsubscribe = transport.subscribe(B2F_DASHBOARD_UPDATED, handleDashboardEvent);

		return () => {
			console.log('[useDashboard] Unsubscribing from dashboard updates');
			unsubscribe();
		};
	}, [enabled, useWebSocket, transport, handleDashboardEvent]);

	// Check if WebSocket is connected (convenience for return value)
	const wsConnected = connectionState === 'connected';

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
	 * Only active when WebSocket has failed or is not used (fallback mode)
	 * Does NOT poll during 'reconnecting' state to respect exponential backoff
	 * Uses setInterval inside useEffect for cleanup
	 */
	useEffect(() => {
		// Don't poll if:
		// - Not enabled
		// - Still doing initial load
		// - WebSocket is not used
		if (!enabled || isInitialLoad || !useWebSocket) {
			return;
		}

		// Don't poll if WebSocket is connected or trying to reconnect
		// Only poll if WebSocket has given up ('error') or is disabled ('disconnected' without reconnect)
		if (connectionState === 'connected' || connectionState === 'connecting' || connectionState === 'reconnecting') {
			console.log(`[useDashboard] Waiting for WebSocket (state: ${connectionState})`);
			return;
		}

		console.log('[useDashboard] Starting REST polling (WebSocket failed or unavailable)');
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
			console.log('[useDashboard] Stopping REST polling');
			clearInterval(intervalId);
		};
	}, [enabled, isInitialLoad, pollInterval, useWebSocket, connectionState]);

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
