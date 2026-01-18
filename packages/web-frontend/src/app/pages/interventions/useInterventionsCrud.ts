import { useCallback, useState } from 'react';

import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { BulkCancelResponse } from '@shared/api/interventions.contract';

import { interventionsApi } from './interventions.api';

/**
 * ===========================================================================================
 * USE INTERVENTIONS CRUD HOOK - CRUD Operations Only (No Data Fetching)
 * ===========================================================================================
 *
 * Responsibilities:
 * - Provide CRUD operations (cancel, bulkCancel)
 * - Track operation-specific states (operationError)
 * - NO automatic data fetching (Data2 handles that)
 *
 * Benefits:
 * - Clean separation: Data2 handles fetching, this hook handles mutations
 * - Avoids double fetching when used with Data2
 * - Reusable across different pages (table, cards, etc.)
 * - Operations can trigger Data2 refresh via cache control
 *
 * Usage:
 * ```tsx
 * const { cancelIntervention, bulkCancelInterventions } = useInterventionsCrud();
 *
 * // After mutation, refresh Data2 via cache control
 * await cancelIntervention(id);
 * cache.actions.refresh(); // Triggers Data2 refetch
 * ```
 *
 * ===========================================================================================
 */

export interface UseInterventionsCrudResult {
	// Operations
	cancelIntervention: (id: string) => Promise<void>;
	bulkCancelInterventions: (ids: string[]) => Promise<BulkCancelResponse>;

	// Operation states
	operationError: string | null;
	clearOperationError: () => void;
}

export function useInterventionsCrud(): UseInterventionsCrudResult {
	const [operationError, setOperationError] = useState<string | null>(null);

	/**
	 * Cancel an intervention
	 */
	const cancelIntervention = async (id: string) => {
		try {
			setOperationError(null);
			await interventionsApi.cancelIntervention(id);
			// Caller should trigger Data2 refresh via cache.actions.refresh()
		} catch (err: unknown) {
			const message = getErrorMessage(err) || 'Failed to cancel intervention';
			setOperationError(message);
			console.error('Error cancelling intervention:', err);
			throw err;
		}
	};

	/**
	 * Bulk cancel interventions
	 */
	const bulkCancelInterventions = useCallback(async (ids: string[]) => {
		const result = await interventionsApi.bulkCancelInterventions(ids);
		// Caller should trigger Data2 refresh via cache.actions.refresh()
		return result;
	}, []);

	/**
	 * Clear the current operation error
	 */
	const clearOperationError = () => {
		setOperationError(null);
	};

	return {
		// Operations
		cancelIntervention,
		bulkCancelInterventions,

		// Operation states
		operationError,
		clearOperationError,
	};
}
