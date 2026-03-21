import { useCallback, useEffect, useMemo, useState } from 'react';

import type { FlowProposal } from '@shared/api/flow-proposals.contract';
import { B2F_FLOW_PROPOSAL_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

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
	/** Full refresh — shows loading indicator, replaces all proposals. */
	refresh: () => void;
	/**
	 * Silent refresh — re-fetches proposals in the background without
	 * triggering isLoading=true. Preserves scroll position after review-thread
	 * updates (item O fix).
	 */
	refreshSilent: () => void;
}

export function useFlowProposals(ticketId: string): UseFlowProposalsResult {
	const [proposals, setProposals] = useState<FlowProposal[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);
	// Increment this counter to trigger a re-fetch
	const [refreshCounter, setRefreshCounter] = useState(0);
	// When true, next re-fetch skips setting isLoading=true
	const [isSilent, setIsSilent] = useState(false);

	useEffect(() => {
		const abortController = new AbortController();

		(async () => {
			try {
				if (!isSilent) {
					setIsLoading(true);
				}
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
					setIsSilent(false);
				}
			}
		})();

		return () => {
			abortController.abort();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [ticketId, refreshCounter]);

	const refresh = useCallback(() => {
		setIsSilent(false);
		setRefreshCounter(prev => prev + 1);
	}, []);

	const refreshSilent = useCallback(() => {
		setIsSilent(true);
		setRefreshCounter(prev => prev + 1);
	}, []);

	// Stable filter object — prevents useRealtimeRefresh from re-subscribing on every render
	const ticketFilter = useMemo(() => ({ ticketId }), [ticketId]);

	// Subscribe to proposal updates so the tab count badge refreshes automatically
	// when a redesign completes (B2F_FLOW_PROPOSAL_UPDATED fires from the backend).
	useRealtimeRefresh({
		events: [B2F_FLOW_PROPOSAL_UPDATED],
		onEvent: refresh,
		filters: ticketFilter,
		logPrefix: 'useFlowProposals',
	});

	const currentProposal = proposals.length > 0 ? proposals[0] : null;

	return { proposals, currentProposal, isLoading, error, refresh, refreshSilent };
}
