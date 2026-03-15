import { useCallback, useEffect, useMemo, useState } from 'react';

import { B2F_TASKS_UPDATED, B2F_TICKET_COMMENT_ADDED, B2F_TICKET_UPDATED } from '@shared/transport';

import { useRealtimeRefresh } from '@/hooks/useRealtimeRefresh';

import { tasksApi } from '../tasks/tasks.api';
import { ticketsApi } from './tickets.api';

interface UseTicketActivityCountState {
	count: number;
	loading: boolean;
}

/**
 * Hook for fetching and tracking the combined activity count (comments + tasks) for a ticket.
 * Automatically refreshes when comments, tasks, or ticket updates occur via WebSocket events.
 */
export function useTicketActivityCount(ticketId: string): UseTicketActivityCountState {
	const [count, setCount] = useState(0);
	const [loading, setLoading] = useState(true);

	// Stable filter object — prevents useRealtimeRefresh from re-subscribing on every render
	const ticketFilter = useMemo(() => ({ ticketId }), [ticketId]);

	const refresh = useCallback(async () => {
		try {
			setLoading(true);
			const [commentsRes, tasksRes, historyRes] = await Promise.all([
				ticketsApi.getComments(ticketId),
				tasksApi.getTasksList({ ticketId, pageSize: 1 }),
				ticketsApi.getHistory(ticketId),
			]);
			const feedbackCount = historyRes.entries.filter(e => e.event === 'flow.feedback_submitted').length;
			setCount(commentsRes.comments.length + (tasksRes.pagination?.total ?? 0) + feedbackCount);
		} catch (err) {
			console.error('Failed to fetch activity count:', err);
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
		logPrefix: 'useTicketActivityCount',
	});

	return { count, loading };
}
