import { useCallback, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Intervention, InterventionResponseSubmit } from '@shared/api/interventions.contract';

import { interventionsApi } from '../pages/interventions/interventions.api';

/**
 * ===========================================================================================
 * USE INTERVENTION DETAIL - Intervention Detail Data Management Hook
 * ===========================================================================================
 *
 * Manages data fetching and submission for a single intervention detail page.
 * Eliminates direct API calls from the page component and provides clean state management.
 *
 * Features:
 * - Race condition protection via useAbortableEffect
 * - Centralized error handling
 * - Loading state management
 * - Intervention response submission
 *
 * Problem Solved:
 * Pages should not contain direct API calls, manual loading/error state management,
 * or business logic. This hook extracts all of that into a reusable, testable unit.
 *
 * Example usage:
 * ```typescript
 * const { intervention, loading, error, submitResponse } = useInterventionDetail(id);
 *
 * useErrorToast({ error, clearError: () => {} });
 *
 * if (loading) return <LoadingState />;
 * if (!intervention) return <EmptyState />;
 *
 * return <InterventionDisplay intervention={intervention} onSubmit={submitResponse} />;
 * ```
 *
 * ===========================================================================================
 */

export interface UseInterventionDetailOptions {
	/**
	 * The intervention ID to fetch
	 */
	interventionId: string | undefined;

	/**
	 * Callback invoked after successful submission
	 */
	onSuccess?: () => void;

	/**
	 * Callback invoked when submission fails
	 */
	onError?: (error: string) => void;
}

export interface UseInterventionDetailResult {
	/**
	 * The fetched intervention data, or null if not found/loading
	 */
	intervention: Intervention | null;

	/**
	 * Whether the intervention is currently being fetched
	 */
	loading: boolean;

	/**
	 * Error message if fetch failed, null otherwise
	 */
	error: string | null;

	/**
	 * Whether a response is currently being submitted
	 */
	submitting: boolean;

	/**
	 * Submit a response to the intervention
	 */
	submitResponse: (approved: boolean, comment?: string) => Promise<void>;

	/**
	 * Clear the current error state
	 */
	clearError: () => void;
}

/**
 * Hook for managing intervention detail data and submission
 *
 * @param options - Configuration options
 * @returns Intervention data, loading/error states, and submission function
 *
 * @example
 * ```typescript
 * // Basic usage
 * const { intervention, loading, error, submitResponse } = useInterventionDetail({
 *   interventionId: id,
 *   onSuccess: () => navigate('/interventions')
 * });
 *
 * // With error handling
 * const { intervention, loading, error, submitResponse, clearError } = useInterventionDetail({
 *   interventionId: id
 * });
 * useErrorToast({ error, clearError });
 * ```
 */
export function useInterventionDetail({
	interventionId,
	onSuccess,
	onError,
}: UseInterventionDetailOptions): UseInterventionDetailResult {
	const [intervention, setIntervention] = useState<Intervention | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [submitting, setSubmitting] = useState(false);

	const clearError = useCallback(() => {
		setError(null);
	}, []);

	// Fetch intervention data with race condition protection
	useAbortableEffect(
		async signal => {
			if (!interventionId) {
				setLoading(false);
				return;
			}

			try {
				setLoading(true);
				setError(null);

				const data = await interventionsApi.getIntervention(interventionId);

				if (!signal.aborted) {
					setIntervention(data);
				}
			} catch (err) {
				if (!signal.aborted) {
					setError(getErrorMessage(err));
				}
			} finally {
				if (!signal.aborted) {
					setLoading(false);
				}
			}
		},
		[interventionId]
	);

	// Submit response to intervention
	const submitResponse = useCallback(
		async (approved: boolean, comment?: string) => {
			if (!interventionId) return;

			setSubmitting(true);
			setError(null);

			try {
				const response: InterventionResponseSubmit = {
					value: approved,
					comment: comment || undefined,
				};

				await interventionsApi.respondToIntervention(interventionId, response);

				// Call success callback if provided
				onSuccess?.();
			} catch (err) {
				const errorMessage = getErrorMessage(err);
				setError(errorMessage);

				// Call error callback if provided
				onError?.(errorMessage);
			} finally {
				setSubmitting(false);
			}
		},
		[interventionId, onSuccess, onError]
	);

	return {
		intervention,
		loading,
		error,
		submitting,
		submitResponse,
		clearError,
	};
}
