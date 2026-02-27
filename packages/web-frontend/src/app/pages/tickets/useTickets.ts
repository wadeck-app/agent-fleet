import { useCallback, useState } from 'react';

import { useAbortableEffect } from '@framework/hooks/useAbortableEffect';
import { getErrorMessage } from '@framework/utils/errors/errorUtils';
import type { Ticket, TicketsQuery } from '@shared/api/tickets.contract';

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

	return {
		tickets,
		loading,
		error,
		reload: loadTickets,
	};
}
