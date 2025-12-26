import type { FlowsByProject } from '@shared/api/flows.contract';

import { flowsApi } from './flows.api';

/**
 * ===========================================================================================
 * FLOWS SERVICE
 * ===========================================================================================
 *
 * Business logic layer for flows.
 * Responsibilities:
 * - Call API endpoints
 * - Transform data if needed
 * - Handle errors
 *
 * Does NOT contain:
 * - React hooks (in useFlows)
 * - UI components
 *
 * ===========================================================================================
 */

export class FlowsService {
	/**
	 * Get all flows organized by project
	 */
	async getFlows(): Promise<FlowsByProject> {
		return flowsApi.getFlows();
	}
}

// Export singleton instance
export const flowsService = new FlowsService();
