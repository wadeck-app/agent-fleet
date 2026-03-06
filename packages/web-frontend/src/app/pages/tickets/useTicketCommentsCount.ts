import { useCallback, useEffect, useMemo, useState } from 'react';

import { B2F_TICKET_COMMENT_ADDED, B2F_TICKET_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { ticketsApi } from './tickets.api';

interface UseTicketCommentsCountState {
	count: number;
	loading: boolean;
	error: Error | null;
	refresh: () => Promise<void>;
}

/**
 * Hook for fetching and tracking the comment count for a specific ticket.
 * Automatically refreshes when new comments are added via WebSocket events.
 */
export function useTicketCommentsCount(ticketId: string): UseTicketCommentsCountState {
	const [count, setCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	// Stable filter object — prevents useRealtimeRefresh from re-subscribing on every render
	const ticketFilter = useMemo(() => ({ ticketId }), [ticketId]);

	// Fetch comments count
	const refresh = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const response = await ticketsApi.getComments(ticketId);
			setCount(response.comments.length);
		} catch (err) {
			console.error('Failed to fetch comments count:', err);
			setError(err instanceof Error ? err : new Error('Failed to fetch comments count'));
		} finally {
			setLoading(false);
		}
	}, [ticketId]);

	// Initial load
	useEffect(() => {
		refresh();
	}, [refresh]);

	// Subscribe to comment additions and ticket updates for this specific ticket
	useRealtimeRefresh({
		events: [B2F_TICKET_COMMENT_ADDED, B2F_TICKET_UPDATED],
		onEvent: refresh,
		filters: ticketFilter,
		logPrefix: 'useTicketCommentsCount',
	});

	return {
		count,
		loading,
		error,
		refresh,
	};
}
