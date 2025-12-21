import type { DashboardData } from '@shared';

import { dashboardApi } from '@app/api/client';

/**
 * ===========================================================================================
 * DASHBOARD SERVICE - Business Logic Layer
 * ===========================================================================================
 *
 * Responsibilities:
 * - Encapsulate dashboard data fetching
 * - Provide a clean interface for the dashboard hook
 * - Future: Add data transformations or caching if needed
 *
 * ===========================================================================================
 */

export class DashboardServiceClient {
	/**
	 * Get dashboard data from the orchestrator
	 */
	async getDashboard(): Promise<DashboardData> {
		console.log('[DashboardService] getDashboard() called');
		const result = await dashboardApi.getDashboard();
		console.log('[DashboardService] getDashboard() result:', result);
		return result;
	}
}

// Export singleton instance
export const dashboardService = new DashboardServiceClient();
