import { useCallback, useEffect, useMemo, useState } from 'react';

import { B2F_TICKET_COMMENT_ADDED, B2F_TICKET_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { ticketsApi } from './tickets.api';

interface UseTicketHistoryCountState {
	count: number;
	loading: boolean;
	error: Error | null;
	refresh: () => Promise<void>;
}

/**
 * Hook for fetching and tracking the history entry count for a specific ticket.
 * Automatically refreshes when the ticket is updated via WebSocket events.
 */
export function useTicketHistoryCount(ticketId: string): UseTicketHistoryCountState {
	const [count, setCount] = useState(0);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	// Stable filter object — prevents useRealtimeRefresh from re-subscribing on every render
	const ticketFilter = useMemo(() => ({ ticketId }), [ticketId]);

	// Fetch history count
	const refresh = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);
			const response = await ticketsApi.getHistory(ticketId);
			setCount(response.entries.length);
		} catch (err) {
			console.error('Failed to fetch history count:', err);
			setError(err instanceof Error ? err : new Error('Failed to fetch history count'));
		} finally {
			setLoading(false);
		}
	}, [ticketId]);

	// Initial load
	useEffect(() => {
		refresh();
	}, [refresh]);

	// Subscribe to ticket updates and comment additions (which add history entries)
	useRealtimeRefresh({
		events: [B2F_TICKET_UPDATED, B2F_TICKET_COMMENT_ADDED],
		onEvent: refresh,
		filters: ticketFilter,
		logPrefix: 'useTicketHistoryCount',
	});

	return {
		count,
		loading,
		error,
		refresh,
	};
}
