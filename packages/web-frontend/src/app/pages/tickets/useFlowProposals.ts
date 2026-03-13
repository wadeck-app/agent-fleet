import { useCallback, useEffect, useState } from 'react';

import type { FlowProposal } from '@shared/api/flow-proposals.contract';

import { flowProposalsApi } from './flowProposalsApi';

/**
 * ===========================================================================================
 * USE FLOW PROPOSALS HOOK
 * ===========================================================================================
 *
 * Fetches flow proposals for a given ticket.
 * The currentProposal is the first item returned by the backend (sorted by version desc).
 *
 * ===========================================================================================
 */

export interface UseFlowProposalsResult {
	proposals: FlowProposal[];
	currentProposal: FlowProposal | null;
	isLoading: boolean;
	error: Error | null;
	refresh: () => void;
}

export function useFlowProposals(ticketId: string): UseFlowProposalsResult {
	const [proposals, setProposals] = useState<FlowProposal[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	// Increment this counter to trigger a re-fetch
	const [refreshCounter, setRefreshCounter] = useState(0);

	useEffect(() => {
		const abortController = new AbortController();

		(async () => {
			try {
				setIsLoading(true);
				setError(null);
				const result = await flowProposalsApi.getFlowProposals(ticketId);
				if (!abortController.signal.aborted) {
					setProposals(result.items);
				}
			} catch (err) {
				if (!abortController.signal.aborted) {
					setError(err instanceof Error ? err : new Error('Failed to fetch flow proposals'));
				}
			} finally {
				if (!abortController.signal.aborted) {
					setIsLoading(false);
				}
			}
		})();

		return () => {
			abortController.abort();
		};
	}, [ticketId, refreshCounter]);

	const refresh = useCallback(() => {
		setRefreshCounter(prev => prev + 1);
	}, []);

	const currentProposal = proposals.length > 0 ? proposals[0] : null;

	return { proposals, currentProposal, isLoading, error, refresh };
}
