import { useCallback, useEffect, useRef, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { DashboardData } from '@shared';

import { dashboardService } from './DashboardService';

/**
 * ===========================================================================================
 * USE DASHBOARD HOOK - State Management & Polling
 * ===========================================================================================
 *
 * Responsibilities:
 * - Manage loading, error, and data states
 * - Implement polling with configurable interval
 * - Handle side effects (loading data on mount)
 * - Provide manual refresh capability
 * - Show loading only on initial load (not on polls)
 *
 * ===========================================================================================
 */

export interface UseDashboardParams {
	pollInterval?: number; // milliseconds, default 5000
	enabled?: boolean; // default true
}

export interface UseDashboardResult {
	// Data state
	data: DashboardData | null;
	loading: boolean;
	error: string | null;

	// Operations
	refresh: () => Promise<void>;
	clearError: () => void;
}

export function useDashboard(params?: UseDashboardParams): UseDashboardResult {
	const { pollInterval = 5000, enabled = true } = params || {};
	const [data, setData] = useState<DashboardData | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [isInitialLoad, setIsInitialLoad] = useState(true);

	// Track if component is mounted for cleanup
	const isMountedRef = useRef(true);

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
				console.log('[useDashboard] After fetch - signal.aborted:', signal.aborted, 'isMountedRef.current:', isMountedRef.current);
				if (!signal.aborted && isMountedRef.current) {
					console.log('[useDashboard] Setting data and isInitialLoad=false');
					setData(dashboardData);
					setIsInitialLoad(false);
				} else {
					console.log('[useDashboard] SKIPPED setting data because signal.aborted:', signal.aborted, 'or not mounted:', !isMountedRef.current);
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
				console.log('[useDashboard] Finally - signal.aborted:', signal.aborted, 'isMountedRef.current:', isMountedRef.current);
				if (!signal.aborted && isMountedRef.current) {
					console.log('[useDashboard] Setting loading=false');
					setLoading(false);
				} else {
					console.log('[useDashboard] SKIPPED setting loading=false because signal.aborted:', signal.aborted, 'or not mounted:', !isMountedRef.current);
				}
			}
		},
		[enabled, isInitialLoad]
	);

	/**
	 * Polling effect - refresh data at regular intervals
	 * Uses setInterval inside useEffect for cleanup
	 */
	useEffect(() => {
		if (!enabled || isInitialLoad) return;

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
			clearInterval(intervalId);
		};
	}, [enabled, isInitialLoad, pollInterval]);

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

		// Operations
		refresh,
		clearError,
	};
}
