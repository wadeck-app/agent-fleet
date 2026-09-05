import { useCallback, useEffect, useMemo, useState } from 'react';

import type { Ticket } from '@shared/api/tickets.contract';
// B2F_TICKET_UPDATED -- single-ticket signal, filtered by ticketId server-side.
// Triggers a silent refresh so the detail page stays in sync (e.g. async AI title update).
import { B2F_TICKET_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { ticketsApi } from './tickets.api';

interface UseTicketState {
	ticket: Ticket | null;
	loading: boolean;
	error: Error | null;
	refresh: () => Promise<void>;
}

/**
 * Hook for fetching a single ticket by ID
 */
export function useTicket(id: string | undefined): UseTicketState {
	const [ticket, setTicket] = useState<Ticket | null>(null);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<Error | null>(null);

	// Initial load
	useEffect(() => {
		if (!id) {
			setTicket(null);
			setLoading(false);
			setError(null);
			return;
		}

		const abortController = new AbortController();

		(async () => {
			try {
				setLoading(true);
				setError(null);

				const fetchedTicket = await ticketsApi.getTicketById(id);

				if (!abortController.signal.aborted) {
					setTicket(fetchedTicket);
				}
			} catch (err) {
				if (!abortController.signal.aborted) {
					setError(err instanceof Error ? err : new Error('Failed to fetch ticket'));
				}
			} finally {
				if (!abortController.signal.aborted) {
					setLoading(false);
				}
			}
		})();

		return () => {
			abortController.abort();
		};
	}, [id]);

	// Stable filter object -- prevents useRealtimeRefresh from re-subscribing on every render
	const ticketFilter = useMemo(() => (id ? { ticketId: id } : undefined), [id]);

	// Silent refetch (for real-time updates) - doesn't show loading spinner
	const refresh = useCallback(async () => {
		if (!id) {
			return;
		}

		try {
			const fetchedTicket = await ticketsApi.getTicketById(id);
			setTicket(fetchedTicket);
		} catch (err) {
			console.error('Failed to refresh ticket:', err);
			// Silently fail - don't disrupt UX for background updates
		}
	}, [id]);

	// Subscribe to updates for this specific ticket (server-side filter by ticketId)
	useRealtimeRefresh({
		events: [B2F_TICKET_UPDATED],
		onEvent: refresh,
		filters: ticketFilter,
		logPrefix: 'useTicket',
	});

	return {
		ticket,
		loading,
		error,
		refresh,
	};
}
