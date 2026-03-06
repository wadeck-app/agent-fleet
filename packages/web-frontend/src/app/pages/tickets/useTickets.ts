import { useCallback, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Ticket, TicketsQuery } from '@shared/api/tickets.contract';
// B2F_TICKETS_UPDATED — list-level signal: ticket created, deleted, reordered, or a
// list-visible field (title/status/labels) changed. Subscribe here so the list
// stays in sync without the page needing to know about individual ticket events.
import { B2F_TICKETS_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { ticketsApi } from './tickets.api';

/**
 * ===========================================================================================
 * USE TICKETS HOOK
 * ===========================================================================================
 *
 * Hook for fetching tickets list with race condition protection.
 * Handles loading states and data fetching.
 *
 * ===========================================================================================
 */

export interface UseTicketsResult {
	tickets: Ticket[];
	loading: boolean;
	error: string | null;
	reload: () => Promise<void>;
	refresh: () => Promise<void>;
}

export function useTickets(query?: TicketsQuery): UseTicketsResult {
	const [tickets, setTickets] = useState<Ticket[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	// Serialize query to avoid infinite re-renders from object reference changes
	const queryKey = JSON.stringify(query || {});

	const loadTickets = useCallback(async () => {
		try {
			setLoading(true);
			setError(null);

			const response = await ticketsApi.getTicketsList(query);
			setTickets(response.items);
		} catch (err) {
			setError(getErrorMessage(err));
		} finally {
			setLoading(false);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [queryKey]);

	// Initial load with race condition protection
	useAbortableEffect(
		async _signal => {
			await loadTickets();
		},
		[loadTickets]
	);

	const refreshTickets = useCallback(async () => {
		try {
			const response = await ticketsApi.getTicketsList(query);
			setTickets(response.items);
		} catch {
			// silent – stale data stays visible
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [queryKey]);

	// Auto-refresh when the list changes (create, delete, reorder, list-visible field update)
	useRealtimeRefresh({
		events: [B2F_TICKETS_UPDATED],
		onEvent: refreshTickets,
		logPrefix: 'useTickets',
	});

	return {
		tickets,
		loading,
		error,
		reload: loadTickets,
		refresh: refreshTickets,
	};
}
