import { useCallback, useEffect, useMemo, useState } from 'react';

import { B2F_TASKS_UPDATED, B2F_TICKET_COMMENT_ADDED, B2F_TICKET_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { ticketsApi } from './tickets.api';

interface UseTicketAuditCountState {
	count: number;
	loading: boolean;
}

/**
 * Hook for fetching and tracking the audit log entry count for a specific ticket.
 * Automatically refreshes when comments, tasks, or ticket updates occur via WebSocket events.
 */
export function useTicketAuditCount(ticketId: string): UseTicketAuditCountState {
	const [count, setCount] = useState(0);
	const [loading, setLoading] = useState(true);

	// Stable filter object -- prevents useRealtimeRefresh from re-subscribing on every render
	const ticketFilter = useMemo(() => ({ ticketId }), [ticketId]);

	const refresh = useCallback(async () => {
		try {
			setLoading(true);
			const response = await ticketsApi.getHistory(ticketId);
			setCount(response.entries.length);
		} catch (err) {
			console.error('Failed to fetch audit count:', err);
		} finally {
			setLoading(false);
		}
	}, [ticketId]);

	useEffect(() => {
		refresh();
	}, [refresh]);

	useRealtimeRefresh({
		events: [B2F_TICKET_COMMENT_ADDED, B2F_TICKET_UPDATED, B2F_TASKS_UPDATED],
		onEvent: refresh,
		filters: ticketFilter,
		logPrefix: 'useTicketAuditCount',
	});

	return { count, loading };
}
