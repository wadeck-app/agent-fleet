import { useCallback, useEffect, useMemo, useState } from 'react';

import { B2F_TICKET_FEEDBACK_SUBMITTED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { feedbackApi } from './feedbackApi';

interface UseFlowFeedbackCountState {
	count: number;
	loading: boolean;
	error: Error | null;
	refresh: () => Promise<void>;
}

/**
 * Hook for fetching and tracking the feedback count for a specific flow proposal.
 * Automatically refreshes when new feedback is submitted via WebSocket events.
 */
export function useFlowFeedbackCount(
	flowId: string | undefined | null,
	ticketId?: string | undefined | null
): UseFlowFeedbackCountState {
	const [count, setCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	// WS event payload has ticketId, not flowId -- filter by ticketId for correct matching
	const filter = useMemo(() => (ticketId ? { ticketId } : {}), [ticketId]);

	const refresh = useCallback(async () => {
		if (!flowId) {
			setCount(0);
			setLoading(false);
			return;
		}
		try {
			setLoading(true);
			setError(null);
			const response = await feedbackApi.getFeedbackByFlow(flowId);
			setCount(response.items.length);
		} catch (err) {
			console.error('Failed to fetch feedback count:', err);
			setError(err instanceof Error ? err : new Error('Failed to fetch feedback count'));
		} finally {
			setLoading(false);
		}
	}, [flowId]);

	// Initial load
	useEffect(() => {
		refresh();
	}, [refresh]);

	// Subscribe to feedback submissions for auto-refresh
	useRealtimeRefresh({
		events: [B2F_TICKET_FEEDBACK_SUBMITTED],
		// eslint-disable-next-line @typescript-eslint/no-misused-promises
		onEvent: () => void refresh(),
		filters: filter,
		logPrefix: 'useFlowFeedbackCount',
	});

	return {
		count,
		loading,
		error,
		refresh,
	};
}
